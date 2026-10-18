package com.blockauth.auth;

import org.springframework.stereotype.Service;

import com.blockauth.audit.AttackType;
import com.blockauth.audit.AuditService;
import com.blockauth.audit.ClientInfo;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;
import com.blockauth.security.BlockAuthPrincipal;
import com.blockauth.security.InMemoryRateLimiter;

/**
 * Fresh signatures for dangerous actions. The session alone is not enough: the wallet that owns the
 * session must sign a one-time challenge naming the action and its parameters. A stolen session cookie,
 * or a request with changed parameters, cannot pass.
 */
@Service
public class StepUpService {

	private final ChallengeService challenges;
	private final SignatureVerifier signatures;
	private final AuditService audit;
	private final InMemoryRateLimiter limiter;

	public StepUpService(ChallengeService challenges, SignatureVerifier signatures, AuditService audit,
			InMemoryRateLimiter limiter) {
		this.challenges = challenges;
		this.signatures = signatures;
		this.audit = audit;
		this.limiter = limiter;
	}

	/** @param admin whether the caller's session has the ADMIN role right now */
	public AuthenticationChallenge issue(BlockAuthPrincipal principal, boolean admin, StepUpAction action,
			String details, ClientInfo client) {
		if (action.adminOnly() && !admin) {
			// Asking to confirm an administrator action is an attempt at one, recorded like any other.
			audit.recordSecurityEvent(AttackType.PRIVILEGE_ESCALATION_ATTEMPT, "Target: confirmation of " + action + ".",
					principal.walletAddress(), principal.userId(), client.ip());
			throw new BlockAuthException(ErrorCode.ACCESS_DENIED);
		}
		return challenges.issueForAction(principal.walletAddress(), principal.sessionId(), action, details);
	}

	/**
	 * Consumes the challenge, then checks the signature against the stored text and the session's
	 * wallet: a challenge is never tried twice. One presented for another action, other parameters or
	 * from another session is refused without being consumed, like a login challenge for another wallet.
	 * Any failure is reported as STEP_UP_FAILED, without saying why.
	 */
	public void verify(BlockAuthPrincipal principal, StepUpAction action, String details, StepUpProof proof,
			ClientInfo client) {
		try {
			AuthenticationChallenge challenge = challenges.consumeAction(proof.challenge(), principal.walletAddress(),
					principal.sessionId(), action, details);
			signatures.verify(challenge.getChallenge(), proof.signature(), principal.walletAddress());
		}
		catch (BlockAuthException e) {
			audit.recordSecurityEvent(AttackType.STEP_UP_FAILED, "Action: " + action + ", " + e.code() + ".",
					principal.walletAddress(), principal.userId(), client.ip());
			if (limiter.recordAuthFailure(client.ip())) {
				audit.recordSecurityEvent(AttackType.IP_TEMPORARILY_BLOCKED, principal.walletAddress(),
						principal.userId(), client.ip());
			}
			throw new BlockAuthException(ErrorCode.STEP_UP_FAILED);
		}
	}

}
