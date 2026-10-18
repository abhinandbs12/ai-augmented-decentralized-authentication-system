package com.blockauth.audit;

import com.blockauth.common.ErrorCode;

/** Detected attack categories; descriptions are fixed server text, never user input. */
public enum AttackType {

	REPLAY_ATTEMPT("An already consumed authentication challenge was submitted again."),
	EXPIRED_CHALLENGE("An expired authentication challenge was submitted."),
	INVALID_CHALLENGE("An unknown, wrong-purpose or wrong-wallet challenge was submitted."),
	INVALID_SIGNATURE("A malformed or forged signature was submitted."),
	SIGNATURE_MISMATCH("The signature was produced by a different wallet than the one claimed."),
	UNREGISTERED_WALLET("A wallet that is not registered on-chain attempted to authenticate."),
	REVOKED_WALLET_ATTEMPT("A revoked wallet attempted to authenticate."),
	PRIVILEGE_ESCALATION_ATTEMPT("A user without the required role requested a protected resource."),
	CSRF_REJECTED("A state-changing request failed CSRF or origin verification."),
	RATE_LIMIT_EXCEEDED("A client exceeded the request rate limit."),
	IP_TEMPORARILY_BLOCKED("A client was temporarily blocked after repeated authentication failures."),
	SECOND_STEP_FAILED("A wrong verification code was entered during sign-in."),
	STEP_UP_FAILED("A dangerous action was submitted without a valid confirmation signature."),
	LOW_TRUST_LOGIN("A sign-in was refused because its trust score was too low."),
	INVALID_API_KEY("A request carried a missing, invalid, expired or revoked API key.");

	private final String description;

	AttackType(String description) {
		this.description = description;
	}

	public String description() {
		return description;
	}

	/** The attack an authentication failure represents, or null when the failure is not an attack. */
	public static AttackType of(ErrorCode code) {
		return switch (code) {
			case CHALLENGE_ALREADY_USED -> REPLAY_ATTEMPT;
			case CHALLENGE_EXPIRED -> EXPIRED_CHALLENGE;
			case INVALID_CHALLENGE -> INVALID_CHALLENGE;
			case INVALID_SIGNATURE -> INVALID_SIGNATURE;
			case SIGNATURE_MISMATCH -> SIGNATURE_MISMATCH;
			case WALLET_NOT_REGISTERED -> UNREGISTERED_WALLET;
			case WALLET_REVOKED -> REVOKED_WALLET_ATTEMPT;
			case ACCESS_DENIED -> PRIVILEGE_ESCALATION_ATTEMPT;
			case CSRF_INVALID -> CSRF_REJECTED;
			case RATE_LIMITED -> RATE_LIMIT_EXCEEDED;
			case IP_TEMPORARILY_BLOCKED -> IP_TEMPORARILY_BLOCKED;
			case SECOND_STEP_INVALID -> SECOND_STEP_FAILED;
			case STEP_UP_FAILED -> STEP_UP_FAILED;
			case LOGIN_RISK_TOO_HIGH -> LOW_TRUST_LOGIN;
			case INVALID_API_KEY -> INVALID_API_KEY;
			default -> null;
		};
	}

}
