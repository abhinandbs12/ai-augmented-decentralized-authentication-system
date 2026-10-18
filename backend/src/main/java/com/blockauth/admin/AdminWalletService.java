package com.blockauth.admin;

import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.blockauth.audit.AuditService;
import com.blockauth.audit.AuthEventStatus;
import com.blockauth.audit.AuthEventType;
import com.blockauth.audit.ClientInfo;
import com.blockauth.auth.StepUpAction;
import com.blockauth.auth.StepUpDetails;
import com.blockauth.auth.StepUpProof;
import com.blockauth.auth.StepUpService;
import com.blockauth.blockchain.OnChainWalletStatus;
import com.blockauth.blockchain.WalletRegistryClient;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;
import com.blockauth.common.WalletAddresses;
import com.blockauth.security.BlockAuthPrincipal;
import com.blockauth.session.SessionEndReason;
import com.blockauth.session.SessionRegistry;
import com.blockauth.user.User;
import com.blockauth.user.UserService;
import com.blockauth.user.UserStatus;

/**
 * Wallet status changes on the blockchain. Revoking takes effect at once and needs a fresh signature;
 * reactivating is requested as a delayed action and carried out here once its waiting period is over.
 * Always chain first, then the database mirror, then the audit log.
 */
@Service
public class AdminWalletService {

	private static final Logger log = LoggerFactory.getLogger(AdminWalletService.class);

	public record WalletChangeResponse(String walletAddress, UserStatus status, String transactionHash) {
	}

	private final WalletRegistryClient registry;
	private final UserService users;
	private final AuditService audit;
	private final StepUpService stepUp;
	private final SessionRegistry sessions;

	public AdminWalletService(WalletRegistryClient registry, UserService users, AuditService audit,
			StepUpService stepUp, SessionRegistry sessions) {
		this.registry = registry;
		this.users = users;
		this.audit = audit;
		this.stepUp = stepUp;
		this.sessions = sessions;
	}

	/** Revokes the wallet on-chain and ends every open session of its user. */
	public WalletChangeResponse revoke(BlockAuthPrincipal admin, String address, StepUpProof proof, ClientInfo client) {
		String wallet = notOwn(admin, address);
		OnChainWalletStatus status = users.chainStatus(wallet);
		if (!status.registered()) {
			throw new BlockAuthException(ErrorCode.WALLET_NOT_FOUND);
		}
		if (!status.active()) {
			throw new BlockAuthException(ErrorCode.WALLET_ALREADY_REVOKED);
		}
		stepUp.verify(admin, StepUpAction.REVOKE_WALLET, StepUpDetails.wallet(wallet), proof, client);

		String txHash;
		try {
			txHash = registry.revokeWallet(wallet);
		}
		catch (BlockAuthException e) {
			// Reverted: a concurrent admin action may already have reached the target state.
			if (e.code() == ErrorCode.BLOCKCHAIN_TX_FAILED && !users.chainStatus(wallet).active()) {
				throw new BlockAuthException(ErrorCode.WALLET_ALREADY_REVOKED);
			}
			// A transaction that was sent but not confirmed in time can still be mined later. The attempt
			// is recorded so the log can say who sent it; it carries no user id, so the wallet's own
			// history keeps listing confirmed changes only.
			audit.recordAuthEvent(AuthEventType.WALLET_REVOKED, AuthEventStatus.FAILURE, wallet, null, admin.userId(),
					e.code(), client);
			throw e;
		}

		Optional<User> user = users.setStatus(wallet, UserStatus.REVOKED);
		user.ifPresent(u -> sessions.endAllForUser(u.getId(), SessionEndReason.WALLET_REVOKED));
		audit.recordAuthEvent(AuthEventType.WALLET_REVOKED, AuthEventStatus.SUCCESS, wallet,
				user.map(User::getId).orElse(null), admin.userId(), null, client);
		log.info("Wallet {} set to REVOKED by admin {} (tx {})", wallet, admin.walletAddress(), txHash);
		return new WalletChangeResponse(WalletAddresses.checksum(wallet), UserStatus.REVOKED, txHash);
	}

	/**
	 * Checks that a reactivation can be requested now. @return the normalized wallet
	 * @throws BlockAuthException CANNOT_MODIFY_OWN_WALLET, WALLET_NOT_FOUND or WALLET_ALREADY_ACTIVE
	 */
	String checkCanActivate(BlockAuthPrincipal admin, String address) {
		String wallet = notOwn(admin, address);
		OnChainWalletStatus status = users.chainStatus(wallet);
		if (!status.registered()) {
			throw new BlockAuthException(ErrorCode.WALLET_NOT_FOUND);
		}
		if (status.active()) {
			throw new BlockAuthException(ErrorCode.WALLET_ALREADY_ACTIVE);
		}
		return wallet;
	}

	/**
	 * Carries out a reactivation whose waiting period is over. Safe to run again: a wallet the chain
	 * already shows as active is left alone.
	 */
	void executeActivation(String wallet, UUID requestedBy, String requesterWallet) {
		OnChainWalletStatus status = users.chainStatus(wallet);
		if (!status.registered()) {
			throw new BlockAuthException(ErrorCode.WALLET_NOT_FOUND);
		}
		if (status.active()) {
			return;
		}
		String txHash;
		try {
			txHash = registry.activateWallet(wallet);
		}
		catch (BlockAuthException e) {
			if (e.code() == ErrorCode.BLOCKCHAIN_TX_FAILED && users.chainStatus(wallet).active()) {
				return;
			}
			throw e;
		}
		UUID userId = users.setStatus(wallet, UserStatus.ACTIVE).map(User::getId).orElse(null);
		audit.recordAuthEvent(AuthEventType.WALLET_ACTIVATED, AuthEventStatus.SUCCESS, wallet, userId, requestedBy,
				null, new ClientInfo(null, null));
		log.info("Wallet {} set to ACTIVE, requested by admin {} (tx {})", wallet, requesterWallet, txHash);
	}

	private static String notOwn(BlockAuthPrincipal admin, String address) {
		String wallet = WalletAddresses.normalize(address, "address");
		if (wallet.equals(admin.walletAddress())) {
			throw new BlockAuthException(ErrorCode.CANNOT_MODIFY_OWN_WALLET);
		}
		return wallet;
	}

}
