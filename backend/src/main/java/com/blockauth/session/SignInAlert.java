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

/** "New sign-in on a device this wallet has not used": shown on the user's other sessions until answered. */
@Entity
@Table(name = "sign_in_alerts")
public class SignInAlert {

	public enum Resolution {
		CONFIRMED, SIGNED_OUT
	}

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "user_id", nullable = false, updatable = false)
	private UUID userId;

	@Column(name = "session_id", nullable = false, updatable = false)
	private UUID sessionId;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "resolved_at")
	private Instant resolvedAt;

	@Enumerated(EnumType.STRING)
	@Column(length = 12)
	private Resolution resolution;

	protected SignInAlert() {
	}

	SignInAlert(UUID userId, UUID sessionId, Instant createdAt) {
		this.userId = userId;
		this.sessionId = sessionId;
		this.createdAt = createdAt;
	}

	void resolve(Resolution resolution, Instant now) {
		this.resolution = resolution;
		this.resolvedAt = now;
	}

	public Long getId() {
		return id;
	}

	public UUID getSessionId() {
		return sessionId;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public boolean isResolved() {
		return resolvedAt != null;
	}

}
