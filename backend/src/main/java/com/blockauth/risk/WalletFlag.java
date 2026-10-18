package com.blockauth.risk;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A wallet an administrator marked as suspicious. It lowers the trust score of that wallet and of wallets linked to it. */
@Entity
@Table(name = "wallet_flags")
public class WalletFlag {

	@Id
	@Column(name = "wallet_address", length = 42)
	private String walletAddress;

	@Column(nullable = false, length = 200)
	private String reason;

	@Column(name = "flagged_by", nullable = false)
	private UUID flaggedBy;

	@Column(name = "flagged_at", nullable = false)
	private Instant flaggedAt;

	protected WalletFlag() {
	}

	WalletFlag(String walletAddress, String reason, UUID flaggedBy, Instant flaggedAt) {
		this.walletAddress = walletAddress;
		this.reason = reason;
		this.flaggedBy = flaggedBy;
		this.flaggedAt = flaggedAt;
	}

	public String getWalletAddress() {
		return walletAddress;
	}

	public String getReason() {
		return reason;
	}

	public UUID getFlaggedBy() {
		return flaggedBy;
	}

	public Instant getFlaggedAt() {
		return flaggedAt;
	}

}
