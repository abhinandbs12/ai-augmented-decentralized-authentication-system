package com.blockauth.secondstep;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A one-time backup code, stored as the SHA-256 hash of its normalized form. */
@Entity
@Table(name = "backup_codes")
public class BackupCode {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "user_id", nullable = false, updatable = false)
	private UUID userId;

	@Column(name = "code_hash", nullable = false, updatable = false, length = 64)
	private String codeHash;

	@Column(name = "used_at")
	private Instant usedAt;

	protected BackupCode() {
	}

	BackupCode(UUID userId, String codeHash) {
		this.userId = userId;
		this.codeHash = codeHash;
	}

}
