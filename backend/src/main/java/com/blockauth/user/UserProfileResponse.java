package com.blockauth.user;

import java.time.Instant;
import java.util.UUID;

import com.blockauth.common.WalletAddresses;

/** A user's own profile, as returned by login and {@code GET /api/users/me}. */
public record UserProfileResponse(UUID id, String walletAddress, UserRole role, UserStatus status,
		Instant createdAt) {

	public static UserProfileResponse of(User user) {
		return new UserProfileResponse(user.getId(), WalletAddresses.checksum(user.getWalletAddress()),
				user.getRole(), user.getStatus(), user.getCreatedAt());
	}

}
