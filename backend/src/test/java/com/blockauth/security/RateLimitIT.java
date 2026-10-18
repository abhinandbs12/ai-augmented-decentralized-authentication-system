package com.blockauth.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.blockauth.Api;
import com.blockauth.IntegrationTest;
import com.blockauth.TestWallet;

/** IT-07 / ST-19 to ST-21: request limits, the pending-challenge cap and the temporary IP block. */
class RateLimitIT extends IntegrationTest {

	@Test
	void eleventhChallengeRequestInAMinuteIsLimitedDespiteSpoofedForwardedHeaders() {
		Api api = browser();
		api.get("/api/auth/csrf");
		for (int i = 0; i < 10; i++) {
			assertThat(requestChallenge(api, new TestWallet(), "/api/auth/challenge", i).status()).isEqualTo(201);
		}

		Api.Response eleventh = requestChallenge(api, new TestWallet(), "/api/auth/challenge", 10);
		Api.Response twelfth = requestChallenge(api, new TestWallet(), "/api/auth/register/challenge", 11);

		assertThat(eleventh.status()).isEqualTo(429);
		assertThat(eleventh.code()).isEqualTo("RATE_LIMITED");
		assertThat(Integer.parseInt(eleventh.headers().firstValue("Retry-After").orElseThrow())).isBetween(1, 60);
		// Both challenge endpoints share the limit.
		assertThat(twelfth.status()).isEqualTo(429);
		// Audited on the first rejection of the window, not once per rejected request.
		assertThat(count("select count(*) from security_events where attack_type = 'RATE_LIMIT_EXCEEDED'"))
				.isEqualTo(1);
		assertThat(count("select count(*) from authentication_events where event_status = 'BLOCKED' "
				+ "and failure_reason = 'RATE_LIMITED'")).isEqualTo(1);
		assertThat(count("select count(*) from authentication_challenges")).isEqualTo(10);

		clock.advance(Duration.ofSeconds(61));
		assertThat(requestChallenge(api, new TestWallet(), "/api/auth/challenge", 12).status()).isEqualTo(201);
	}

	@Test
	void percentEncodedPathsCannotEscapeTheLimits() {
		Api api = browser();
		api.get("/api/auth/csrf");
		for (int i = 0; i < 10; i++) {
			assertThat(requestChallenge(api, new TestWallet(), "/api/auth/challenge", i).status()).isEqualTo(201);
		}

		// The dispatcher routes both of these to the challenge endpoint, so the limiter must as well.
		assertThat(requestChallenge(api, new TestWallet(), "/api/auth/%63hallenge", 10).status()).isEqualTo(429);
		assertThat(requestChallenge(api, new TestWallet(), "/%61pi/auth/challenge", 11).status()).isEqualTo(429);
		assertThat(count("select count(*) from authentication_challenges")).isEqualTo(10);
	}

	@Test
	void verificationRequestsAreLimitedToTenAMinute() {
		Api api = browser();
		api.get("/api/auth/csrf");
		String body = "{\"walletAddress\":\"" + new TestWallet().checksumAddress()
				+ "\",\"challenge\":\"x\",\"signature\":\"0x00\"}";
		for (int i = 0; i < 10; i++) {
			// Malformed on purpose (400): these count as requests but not as authentication failures.
			assertThat(api.send("POST", i % 2 == 0 ? "/api/auth/verify" : "/api/auth/register", body, Map.of(), true)
					.status()).isEqualTo(400);
		}

		Api.Response eleventh = api.send("POST", "/api/auth/verify", body, Map.of(), true);

		assertThat(eleventh.status()).isEqualTo(429);
		assertThat(eleventh.code()).isEqualTo("RATE_LIMITED");
		assertThat(eleventh.headers().firstValue("Retry-After")).isPresent();
		// The other endpoints have their own budget.
		assertThat(requestChallenge(api, new TestWallet(), "/api/auth/challenge", 0).status()).isEqualTo(201);
		assertThat(api.get("/api/auth/csrf").status()).isEqualTo(200);
	}

	@Test
	void generalApiRequestsAreLimitedTo120AMinute() {
		Api api = browser();
		for (int i = 0; i < 120; i++) {
			assertThat(api.get("/api/auth/csrf").status()).isEqualTo(200);
		}

		Api.Response limited = api.get("/api/auth/csrf");

		assertThat(limited.status()).isEqualTo(429);
		assertThat(limited.code()).isEqualTo("RATE_LIMITED");
		assertThat(limited.headers().firstValue("Retry-After")).isPresent();
		assertThat(count("select count(*) from security_events where attack_type = 'RATE_LIMIT_EXCEEDED'"))
				.isEqualTo(1);
		// The health endpoint is outside /api and is never limited.
		assertThat(api.get("/actuator/health").status()).isEqualTo(200);
	}

	@Test
	void oneWalletCannotCollectMoreThanFiveChallengesAMinute() {
		Api api = browser();
		TestWallet wallet = new TestWallet();
		for (int i = 0; i < 5; i++) {
			assertThat(requestChallenge(api, wallet, "/api/auth/challenge", i).status()).isEqualTo(201);
		}

		Api.Response sixth = requestChallenge(api, wallet, "/api/auth/challenge", 5);

		assertThat(sixth.status()).isEqualTo(429);
		assertThat(sixth.code()).isEqualTo("RATE_LIMITED");
		assertThat(sixth.headers().firstValue("Retry-After")).isPresent();
		assertThat(count("select count(*) from security_events where attack_type = 'RATE_LIMIT_EXCEEDED' "
				+ "and wallet_address = ?", wallet.address())).isEqualTo(1);
		assertThat(requestChallenge(api, new TestWallet(), "/api/auth/challenge", 6).status()).isEqualTo(201);
	}

	@Test
	void tenFailedVerificationsBlockTheIpForFifteenMinutes() {
		Api api = browser();
		for (int i = 0; i < 10; i++) {
			// Valid signatures from wallets that were never registered: each is a 403 failure.
			assertThat(login(api, new TestWallet()).status()).isEqualTo(403);
			if (i == 4) {
				// Stay under the per-minute request limits; only the failure count should trigger the block.
				clock.advance(Duration.ofSeconds(61));
			}
		}

		TestWallet registered = new TestWallet();
		Api.Response blocked = requestChallenge(api, registered, "/api/auth/challenge", 0);

		assertThat(blocked.status()).isEqualTo(429);
		assertThat(blocked.code()).isEqualTo("IP_TEMPORARILY_BLOCKED");
		assertThat(Integer.parseInt(blocked.headers().firstValue("Retry-After").orElseThrow())).isBetween(1, 900);
		assertThat(api.post("/api/auth/verify", signed(registered, "x", registered)).code())
				.isEqualTo("IP_TEMPORARILY_BLOCKED");
		// Recorded once for the block, not once per refused request.
		assertThat(count("select count(*) from security_events where attack_type = 'IP_TEMPORARILY_BLOCKED'"))
				.isEqualTo(1);
		// Only the authentication endpoints are blocked.
		assertThat(api.get("/api/auth/csrf").status()).isEqualTo(200);
		assertThat(api.post("/api/auth/logout", null).status()).isEqualTo(204);

		clock.advance(Duration.ofMinutes(15).plusSeconds(1));
		assertThat(register(api, registered).status()).isEqualTo(201);
		assertThat(login(api, registered).status()).isEqualTo(200);
	}

	/** Each request claims a different forwarded address; outside the prod profile that must change nothing. */
	private static Api.Response requestChallenge(Api api, TestWallet wallet, String path, int n) {
		return api.send("POST", path, "{\"walletAddress\":\"" + wallet.checksumAddress() + "\"}",
				Map.of("X-Forwarded-For", "203.0.113." + (n + 1)), true);
	}

}
