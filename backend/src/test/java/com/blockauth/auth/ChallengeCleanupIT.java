package com.blockauth.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.blockauth.Api;
import com.blockauth.IntegrationTest;
import com.blockauth.TestWallet;

/** FR-29 against the real table: only challenges expired for more than 24 hours are deleted. */
class ChallengeCleanupIT extends IntegrationTest {

	@Autowired
	private ChallengeCleanupJob job;

	@Test
	void deletesOnlyChallengesExpiredMoreThanADayAgo() {
		Api api = browser();
		TestWallet old = new TestWallet();
		TestWallet recent = new TestWallet();
		challenge(api, old, "/api/auth/challenge");

		// One minute short of 24 hours after the first challenge expired.
		clock.advance(Duration.ofHours(24).plusMinutes(1));
		challenge(api, recent, "/api/auth/challenge");
		job.deleteExpiredChallenges();
		assertThat(count("select count(*) from authentication_challenges")).isEqualTo(2);

		clock.advance(Duration.ofMinutes(2));
		job.deleteExpiredChallenges();

		assertThat(count("select count(*) from authentication_challenges")).isEqualTo(1);
		assertThat(count("select count(*) from authentication_challenges where wallet_address = ?", recent.address()))
				.isEqualTo(1);
	}

}
