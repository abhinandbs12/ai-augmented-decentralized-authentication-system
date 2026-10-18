package com.blockauth.risk;

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

/** The trust score of one sign-in, with the rules that lowered it and the decision taken. */
@Entity
@Table(name = "login_assessments")
public class LoginAssessment {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "wallet_address", nullable = false, updatable = false, length = 42)
	private String walletAddress;

	@Column(name = "user_id", updatable = false)
	private UUID userId;

	@Column(name = "device_id", updatable = false)
	private UUID deviceId;

	@Column(name = "ip_address", updatable = false, length = 45)
	private String ipAddress;

	@Column(nullable = false, updatable = false)
	private int score;

	@Column(nullable = false, updatable = false, length = 120)
	private String rules;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, updatable = false, length = 12)
	private TrustPolicy.Decision decision;

	@Column(name = "assessed_at", nullable = false, updatable = false)
	private Instant assessedAt;

	protected LoginAssessment() {
	}

	LoginAssessment(String walletAddress, UUID userId, UUID deviceId, String ipAddress, int score, String rules,
			TrustPolicy.Decision decision, Instant assessedAt) {
		this.walletAddress = walletAddress;
		this.userId = userId;
		this.deviceId = deviceId;
		this.ipAddress = ipAddress;
		this.score = score;
		this.rules = rules;
		this.decision = decision;
		this.assessedAt = assessedAt;
	}

	public Long getId() {
		return id;
	}

	public String getWalletAddress() {
		return walletAddress;
	}

	public String getIpAddress() {
		return ipAddress;
	}

	public int getScore() {
		return score;
	}

	public String getRules() {
		return rules;
	}

	public TrustPolicy.Decision getDecision() {
		return decision;
	}

	public Instant getAssessedAt() {
		return assessedAt;
	}

}
