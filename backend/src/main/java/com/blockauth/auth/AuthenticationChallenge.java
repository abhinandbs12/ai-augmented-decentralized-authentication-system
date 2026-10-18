package com.blockauth.auth;

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
@Table(name = "authentication_challenges")
public class AuthenticationChallenge {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "wallet_address", nullable = false, length = 42)
	private String walletAddress;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 16)
	private ChallengePurpose purpose;

	@Column(nullable = false, length = 32)
	private String nonce;

	@Column(nullable = false, columnDefinition = "text")
	private String challenge;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "expires_at", nullable = false)
	private Instant expiresAt;

	@Column(nullable = false)
	private boolean used;

	@Column(name = "used_at")
	private Instant usedAt;

	// ACTION challenges only: what is being confirmed, with which parameters, from which session.
	@Enumerated(EnumType.STRING)
	@Column(length = 24)
	private StepUpAction action;

	@Column(name = "action_details", length = 200)
	private String actionDetails;

	@Column(name = "session_id")
	private UUID sessionId;

	protected AuthenticationChallenge() {
	}

	AuthenticationChallenge(String walletAddress, ChallengePurpose purpose, String nonce, String challenge,
			Instant createdAt, Instant expiresAt) {
		this.walletAddress = walletAddress;
		this.purpose = purpose;
		this.nonce = nonce;
		this.challenge = challenge;
		this.createdAt = createdAt;
		this.expiresAt = expiresAt;
	}

	AuthenticationChallenge(String walletAddress, String nonce, String challenge, Instant createdAt, Instant expiresAt,
			StepUpAction action, String actionDetails, UUID sessionId) {
		this(walletAddress, ChallengePurpose.ACTION, nonce, challenge, createdAt, expiresAt);
		this.action = action;
		this.actionDetails = actionDetails;
		this.sessionId = sessionId;
	}

	public Long getId() {
		return id;
	}

	public String getWalletAddress() {
		return walletAddress;
	}

	public ChallengePurpose getPurpose() {
		return purpose;
	}

	public String getNonce() {
		return nonce;
	}

	public String getChallenge() {
		return challenge;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getExpiresAt() {
		return expiresAt;
	}

	public boolean isUsed() {
		return used;
	}

	public StepUpAction getAction() {
		return action;
	}

	public String getActionDetails() {
		return actionDetails;
	}

	public UUID getSessionId() {
		return sessionId;
	}

}
