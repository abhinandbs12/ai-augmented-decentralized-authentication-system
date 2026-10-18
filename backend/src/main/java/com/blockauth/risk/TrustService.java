package com.blockauth.risk;

import java.sql.Types;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import com.blockauth.common.ErrorCode;
import com.blockauth.config.SecuritySettings;
import com.blockauth.risk.TrustPolicy.Decision;
import com.blockauth.risk.TrustPolicy.Rule;
import com.blockauth.risk.TrustPolicy.Signals;

/**
 * Scores a sign-in after its signature was verified. All signals come from the server's own records and
 * are read in one query, so the check costs a single database round trip. Every assessment is stored.
 */
@Service
public class TrustService {

	/** @param failure the error to refuse with when the decision is REFUSE */
	public record Assessment(int score, List<Rule> rules, Decision decision, ErrorCode failure) {
	}

	private static final Logger log = LoggerFactory.getLogger(TrustService.class);
	private static final Duration FAILURE_WINDOW = Duration.ofHours(1);

	// Wallets are linked only through devices both signed in on (never through a shared network, which
	// would link everyone behind one router), breadth-first up to the configured number of hops.
	private static final String SIGNALS = """
			select
			  exists (select 1 from user_sessions s where s.user_id = :userId) as has_history,
			  exists (select 1 from user_devices ud where ud.user_id = :userId and ud.device_id = cast(:deviceId as uuid)
			          and ud.removed_at is null and (not :secondStep or ud.trusted_until > :now)) as known_device,
			  exists (select 1 from user_sessions s where s.user_id = :userId and s.ip_address = :ip) as known_network,
			  exists (select 1 from wallet_flags f where f.wallet_address = :wallet) as flagged_wallet,
			  (select count(*) from authentication_events e where e.ip_address = :ip
			          and e.event_status in ('FAILURE', 'BLOCKED') and e.occurred_at > :since) as recent_failures,
			  exists (
			    with recursive reach (user_id, depth) as (
			      select cast(:userId as uuid), 0
			      union
			      select other.user_id, reach.depth + 1
			      from reach
			      join user_devices mine on mine.user_id = reach.user_id and mine.removed_at is null
			      join user_devices other on other.device_id = mine.device_id and other.removed_at is null
			      where reach.depth < :depth)
			    select 1 from reach
			    join users u on u.id = reach.user_id
			    join wallet_flags f on f.wallet_address = u.wallet_address
			    where reach.depth > 0 and reach.user_id <> cast(:userId as uuid)) as linked_to_flagged
			""";

	private final NamedParameterJdbcTemplate jdbc;
	private final LoginAssessmentRepository assessments;
	private final SecuritySettings settings;
	private final Clock clock;

	public TrustService(NamedParameterJdbcTemplate jdbc, LoginAssessmentRepository assessments,
			SecuritySettings settings, Clock clock) {
		this.jdbc = jdbc;
		this.assessments = assessments;
		this.settings = settings;
		this.clock = clock;
	}

	/**
	 * @param deviceId the device the browser was recognised as, or null for a new browser
	 * @param secondStepEnabled whether the wallet has a second step it could be asked for
	 */
	public Assessment assess(UUID userId, String wallet, UUID deviceId, String ip, boolean secondStepEnabled) {
		Instant now = clock.instant();
		Assessment assessment;
		try {
			Signals signals = signals(userId, wallet, deviceId, ip, secondStepEnabled, now);
			TrustPolicy.Score score = TrustPolicy.score(signals, settings.trust());
			Decision decision = TrustPolicy.decide(score.value(), secondStepEnabled, settings.trust());
			assessment = new Assessment(score.value(), score.rules(), decision, ErrorCode.LOGIN_RISK_TOO_HIGH);
		}
		catch (RuntimeException e) {
			// Never let a sign-in through because the check itself failed.
			log.error("Trust score could not be computed: {}", e.getClass().getSimpleName());
			assessment = new Assessment(0, List.of(Rule.CHECK_UNAVAILABLE),
					secondStepEnabled ? Decision.SECOND_STEP : Decision.REFUSE, ErrorCode.RISK_CHECK_UNAVAILABLE);
		}
		record(wallet, userId, deviceId, ip, assessment, now);
		return assessment;
	}

	private Signals signals(UUID userId, String wallet, UUID deviceId, String ip, boolean secondStep, Instant now) {
		MapSqlParameterSource parameters = new MapSqlParameterSource()
			.addValue("userId", userId, Types.OTHER)
			.addValue("deviceId", deviceId == null ? null : deviceId.toString(), Types.VARCHAR)
			.addValue("secondStep", secondStep)
			.addValue("now", OffsetDateTime.ofInstant(now, ZoneOffset.UTC))
			.addValue("since", OffsetDateTime.ofInstant(now.minus(FAILURE_WINDOW), ZoneOffset.UTC))
			.addValue("ip", ip)
			.addValue("wallet", wallet)
			.addValue("depth", settings.trust().graphDepth());
		return jdbc.queryForObject(SIGNALS, parameters,
				(rs, row) -> new Signals(rs.getBoolean("has_history"), rs.getBoolean("known_device"), rs.getBoolean("known_network"),
						rs.getBoolean("flagged_wallet"), rs.getLong("recent_failures"), rs.getBoolean("linked_to_flagged")));
	}

	private void record(String wallet, UUID userId, UUID deviceId, String ip, Assessment assessment, Instant now) {
		try {
			assessments.save(new LoginAssessment(wallet, userId, deviceId, ip, assessment.score(),
					assessment.rules().stream().map(Rule::name).collect(Collectors.joining(",")),
					assessment.decision(), now));
		}
		catch (RuntimeException e) {
			log.error("Failed to record a trust assessment: {}", e.getClass().getSimpleName());
		}
	}

}
