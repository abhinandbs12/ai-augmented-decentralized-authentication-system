package com.blockauth.session;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A browser that completed a sign-in, recognised by the hash of the random token in its device cookie. */
@Entity
@Table(name = "devices")
public class Device {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "token_hash", nullable = false, updatable = false, length = 64)
	private String tokenHash;

	// Derived from the browser's own description: a hint for people, never used for a security decision.
	@Column(nullable = false, updatable = false, length = 80)
	private String label;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected Device() {
	}

	Device(String tokenHash, String label, Instant createdAt) {
		this.tokenHash = tokenHash;
		this.label = label;
		this.createdAt = createdAt;
	}

	public UUID getId() {
		return id;
	}

	public String getLabel() {
		return label;
	}

}
