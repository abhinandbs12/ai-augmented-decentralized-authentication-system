package com.blockauth.session;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * The server-side record of one signed-in session. The servlet session holds only its id; every
 * authenticated request checks that the record is still open, so ending it here ends the session.
 */
@Entity
@Table(name = "user_sessions")
public class UserSession {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "user_id", nullable = false, updatable = false)
	private UUID userId;

	@Column(name = "device_id", nullable = false, updatable = false)
	private UUID deviceId;

	@Column(name = "ip_address", updatable = false, length = 45)
	private String ipAddress;

	@Column(name = "second_step", nullable = false, updatable = false)
	private boolean secondStep;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "last_seen_at", nullable = false)
	private Instant lastSeenAt;

	@Column(name = "ended_at")
	private Instant endedAt;

	@Enumerated(EnumType.STRING)
	@Column(name = "end_reason", length = 16)
	private SessionEndReason endReason;

	protected UserSession() {
	}

	UserSession(UUID userId, UUID deviceId, String ipAddress, boolean secondStep, Instant now) {
		this.userId = userId;
		this.deviceId = deviceId;
		this.ipAddress = ipAddress;
		this.secondStep = secondStep;
		this.createdAt = now;
		this.lastSeenAt = now;
	}

	public UUID getId() {
		return id;
	}

	public UUID getUserId() {
		return userId;
	}

	public UUID getDeviceId() {
		return deviceId;
	}

	public String getIpAddress() {
		return ipAddress;
	}

	public boolean isSecondStep() {
		return secondStep;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getLastSeenAt() {
		return lastSeenAt;
	}

	public boolean isEnded() {
		return endedAt != null;
	}

}
