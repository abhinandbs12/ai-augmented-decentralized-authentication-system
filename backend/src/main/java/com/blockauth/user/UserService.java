package com.blockauth.user;

import java.util.Optional;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import com.blockauth.blockchain.OnChainWalletStatus;
import com.blockauth.blockchain.WalletRegistryClient;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;
import com.blockauth.common.Specs;
import com.blockauth.config.BlockAuthProperties;

@Service
public class UserService {

	/** A wallet's on-chain status together with its user row, if one exists. */
	public record WalletState(OnChainWalletStatus chain, Optional<User> user) {
	}

	private final UserRepository users;
	private final WalletRegistryClient registry;
	private final BlockAuthProperties properties;

	public UserService(UserRepository users, WalletRegistryClient registry, BlockAuthProperties properties) {
		this.users = users;
		this.registry = registry;
		this.properties = properties;
	}

	/** The session principal's own row; the session filter has already confirmed it exists. */
	public User require(UUID id) {
		return users.findById(id).orElseThrow(() -> new BlockAuthException(ErrorCode.SESSION_REVOKED));
	}

	public Page<User> list(UserStatus status, UserRole role, String wallet, Pageable pageable) {
		return users.findAll(Specs.<User>eq("status", status).and(Specs.eq("role", role))
				.and(Specs.eq("walletAddress", wallet)), pageable);
	}

	/** Creates the user as ADMIN if the wallet is listed in BLOCKAUTH_ADMIN_WALLETS, otherwise USER. */
	public User create(String wallet) {
		UserRole role = properties.adminWalletSet().contains(wallet) ? UserRole.ADMIN : UserRole.USER;
		try {
			return users.saveAndFlush(new User(wallet, role));
		}
		catch (DataIntegrityViolationException e) {
			// A concurrent registration of the same wallet inserted the row first.
			throw new BlockAuthException(ErrorCode.WALLET_ALREADY_REGISTERED);
		}
	}

	/**
	 * Reads the authoritative status from the chain and loads the user row. The row's status is only a
	 * mirror of the chain: if it has drifted it is corrected here, so every chain read repairs it.
	 */
	public WalletState walletState(String wallet) {
		OnChainWalletStatus chain = registry.getWalletStatus(wallet);
		Optional<User> user = users.findByWalletAddress(wallet);
		if (chain.registered()) {
			UserStatus onChain = chain.active() ? UserStatus.ACTIVE : UserStatus.REVOKED;
			user = user.map(u -> withStatus(u, onChain));
		}
		return new WalletState(chain, user);
	}

	public OnChainWalletStatus chainStatus(String wallet) {
		return walletState(wallet).chain();
	}

	/** Updates the status mirror after a confirmed on-chain change; empty if the wallet has no user row. */
	public Optional<User> setStatus(String wallet, UserStatus status) {
		return users.findByWalletAddress(wallet).map(u -> withStatus(u, status));
	}

	private User withStatus(User user, UserStatus status) {
		if (user.getStatus() == status) {
			return user;
		}
		user.setStatus(status);
		return users.save(user);
	}

}
