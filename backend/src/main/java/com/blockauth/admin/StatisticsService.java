package com.blockauth.admin;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.blockauth.audit.AttackType;
import com.blockauth.audit.AuthEventStatus;
import com.blockauth.audit.AuthEventType;
import com.blockauth.audit.AuthenticationEventRepository;
import com.blockauth.audit.AuthenticationEventRepository.OutcomeCount;
import com.blockauth.audit.SecurityEventRepository;
import com.blockauth.common.ErrorCode;
import com.blockauth.user.UserRepository;
import com.blockauth.user.UserRepository.StatusCount;
import com.blockauth.user.UserStatus;

@Service
public class StatisticsService {

	public record Statistics(long totalUsers, long activeWallets, long revokedWallets, long authenticationAttempts,
			long successfulAttempts, long failedAttempts, long blockedAttempts, long invalidSignatureAttempts,
			long replayAttempts, long revokedWalletAttempts, long securityEventsTotal,
			Map<AttackType, Long> securityEventsByType) {
	}

	private static final Set<String> INVALID_SIGNATURE_REASONS = Set.of(ErrorCode.INVALID_SIGNATURE.name(),
			ErrorCode.SIGNATURE_MISMATCH.name());

	private final UserRepository users;
	private final AuthenticationEventRepository authEvents;
	private final SecurityEventRepository securityEvents;

	public StatisticsService(UserRepository users, AuthenticationEventRepository authEvents,
			SecurityEventRepository securityEvents) {
		this.users = users;
		this.authEvents = authEvents;
		this.securityEvents = securityEvents;
	}

	/**
	 * All-time counts; "attempts" are LOGIN events. Three grouped queries in one read-only transaction:
	 * the totals are derived here rather than fetched one count at a time.
	 */
	@Transactional(readOnly = true)
	public Statistics statistics() {
		List<StatusCount> userCounts = users.countPerStatus();
		List<OutcomeCount> logins = authEvents.countOutcomes(AuthEventType.LOGIN);

		Map<AttackType, Long> byType = new EnumMap<>(AttackType.class);
		for (AttackType type : AttackType.values()) {
			byType.put(type, 0L);
		}
		securityEvents.countByType().forEach(c -> byType.put(c.getAttackType(), c.getTotal()));

		return new Statistics(
				userCounts.stream().mapToLong(StatusCount::getTotal).sum(),
				usersWith(userCounts, UserStatus.ACTIVE),
				usersWith(userCounts, UserStatus.REVOKED),
				sum(logins, o -> true),
				sum(logins, o -> o.getStatus() == AuthEventStatus.SUCCESS),
				sum(logins, o -> o.getStatus() == AuthEventStatus.FAILURE),
				sum(logins, o -> o.getStatus() == AuthEventStatus.BLOCKED),
				sum(logins, failedBecause(INVALID_SIGNATURE_REASONS)),
				sum(logins, failedBecause(Set.of(ErrorCode.CHALLENGE_ALREADY_USED.name()))),
				sum(logins, failedBecause(Set.of(ErrorCode.WALLET_REVOKED.name()))),
				byType.values().stream().mapToLong(Long::longValue).sum(),
				byType);
	}

	private static long usersWith(List<StatusCount> counts, UserStatus status) {
		return counts.stream().filter(c -> c.getStatus() == status).mapToLong(StatusCount::getTotal).sum();
	}

	private static long sum(List<OutcomeCount> outcomes, Predicate<OutcomeCount> filter) {
		return outcomes.stream().filter(filter).mapToLong(OutcomeCount::getTotal).sum();
	}

	private static Predicate<OutcomeCount> failedBecause(Set<String> reasons) {
		return o -> o.getStatus() == AuthEventStatus.FAILURE && reasons.contains(o.getReason());
	}

}
