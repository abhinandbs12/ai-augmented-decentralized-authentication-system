package com.blockauth.risk;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

import com.blockauth.common.ErrorCode;
import com.blockauth.config.SecuritySettings;
import com.blockauth.risk.TrustPolicy.Decision;
import com.blockauth.risk.TrustPolicy.Rule;

/** When the score cannot be computed, the sign-in is never let through on the signature alone. */
class TrustServiceTest {

	private static final String WALLET = "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed";

	private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
	private final LoginAssessmentRepository assessments = mock(LoginAssessmentRepository.class);
	private final TrustService trust = new TrustService(jdbc, assessments,
			new SecuritySettings(Base64.getEncoder().encodeToString(new byte[32]), 30, java.time.Duration.ofMinutes(10),
					90, new SecuritySettings.Trust(90, 50, 30, 20, 35, 25, 3, 35, 3)),
			Clock.fixed(Instant.parse("2026-10-15T00:00:00Z"), ZoneOffset.UTC));

	@SuppressWarnings("unchecked")
	private void databaseFails() {
		when(jdbc.queryForObject(anyString(), any(SqlParameterSource.class), any(RowMapper.class)))
			.thenThrow(new DataAccessResourceFailureException("down"));
	}

	@Test
	void withoutASecondStepAFailedCheckRefuses() {
		databaseFails();

		TrustService.Assessment assessment = trust.assess(UUID.randomUUID(), WALLET, null, "10.0.0.1", false);

		assertThat(assessment.decision()).isEqualTo(Decision.REFUSE);
		assertThat(assessment.failure()).isEqualTo(ErrorCode.RISK_CHECK_UNAVAILABLE);
		assertThat(assessment.rules()).containsExactly(Rule.CHECK_UNAVAILABLE);
	}

	@Test
	void withASecondStepAFailedCheckAsksForTheCode() {
		databaseFails();

		TrustService.Assessment assessment = trust.assess(UUID.randomUUID(), WALLET, null, "10.0.0.1", true);

		assertThat(assessment.decision()).isEqualTo(Decision.SECOND_STEP);
		ArgumentCaptor<LoginAssessment> recorded = ArgumentCaptor.forClass(LoginAssessment.class);
		verify(assessments).save(recorded.capture());
		assertThat(recorded.getValue().getRules()).isEqualTo("CHECK_UNAVAILABLE");
		assertThat(recorded.getValue().getScore()).isZero();
	}

}
