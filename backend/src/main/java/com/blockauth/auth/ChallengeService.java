package com.blockauth.auth;

import java.time.Clock;
import java.time.Duration;
import java.util.UUID;
import java.util.function.Predicate;

import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import com.blockauth.audit.AuditService;
import com.blockauth.audit.AuthEventType;
import com.blockauth.audit.ClientInfo;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;
import com.blockauth.security.InMemoryRateLimiter;

@Service
public class ChallengeService {

	private static final int MAX_PER_WALLET_PER_MINUTE = 5;

	private final AuthenticationChallengeRepository challenges;
	private final ChallengeMessageFactory factory;
	private final InMemoryRateLimiter limiter;
	private final AuditService audit;
	private final Clock clock;
	private final TransactionTemplate newTransaction;

	public ChallengeService(AuthenticationChallengeRepository challenges, ChallengeMessageFactory factory,
			InMemoryRateLimiter limiter, AuditService audit, Clock clock,
			PlatformTransactionManager transactionManager) {
		this.challenges = challenges;
		this.factory = factory;
		this.limiter = limiter;
		this.audit = audit;
		this.clock = clock;
		this.newTransaction = new TransactionTemplate(transactionManager);
		this.newTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
	}

	/** Issues a challenge for any well-formed wallet, without revealing whether it is registered. */
	public AuthenticationChallenge issue(String wallet, ChallengePurpose purpose, ClientInfo client) {
		// Counted per wallet and client address together. Counted per wallet alone, anyone could use up
		// a wallet's allowance and keep its owner from signing in.
		InMemoryRateLimiter.Decision decision = limiter.acquire("challenge-wallet", wallet + '|' + client.ip(),
				MAX_PER_WALLET_PER_MINUTE, Duration.ofMinutes(1));
		if (!decision.allowed()) {
			AuthEventType type = purpose == ChallengePurpose.REGISTRATION ? AuthEventType.REGISTRATION
					: AuthEventType.LOGIN;
			audit.recordFailure(type, wallet, ErrorCode.RATE_LIMITED, client);
			throw new BlockAuthException(ErrorCode.RATE_LIMITED, decision.retryAfterSeconds());
		}
		return challenges.save(factory.create(wallet, purpose));
	}

	/**
	 * Consumes the challenge on this, its first verification attempt, whether or not the signature then
	 * turns out to be valid. It runs in its own transaction, committed before the caller continues, so
	 * a challenge can never be tried twice even if a later step fails or rolls back.
	 * @throws BlockAuthException INVALID_CHALLENGE, CHALLENGE_ALREADY_USED or CHALLENGE_EXPIRED
	 */
	public AuthenticationChallenge consume(String challengeText, String wallet, ChallengePurpose purpose) {
		return consume(challengeText, purpose, c -> c.getWalletAddress().equals(wallet));
	}

	/**
	 * Issues the challenge that confirms one dangerous action. It names the action and its parameters
	 * and belongs to one session: it is useless for anything else.
	 */
	public AuthenticationChallenge issueForAction(String wallet, UUID sessionId, StepUpAction action, String details) {
		InMemoryRateLimiter.Decision decision = limiter.acquire("step-up", wallet, MAX_PER_WALLET_PER_MINUTE * 2,
				Duration.ofMinutes(1));
		if (!decision.allowed()) {
			throw new BlockAuthException(ErrorCode.RATE_LIMITED, decision.retryAfterSeconds());
		}
		return challenges.save(factory.createForAction(wallet, action, details, sessionId));
	}

	/** Like {@link #consume}, for an action challenge issued to this wallet and session for exactly this action. */
	public AuthenticationChallenge consumeAction(String challengeText, String wallet, UUID sessionId,
			StepUpAction action, String details) {
		return consume(challengeText, ChallengePurpose.ACTION, c -> c.getWalletAddress().equals(wallet)
				&& sessionId.equals(c.getSessionId()) && c.getAction() == action && details.equals(c.getActionDetails()));
	}

	private AuthenticationChallenge consume(String challengeText, ChallengePurpose purpose,
			Predicate<AuthenticationChallenge> belongs) {
		return newTransaction.execute(status -> {
			AuthenticationChallenge challenge = challenges.findByChallengeAndPurpose(challengeText, purpose)
					.filter(belongs)
					.orElseThrow(() -> new BlockAuthException(ErrorCode.INVALID_CHALLENGE));
			if (challenges.consume(challenge.getId(), clock.instant()) == 0) {
				boolean used = challenges.findById(challenge.getId()).map(AuthenticationChallenge::isUsed)
						.orElse(true);
				throw new BlockAuthException(used ? ErrorCode.CHALLENGE_ALREADY_USED : ErrorCode.CHALLENGE_EXPIRED);
			}
			return challenge;
		});
	}

}
