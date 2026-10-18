package com.blockauth.apikey;

import java.time.Instant;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A read-only API key. The secret is shown once at creation; only its SHA-256 hash is stored. */
@Entity
@Table(name = "api_keys")
public class ApiKey {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "owner_id", nullable = false, updatable = false)
	private UUID ownerId;

	@Column(nullable = false, updatable = false, length = 60)
	private String name;

	@Column(name = "secret_hash", nullable = false, updatable = false, length = 64)
	private String secretHash;

	@Column(nullable = false, updatable = false, length = 100)
	private String scopes;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "expires_at", nullable = false, updatable = false)
	private Instant expiresAt;

	@Column(name = "revoked_at")
	private Instant revokedAt;

	@Column(name = "revoked_by")
	private UUID revokedBy;

	@Column(name = "last_used_at")
	private Instant lastUsedAt;

	protected ApiKey() {
	}

	ApiKey(UUID ownerId, ApiKeySpec spec, String secretHash, Instant createdAt) {
		this.ownerId = ownerId;
		this.name = spec.name();
		this.secretHash = secretHash;
		this.scopes = spec.scopes().stream().map(ApiScope::value).collect(Collectors.joining(","));
		this.createdAt = createdAt;
		this.expiresAt = createdAt.plus(java.time.Duration.ofDays(spec.days()));
	}

	boolean usableAt(Instant now) {
		return revokedAt == null && now.isBefore(expiresAt);
	}

	Set<ApiScope> scopeSet() {
		Set<ApiScope> set = EnumSet.noneOf(ApiScope.class);
		Arrays.stream(scopes.split(",")).map(ApiScope::of).forEach(set::add);
		return set;
	}

	public UUID getId() {
		return id;
	}

	public UUID getOwnerId() {
		return ownerId;
	}

	public String getName() {
		return name;
	}

	String getSecretHash() {
		return secretHash;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getExpiresAt() {
		return expiresAt;
	}

	public Instant getRevokedAt() {
		return revokedAt;
	}

	public Instant getLastUsedAt() {
		return lastUsedAt;
	}

}
