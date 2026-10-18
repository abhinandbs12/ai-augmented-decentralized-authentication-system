package com.blockauth.audit;

import java.time.Instant;
import java.util.UUID;

import com.blockauth.common.WalletAddresses;

public record SecurityEventResponse(Long id, UUID userId, String walletAddress, AttackType attackType,
		String description, String result, Instant occurredAt, String ipAddress) {

	public static SecurityEventResponse of(SecurityEvent e) {
		return new SecurityEventResponse(e.getId(), e.getUserId(), WalletAddresses.checksum(e.getWalletAddress()),
				e.getAttackType(), e.getDescription(), e.getResult(), e.getOccurredAt(), e.getIpAddress());
	}

}
