package com.blockauth.auth;

import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.blockauth.admin.EmergencyStopService;
import com.blockauth.audit.AuditService;
import com.blockauth.audit.AuthEventStatus;
import com.blockauth.audit.AuthEventType;
import com.blockauth.audit.ClientInfo;
import com.blockauth.blockchain.OnChainWalletStatus;
import com.blockauth.blockchain.WalletRegistryClient;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;
import com.blockauth.common.WalletAddresses;
import com.blockauth.user.User;
import com.blockauth.user.UserService;
import com.blockauth.user.UserService.WalletState;
import com.blockauth.user.UserStatus;

@Service
public class RegistrationService {

	private static final Logger log = LoggerFactory.getLogger(RegistrationService.class);

	private final ChallengeService challenges;
	private final SignatureVerifier signatures;
	private final WalletRegistryClient registry;
	private final UserService users;
	private final AuditService audit;
	private final AuthFailureRecorder failures;
	private final EmergencyStopService stop;

	public RegistrationService(ChallengeService challenges, SignatureVerifier signatures,
			WalletRegistryClient registry, UserService users, AuditService audit, AuthFailureRecorder failures,
			EmergencyStopService stop) {
		this.challenges = challenges;
		this.signatures = signatures;
		this.registry = registry;
		this.users = users;
		this.audit = audit;
		this.failures = failures;
		this.stop = stop;
	}

	/**
	 * Registers the wallet on-chain (from the operator account) once the caller has proven ownership,
	 * then creates the user row. The chain is written first and is authoritative, so re-running after
	 * a partial failure converges instead of duplicating anything. No session is created.
	 */
	public AuthController.RegistrationResponse register(AuthController.SignedChallenge request, ClientInfo client) {
		String wallet = WalletAddresses.normalize(request.walletAddress(), "walletAddress");
		try {
			stop.requireInactive();
			AuthenticationChallenge challenge = challenges.consume(request.challenge(), wallet,
					ChallengePurpose.REGISTRATION);
			signatures.verify(challenge.getChallenge(), request.signature(), wallet);

			WalletState state = users.walletState(wallet);
			OnChainWalletStatus chain = state.chain();
			Optional<User> existing = state.user();
			String txHash = null;
			if (!chain.registered()) {
				if (existing.isPresent() && existing.get().getStatus() == UserStatus.REVOKED) {
					// A chain reset must not silently re-activate an identity an admin revoked.
					throw new BlockAuthException(ErrorCode.STATE_CONFLICT);
				}
				try {
					txHash = registry.registerWallet(wallet);
					chain = registry.getWalletStatus(wallet);
				}
				catch (BlockAuthException e) {
					if (e.code() != ErrorCode.BLOCKCHAIN_TX_FAILED) {
						throw e;
					}
					// Reverted: a concurrent request may have registered it first. Re-read and decide.
					state = users.walletState(wallet);
					chain = state.chain();
					existing = state.user();
					if (!chain.registered()) {
						throw e;
					}
					if (chain.active() && existing.isPresent()) {
						throw new BlockAuthException(ErrorCode.WALLET_ALREADY_REGISTERED);
					}
				}
			}
			else if (chain.active() && existing.isPresent()) {
				throw new BlockAuthException(ErrorCode.WALLET_ALREADY_REGISTERED);
			}
			if (!chain.active()) {
				throw new BlockAuthException(ErrorCode.WALLET_REVOKED);
			}

			User user = existing.isPresent() ? existing.get() : users.create(wallet);
			audit.recordAuthEvent(AuthEventType.REGISTRATION, AuthEventStatus.SUCCESS, wallet, user.getId(), null,
					null, client);
			log.info("Registered wallet {} (tx {})", wallet, txHash);
			return new AuthController.RegistrationResponse(WalletAddresses.checksum(wallet), user.getRole(),
					user.getStatus(), chain.registeredAt(), txHash);
		}
		catch (BlockAuthException e) {
			failures.record(AuthEventType.REGISTRATION, wallet, e, client);
			throw e;
		}
	}

}
