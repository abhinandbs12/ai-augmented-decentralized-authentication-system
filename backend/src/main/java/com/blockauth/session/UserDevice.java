package com.blockauth.session;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A device a user has signed in on. Trusted until {@code trustedUntil} after a passed second step;
 * a removed device counts as new again.
 */
@Entity
@Table(name = "user_devices")
public class UserDevice {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "user_id", nullable = false, updatable = false)
	private UUID userId;

	@Column(name = "device_id", nullable = false, updatable = false)
	private UUID deviceId;

	@Column(name = "first_seen_at", nullable = false)
	private Instant firstSeenAt;

	@Column(name = "last_seen_at", nullable = false)
	private Instant lastSeenAt;

	@Column(name = "trusted_until")
	private Instant trustedUntil;

	@Column(name = "removed_at")
	private Instant removedAt;

	protected UserDevice() {
	}

	UserDevice(UUID userId, UUID deviceId, Instant now) {
		this.userId = userId;
		this.deviceId = deviceId;
		this.firstSeenAt = now;
		this.lastSeenAt = now;
	}

	/** A sign-in on this device. A removed device starts over, untrusted. */
	void signedIn(Instant now) {
		if (removedAt != null) {
			removedAt = null;
			firstSeenAt = now;
		}
		lastSeenAt = now;
	}

	void trustUntil(Instant until) {
		trustedUntil = until;
	}

	void remove(Instant now) {
		removedAt = now;
		trustedUntil = null;
	}

	public UUID getDeviceId() {
		return deviceId;
	}

	public Instant getFirstSeenAt() {
		return firstSeenAt;
	}

	public Instant getLastSeenAt() {
		return lastSeenAt;
	}

	public Instant getTrustedUntil() {
		return trustedUntil;
	}

	public boolean isRemoved() {
		return removedAt != null;
	}

}
