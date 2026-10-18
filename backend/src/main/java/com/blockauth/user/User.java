package com.blockauth.user;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "users")
public class User {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;

	@Column(name = "wallet_address", nullable = false, updatable = false, length = 42)
	private String walletAddress;

	// Set once at creation. Never written again by the application, so a status update can never
	// carry a stale role over a change an operator made in the database.
	@Enumerated(EnumType.STRING)
	@Column(nullable = false, updatable = false, length = 10)
	private UserRole role;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 10)
	private UserStatus status;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected User() {
	}

	public User(String walletAddress, UserRole role) {
		this.walletAddress = walletAddress;
		this.role = role;
		this.status = UserStatus.ACTIVE;
	}

	@PrePersist
	void onCreate() {
		createdAt = Instant.now();
		updatedAt = createdAt;
	}

	@PreUpdate
	void onUpdate() {
		updatedAt = Instant.now();
	}

	public UUID getId() {
		return id;
	}

	public String getWalletAddress() {
		return walletAddress;
	}

	public UserRole getRole() {
		return role;
	}

	public UserStatus getStatus() {
		return status;
	}

	public void setStatus(UserStatus status) {
		this.status = status;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

}
