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
@Table(name = "security_events")
public class SecurityEvent {

	/** Every detection in this version is one the system stopped. */
	private static final String RESULT_BLOCKED = "BLOCKED";

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "user_id")
	private UUID userId;

	@Column(name = "wallet_address", length = 42)
	private String walletAddress;

	@Enumerated(EnumType.STRING)
	@Column(name = "attack_type", nullable = false, length = 40)
	private AttackType attackType;

	@Column(nullable = false, length = 500)
	private String description;

	@Column(nullable = false, length = 10)
	private String result;

	@Column(name = "occurred_at", nullable = false)
	private Instant occurredAt;

	@Column(name = "ip_address", length = 45)
	private String ipAddress;

	protected SecurityEvent() {
	}

	SecurityEvent(UUID userId, String walletAddress, AttackType attackType, String description, Instant occurredAt,
			String ipAddress) {
		this.userId = userId;
		this.walletAddress = walletAddress;
		this.attackType = attackType;
		this.description = description;
		this.result = RESULT_BLOCKED;
		this.occurredAt = occurredAt;
		this.ipAddress = ipAddress;
	}

	public Long getId() {
		return id;
	}

	public UUID getUserId() {
		return userId;
	}

	public String getWalletAddress() {
		return walletAddress;
	}

	public AttackType getAttackType() {
		return attackType;
	}

	public String getDescription() {
		return description;
	}

	public String getResult() {
		return result;
	}

	public Instant getOccurredAt() {
		return occurredAt;
	}

	public String getIpAddress() {
		return ipAddress;
	}

}
