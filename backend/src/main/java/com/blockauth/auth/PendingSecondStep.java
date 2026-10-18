package com.blockauth.auth;

import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import jakarta.servlet.http.HttpSession;

/**
 * A sign-in whose signature passed but whose second step is still owed. It lives only in the
 * pre-sign-in servlet session of the browser that signed, so the code can only be completed from
 * there: a direct request from anywhere else has no such session.
 */
final class PendingSecondStep implements Serializable {

	private static final String ATTRIBUTE = "BLOCKAUTH_PENDING_SECOND_STEP";
	static final int MAX_ATTEMPTS = 5;

	private final UUID userId;
	private final String wallet;
	private final Instant expiresAt;
	private final AtomicInteger attempts = new AtomicInteger();

	private PendingSecondStep(UUID userId, String wallet, Instant expiresAt) {
		this.userId = userId;
		this.wallet = wallet;
		this.expiresAt = expiresAt;
	}

	static void begin(HttpSession session, UUID userId, String wallet, Instant expiresAt) {
		session.setAttribute(ATTRIBUTE, new PendingSecondStep(userId, wallet, expiresAt));
	}

	static PendingSecondStep of(HttpSession session) {
		return session == null ? null : session.getAttribute(ATTRIBUTE) instanceof PendingSecondStep p ? p : null;
	}

	static void clear(HttpSession session) {
		if (session != null) {
			session.removeAttribute(ATTRIBUTE);
		}
	}

	/** @return false once the attempts are used up */
	boolean tryAttempt() {
		return attempts.incrementAndGet() <= MAX_ATTEMPTS;
	}

	boolean expired(Instant now) {
		return !now.isBefore(expiresAt);
	}

	UUID userId() {
		return userId;
	}

	String wallet() {
		return wallet;
	}

	Instant expiresAt() {
		return expiresAt;
	}

}
