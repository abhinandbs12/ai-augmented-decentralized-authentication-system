package com.blockauth.secondstep;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A user's authenticator secret (encrypted). Set up but not yet confirmed while {@code enabledAt} is null. */
@Entity
@Table(name = "second_factors")
public class SecondFactor {

	@Id
	@Column(name = "user_id")
	private UUID userId;

	@Column(name = "secret_ciphertext", nullable = false, length = 120)
	private String secretCiphertext;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "enabled_at")
	private Instant enabledAt;

	@Column(name = "last_used_step")
	private Long lastUsedStep;

	protected SecondFactor() {
	}

	SecondFactor(UUID userId, String secretCiphertext, Instant createdAt) {
		this.userId = userId;
		this.secretCiphertext = secretCiphertext;
		this.createdAt = createdAt;
	}

	void enable(Instant now, long usedStep) {
		this.enabledAt = now;
		this.lastUsedStep = usedStep;
	}

	String getSecretCiphertext() {
		return secretCiphertext;
	}

	boolean isEnabled() {
		return enabledAt != null;
	}

	long lastUsedStep() {
		return lastUsedStep == null ? -1 : lastUsedStep;
	}

}
