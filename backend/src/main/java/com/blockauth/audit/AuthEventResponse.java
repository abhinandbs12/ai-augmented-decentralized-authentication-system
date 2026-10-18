package com.blockauth.audit;

import java.time.Instant;
import java.util.UUID;

import com.blockauth.common.WalletAddresses;

/** Admin view of an authentication event. */
public record AuthEventResponse(Long id, UUID userId, UUID actorUserId, String walletAddress, AuthEventType eventType,
		AuthEventStatus eventStatus, String failureReason, Instant occurredAt, String ipAddress, String userAgent) {

	public static AuthEventResponse of(AuthenticationEvent e) {
		return new AuthEventResponse(e.getId(), e.getUserId(), e.getActorUserId(),
				WalletAddresses.checksum(e.getWalletAddress()), e.getEventType(), e.getEventStatus(),
				e.getFailureReason(), e.getOccurredAt(), e.getIpAddress(), e.getUserAgent());
	}

	/** What a user sees of their own history. */
	public record HistoryEntry(Long id, AuthEventType eventType, AuthEventStatus eventStatus, String failureReason,
			Instant occurredAt, String ipAddress) {

		public static HistoryEntry of(AuthenticationEvent e) {
			return new HistoryEntry(e.getId(), e.getEventType(), e.getEventStatus(), e.getFailureReason(),
					e.getOccurredAt(), e.getIpAddress());
		}
	}

}
