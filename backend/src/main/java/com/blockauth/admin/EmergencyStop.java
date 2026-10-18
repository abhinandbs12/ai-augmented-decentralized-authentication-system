package com.blockauth.admin;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** The single row holding the emergency stop. Persisted, so a restart does not lift it. */
@Entity
@Table(name = "emergency_stop")
public class EmergencyStop {

	static final int ID = 1;

	@Id
	private Integer id;

	@Column(nullable = false)
	private boolean active;

	@Column(name = "block_logins", nullable = false)
	private boolean blockLogins;

	@Column(length = 200)
	private String reason;

	@Column(name = "changed_by")
	private UUID changedBy;

	@Column(name = "changed_at")
	private Instant changedAt;

	protected EmergencyStop() {
	}

	static EmergencyStop inactive() {
		EmergencyStop stop = new EmergencyStop();
		stop.id = ID;
		return stop;
	}

	void switchOn(boolean blockLogins, String reason, UUID by, Instant now) {
		this.active = true;
		this.blockLogins = blockLogins;
		this.reason = reason;
		this.changedBy = by;
		this.changedAt = now;
	}

	void switchOff(UUID by, Instant now) {
		this.active = false;
		this.blockLogins = false;
		this.changedBy = by;
		this.changedAt = now;
	}

	public boolean isActive() {
		return active;
	}

	public boolean isBlockLogins() {
		return blockLogins;
	}

	public String getReason() {
		return reason;
	}

	public UUID getChangedBy() {
		return changedBy;
	}

	public Instant getChangedAt() {
		return changedAt;
	}

}
