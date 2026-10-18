package com.blockauth.admin;

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

/**
 * An administrator action that takes effect only after a waiting period. Its parameters are fixed when
 * it is requested; it is carried out by the server from this record, not from a later request.
 */
@Entity
@Table(name = "admin_actions")
public class AdminAction {

	public enum Type {
		ACTIVATE_WALLET, RESET_SECOND_STEP, LIFT_EMERGENCY_STOP
	}

	public enum Status {
		PENDING, EXECUTING, EXECUTED, CANCELLED, FAILED
	}

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, updatable = false, length = 24)
	private Type action;

	@Column(name = "target_wallet", updatable = false, length = 42)
	private String targetWallet;

	@Column(name = "requested_by", nullable = false, updatable = false)
	private UUID requestedBy;

	@Column(name = "requested_at", nullable = false, updatable = false)
	private Instant requestedAt;

	@Column(name = "execute_after", nullable = false)
	private Instant executeAfter;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 10)
	private Status status;

	@Column(name = "decided_by")
	private UUID decidedBy;

	@Column(name = "decided_at")
	private Instant decidedAt;

	@Column(name = "failure_reason", length = 40)
	private String failureReason;

	protected AdminAction() {
	}

	AdminAction(Type action, String targetWallet, UUID requestedBy, Instant requestedAt, Instant executeAfter) {
		this.action = action;
		this.targetWallet = targetWallet;
		this.requestedBy = requestedBy;
		this.requestedAt = requestedAt;
		this.executeAfter = executeAfter;
		this.status = Status.PENDING;
	}

	public Long getId() {
		return id;
	}

	public Type getAction() {
		return action;
	}

	public String getTargetWallet() {
		return targetWallet;
	}

	public UUID getRequestedBy() {
		return requestedBy;
	}

	public Instant getRequestedAt() {
		return requestedAt;
	}

	public Instant getExecuteAfter() {
		return executeAfter;
	}

	public Status getStatus() {
		return status;
	}

	public UUID getDecidedBy() {
		return decidedBy;
	}

	public Instant getDecidedAt() {
		return decidedAt;
	}

	public String getFailureReason() {
		return failureReason;
	}

}
