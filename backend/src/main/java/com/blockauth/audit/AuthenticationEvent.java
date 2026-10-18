package com.blockauth.audit;

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

@Entity
@Table(name = "authentication_events")
public class AuthenticationEvent {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "user_id")
	private UUID userId;

	@Column(name = "actor_user_id")
	private UUID actorUserId;

	@Column(name = "wallet_address", length = 42)
	private String walletAddress;

	@Enumerated(EnumType.STRING)
	@Column(name = "event_type", nullable = false, length = 24)
	private AuthEventType eventType;

	@Enumerated(EnumType.STRING)
	@Column(name = "event_status", nullable = false, length = 10)
	private AuthEventStatus eventStatus;

	@Column(name = "failure_reason", length = 40)
	private String failureReason;

	@Column(name = "occurred_at", nullable = false)
	private Instant occurredAt;

	@Column(name = "ip_address", length = 45)
	private String ipAddress;

	@Column(name = "user_agent", length = 512)
	private String userAgent;

	protected AuthenticationEvent() {
	}

	AuthenticationEvent(UUID userId, UUID actorUserId, String walletAddress, AuthEventType eventType,
			AuthEventStatus eventStatus, String failureReason, Instant occurredAt, String ipAddress,
			String userAgent) {
		this.userId = userId;
		this.actorUserId = actorUserId;
		this.walletAddress = walletAddress;
		this.eventType = eventType;
		this.eventStatus = eventStatus;
		this.failureReason = failureReason;
		this.occurredAt = occurredAt;
		this.ipAddress = ipAddress;
		this.userAgent = userAgent;
	}

	public Long getId() {
		return id;
	}

	public UUID getUserId() {
		return userId;
	}

	public UUID getActorUserId() {
		return actorUserId;
	}

	public String getWalletAddress() {
		return walletAddress;
	}

	public AuthEventType getEventType() {
		return eventType;
	}

	public AuthEventStatus getEventStatus() {
		return eventStatus;
	}

	public String getFailureReason() {
		return failureReason;
	}

	public Instant getOccurredAt() {
		return occurredAt;
	}

	public String getIpAddress() {
		return ipAddress;
	}

	public String getUserAgent() {
		return userAgent;
	}

}
