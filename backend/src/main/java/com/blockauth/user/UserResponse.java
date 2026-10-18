package com.blockauth.user;

import java.time.Instant;
import java.util.UUID;

import com.blockauth.common.WalletAddresses;

/** A user as listed for administrators. */
public record UserResponse(UUID id, String walletAddress, UserRole role, UserStatus status, Instant createdAt,
		Instant updatedAt) {

	public static UserResponse of(User user) {
		return new UserResponse(user.getId(), WalletAddresses.checksum(user.getWalletAddress()), user.getRole(),
				user.getStatus(), user.getCreatedAt(), user.getUpdatedAt());
	}

}
