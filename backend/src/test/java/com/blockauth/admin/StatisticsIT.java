package com.blockauth.admin;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;

import com.blockauth.Api;
import com.blockauth.IntegrationTest;
import com.blockauth.TestWallet;

import tools.jackson.databind.JsonNode;

/** IT-12: after a scripted scenario the statistics equal what actually happened. */
class StatisticsIT extends IntegrationTest {

	@Test
	void emptySystemReportsZeroesForEveryCounterAndAttackType() {
		// Only the admin exists and has logged in once.
		JsonNode stats = registeredAndLoggedIn(ADMIN).get("/api/admin/statistics").body();

		assertShape(stats, "totalUsers", "activeWallets", "revokedWallets", "authenticationAttempts",
				"successfulAttempts", "failedAttempts", "blockedAttempts", "invalidSignatureAttempts",
				"replayAttempts", "revokedWalletAttempts", "securityEventsTotal", "securityEventsByType");
		assertThat(stats.get("totalUsers").asInt()).isEqualTo(1);
		assertThat(stats.get("authenticationAttempts").asInt()).isEqualTo(1);
		assertThat(stats.get("successfulAttempts").asInt()).isEqualTo(1);
		assertThat(stats.get("failedAttempts").asInt()).isZero();
		assertThat(stats.get("securityEventsTotal").asInt()).isZero();
		assertShape(stats.get("securityEventsByType"), "REPLAY_ATTEMPT", "EXPIRED_CHALLENGE", "INVALID_CHALLENGE",
				"INVALID_SIGNATURE", "SIGNATURE_MISMATCH", "UNREGISTERED_WALLET", "REVOKED_WALLET_ATTEMPT",
				"PRIVILEGE_ESCALATION_ATTEMPT", "CSRF_REJECTED", "RATE_LIMIT_EXCEEDED", "IP_TEMPORARILY_BLOCKED",
				"SECOND_STEP_FAILED", "STEP_UP_FAILED", "LOW_TRUST_LOGIN", "INVALID_API_KEY");
		assertThat(stats.get("securityEventsByType")).allSatisfy(total -> assertThat(total.asInt()).isZero());
	}

	@Test
	void statisticsMatchTheScenario() {
		TestWallet userWallet = new TestWallet();
		Api admin = registeredAndLoggedIn(ADMIN);
		Api user = browser();
		register(user, userWallet);
		Map<String, String> loginBody = signed(userWallet, challenge(user, userWallet, "/api/auth/challenge"),
				userWallet);
		assertThat(user.post("/api/auth/verify", loginBody).status()).isEqualTo(200);

		// One replay, one forged signature, then a revocation followed by one refused login.
		Api attacker = browser();
		assertThat(attacker.post("/api/auth/verify", loginBody).code()).isEqualTo("CHALLENGE_ALREADY_USED");
		assertThat(attacker.post("/api/auth/verify",
				signed(userWallet, challenge(attacker, userWallet, "/api/auth/challenge"), new TestWallet())).code())
				.isEqualTo("SIGNATURE_MISMATCH");
		assertThat(admin.post("/api/admin/wallet/" + userWallet.checksumAddress() + "/revoke",
				proof(admin, ADMIN, "REVOKE_WALLET", userWallet)).status()).isEqualTo(200);
		assertThat(login(browser(), userWallet).code()).isEqualTo("WALLET_REVOKED");
		// A logout is an authentication event but not a sign-in attempt.
		assertThat(browser().post("/api/auth/logout", null).status()).isEqualTo(204);

		JsonNode stats = admin.get("/api/admin/statistics").body();

		assertThat(stats.get("totalUsers").asInt()).isEqualTo(2);
		assertThat(stats.get("activeWallets").asInt()).isEqualTo(1);
		assertThat(stats.get("revokedWallets").asInt()).isEqualTo(1);
		assertThat(stats.get("authenticationAttempts").asInt()).isEqualTo(5);
		assertThat(stats.get("successfulAttempts").asInt()).isEqualTo(2);
		assertThat(stats.get("failedAttempts").asInt()).isEqualTo(3);
		assertThat(stats.get("blockedAttempts").asInt()).isZero();
		assertThat(stats.get("invalidSignatureAttempts").asInt()).isEqualTo(1);
		assertThat(stats.get("replayAttempts").asInt()).isEqualTo(1);
		assertThat(stats.get("revokedWalletAttempts").asInt()).isEqualTo(1);
		assertThat(stats.get("securityEventsTotal").asInt()).isEqualTo(3);
		JsonNode byType = stats.get("securityEventsByType");
		assertThat(byType.get("REPLAY_ATTEMPT").asInt()).isEqualTo(1);
		assertThat(byType.get("SIGNATURE_MISMATCH").asInt()).isEqualTo(1);
		assertThat(byType.get("REVOKED_WALLET_ATTEMPT").asInt()).isEqualTo(1);
		assertThat(byType.get("CSRF_REJECTED").asInt()).isZero();

		// The numbers are the database aggregates, not a separate tally.
		assertThat(stats.get("authenticationAttempts").asLong())
				.isEqualTo(count("select count(*) from authentication_events where event_type = 'LOGIN'"));
		assertThat(stats.get("securityEventsTotal").asLong()).isEqualTo(count("select count(*) from security_events"));
	}

}
