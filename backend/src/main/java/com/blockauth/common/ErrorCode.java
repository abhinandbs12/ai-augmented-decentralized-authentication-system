package com.blockauth.common;

import org.slf4j.event.Level;

/** The error catalog: HTTP status, the level at which the error is logged, and the fixed client message. */
public enum ErrorCode {

	VALIDATION_FAILED(400, Level.DEBUG, "Request validation failed."),
	MALFORMED_REQUEST(400, Level.DEBUG, "Request body is malformed or contains unknown fields."),
	UNAUTHENTICATED(401, Level.DEBUG, "Authentication required."),
	SESSION_REVOKED(401, Level.INFO, "Your session has ended. Please sign in again."),
	INVALID_CHALLENGE(401, Level.WARN, "Authentication challenge is not valid."),
	CHALLENGE_EXPIRED(401, Level.WARN, "The authentication challenge has expired. Request a new one."),
	CHALLENGE_ALREADY_USED(401, Level.WARN, "This authentication challenge has already been used."),
	INVALID_SIGNATURE(401, Level.WARN, "Signature is invalid."),
	SIGNATURE_MISMATCH(401, Level.WARN, "Signature does not belong to the specified wallet."),
	SECOND_STEP_INVALID(401, Level.WARN, "The verification code is not valid."),
	SECOND_STEP_EXPIRED(401, Level.INFO, "The verification step has ended. Sign in again."),
	INVALID_API_KEY(401, Level.WARN, "API key is missing, invalid, expired or revoked."),
	WALLET_NOT_REGISTERED(403, Level.WARN, "This wallet is not registered."),
	WALLET_REVOKED(403, Level.WARN, "This wallet has been revoked."),
	ACCESS_DENIED(403, Level.WARN, "You do not have permission to perform this action."),
	CSRF_INVALID(403, Level.WARN, "Request could not be verified. Refresh and try again."),
	STEP_UP_FAILED(403, Level.WARN, "The confirmation signature is not valid. Start the action again."),
	VERIFICATION_CODE_INVALID(403, Level.WARN, "The verification code is not valid."),
	LOGIN_RISK_TOO_HIGH(403, Level.WARN, "This sign-in needs a second step that is not set up for this wallet."),
	WALLET_NOT_FOUND(404, Level.INFO, "Wallet is not registered on the blockchain."),
	RESOURCE_NOT_FOUND(404, Level.DEBUG, "Resource not found."),
	METHOD_NOT_ALLOWED(405, Level.DEBUG, "HTTP method not supported for this endpoint."),
	WALLET_ALREADY_REGISTERED(409, Level.INFO, "This wallet is already registered."),
	REGISTRATION_INCOMPLETE(409, Level.WARN, "Registration is incomplete. Run registration again."),
	STATE_CONFLICT(409, Level.WARN, "Wallet state requires administrator review."),
	WALLET_ALREADY_REVOKED(409, Level.INFO, "Wallet is already revoked."),
	WALLET_ALREADY_ACTIVE(409, Level.INFO, "Wallet is already active."),
	CANNOT_MODIFY_OWN_WALLET(409, Level.WARN, "Administrators cannot change their own wallet status."),
	CURRENT_DEVICE(409, Level.INFO, "Use Logout to end the session on this device."),
	SECOND_STEP_ALREADY_ENABLED(409, Level.INFO, "The second step is already turned on."),
	SECOND_STEP_NOT_ENABLED(409, Level.INFO, "The second step is not turned on."),
	SECOND_STEP_SETUP_MISSING(409, Level.INFO, "Start the second-step setup first."),
	WALLET_ALREADY_FLAGGED(409, Level.INFO, "This wallet is already flagged."),
	WALLET_NOT_FLAGGED(409, Level.INFO, "This wallet is not flagged."),
	EMERGENCY_STOP_ALREADY_ACTIVE(409, Level.INFO, "The emergency stop is already on."),
	EMERGENCY_STOP_NOT_ACTIVE(409, Level.INFO, "The emergency stop is not on."),
	ADMIN_ACTION_ALREADY_PENDING(409, Level.INFO, "The same action is already waiting to take effect."),
	ADMIN_ACTION_NOT_PENDING(409, Level.INFO, "This action is no longer waiting."),
	PAYLOAD_TOO_LARGE(413, Level.WARN, "Request body too large."),
	UNSUPPORTED_MEDIA_TYPE(415, Level.DEBUG, "Content-Type must be application/json."),
	RATE_LIMITED(429, Level.WARN, "Too many requests. Try again later."),
	IP_TEMPORARILY_BLOCKED(429, Level.WARN, "Too many failed attempts. Try again later."),
	INTERNAL_ERROR(500, Level.ERROR, "An unexpected error occurred."),
	BLOCKCHAIN_TX_FAILED(502, Level.ERROR, "Blockchain transaction failed."),
	BLOCKCHAIN_UNAVAILABLE(503, Level.ERROR, "Blockchain service is unavailable."),
	DATABASE_UNAVAILABLE(503, Level.ERROR, "Service temporarily unavailable."),
	RISK_CHECK_UNAVAILABLE(503, Level.ERROR, "Sign-in checks are temporarily unavailable."),
	EMERGENCY_STOP_ACTIVE(503, Level.WARN, "This is paused by an administrator."),
	BLOCKCHAIN_TIMEOUT(504, Level.ERROR, "Blockchain did not confirm in time. Try again.");

	private final int status;
	private final Level logLevel;
	private final String message;

	ErrorCode(int status, Level logLevel, String message) {
		this.status = status;
		this.logLevel = logLevel;
		this.message = message;
	}

	public int status() {
		return status;
	}

	public Level logLevel() {
		return logLevel;
	}

	public String message() {
		return message;
	}

}
