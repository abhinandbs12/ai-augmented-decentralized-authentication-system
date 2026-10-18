package com.blockauth.blockchain;

import java.time.Instant;

/** Result of {@code WalletRegistry.getWalletStatus}; {@code registeredAt} is null when not registered. */
public record OnChainWalletStatus(boolean registered, boolean active, Instant registeredAt) {

	public boolean valid() {
		return registered && active;
	}

	/** ACTIVE, REVOKED or NOT_REGISTERED. */
	public String label() {
		return !registered ? "NOT_REGISTERED" : active ? "ACTIVE" : "REVOKED";
	}

}
