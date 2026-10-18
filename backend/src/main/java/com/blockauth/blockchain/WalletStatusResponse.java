package com.blockauth.blockchain;

import java.time.Instant;

import com.blockauth.common.WalletAddresses;

public record WalletStatusResponse(String walletAddress, boolean registered, boolean active, String status,
		Instant registeredAt, String source) {

	public static WalletStatusResponse of(String wallet, OnChainWalletStatus status) {
		return new WalletStatusResponse(WalletAddresses.checksum(wallet), status.registered(), status.active(),
				status.label(), status.registeredAt(), "BLOCKCHAIN");
	}

}
