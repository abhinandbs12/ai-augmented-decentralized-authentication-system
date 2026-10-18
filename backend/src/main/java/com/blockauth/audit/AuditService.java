package com.blockauth.audit;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import com.blockauth.common.ErrorCode;
import com.blockauth.common.Specs;
import com.blockauth.user.User;
import com.blockauth.user.UserRepository;

/**
 * Persists and queries authentication and security events. Every event is written in its own
 * transaction, and a failed write is logged and swallowed: auditing must never break or roll back
 * the operation being audited.
 */
@Service
public class AuditService {

	private static final Logger log = LoggerFactory.getLogger(AuditService.class);
	private static final int MAX_USER_AGENT_LENGTH = 512;

	private final AuthenticationEventRepository authEvents;
	private final SecurityEventRepository securityEvents;
	private final UserRepository users;
	private final Clock clock;
	private final TransactionTemplate newTransaction;

	public AuditService(AuthenticationEventRepository authEvents, SecurityEventRepository securityEvents,
			UserRepository users, Clock clock, PlatformTransactionManager transactionManager) {
		this.authEvents = authEvents;
		this.securityEvents = securityEvents;
		this.users = users;
		this.clock = clock;
		this.newTransaction = new TransactionTemplate(transactionManager);
		this.newTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
	}

	/**
	 * @param userId the user the event is about, or null when the wallet has no user row
	 * @param actorUserId the admin who performed a revoke/activate, otherwise null
	 * @param failureReason null for successful events
	 */
	public void recordAuthEvent(AuthEventType type, AuthEventStatus status, String wallet, UUID userId,
			UUID actorUserId, ErrorCode failureReason, ClientInfo client) {
		record(type + " event",
				() -> authEvents.save(authEvent(type, status, wallet, userId, actorUserId, failureReason, client)));
	}

	public void recordSecurityEvent(AttackType type, String wallet, UUID userId, String ip) {
		recordSecurityEvent(type, null, wallet, userId, ip);
	}

	/**
	 * @param detail optional text appended to the attack type's fixed description. It must be
	 * server-generated: never pass request data such as a raw path or header value.
	 */
	public void recordSecurityEvent(AttackType type, String detail, String wallet, UUID userId, String ip) {
		log.warn("Security event {} wallet={} ip={}", type, wallet, ip);
		String description = detail == null ? type.description() : type.description() + " " + detail;
		record(type + " security event",
				() -> securityEvents.save(new SecurityEvent(userId, wallet, type, description, clock.instant(), ip)));
	}

	/**
	 * A failed registration or login attempt (BLOCKED when it was refused with 429): the authentication
	 * event plus, when the failure is one of the detected attack types, the matching security event.
	 * {@code wallet} may be null but must otherwise be a normalized address.
	 */
	public void recordFailure(AuthEventType type, String wallet, ErrorCode reason, ClientInfo client) {
		AuthEventStatus status = reason.status() == 429 ? AuthEventStatus.BLOCKED : AuthEventStatus.FAILURE;
		log.warn("{} {}: {} wallet={} ip={}", type, status, reason, wallet, client.ip());
		record(type + " " + status + " event", () -> {
			UUID userId = wallet == null ? null : users.findByWalletAddress(wallet).map(User::getId).orElse(null);
			authEvents.save(authEvent(type, status, wallet, userId, null, reason, client));
			AttackType attack = AttackType.of(reason);
			if (attack != null) {
				securityEvents.save(
						new SecurityEvent(userId, wallet, attack, attack.description(), clock.instant(), client.ip()));
			}
		});
	}

	/** One user's own events, newest first. */
	public Page<AuthenticationEvent> historyOf(UUID userId, AuthEventType type, Pageable pageable) {
		return authEvents.findAll(
				Specs.<AuthenticationEvent>eq("userId", userId).and(Specs.eq("eventType", type)), pageable);
	}

	public Page<AuthenticationEvent> authenticationEvents(AuthEventType type, AuthEventStatus status, String wallet,
			Instant from, Instant to, Pageable pageable) {
		return authEvents.findAll(Specs.<AuthenticationEvent>eq("eventType", type)
				.and(Specs.eq("eventStatus", status)).and(Specs.eq("walletAddress", wallet))
				.and(Specs.between("occurredAt", from, to)), pageable);
	}

	public Page<SecurityEvent> securityEvents(AttackType type, String wallet, Instant from, Instant to,
			Pageable pageable) {
		return securityEvents.findAll(Specs.<SecurityEvent>eq("attackType", type)
				.and(Specs.eq("walletAddress", wallet)).and(Specs.between("occurredAt", from, to)), pageable);
	}

	private AuthenticationEvent authEvent(AuthEventType type, AuthEventStatus status, String wallet, UUID userId,
			UUID actorUserId, ErrorCode failureReason, ClientInfo client) {
		String userAgent = client.userAgent();
		if (userAgent != null && userAgent.length() > MAX_USER_AGENT_LENGTH) {
			userAgent = userAgent.substring(0, MAX_USER_AGENT_LENGTH);
		}
		return new AuthenticationEvent(userId, actorUserId, wallet, type, status,
				failureReason == null ? null : failureReason.name(), clock.instant(), client.ip(), userAgent);
	}

	private void record(String what, Runnable write) {
		try {
			newTransaction.executeWithoutResult(status -> write.run());
		}
		catch (RuntimeException e) {
			log.error("Failed to record {}", what, e);
		}
	}

}
