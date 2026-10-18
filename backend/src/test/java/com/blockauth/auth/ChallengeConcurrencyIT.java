package com.blockauth.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;

import org.junit.jupiter.api.Test;

import com.blockauth.Api;
import com.blockauth.IntegrationTest;
import com.blockauth.TestWallet;

class ChallengeConcurrencyIT extends IntegrationTest {

	@Test
	void twoSimultaneousVerificationsOfOneChallengeYieldExactlyOneSession() throws Exception {
		TestWallet wallet = new TestWallet();
		Api first = browser();
		Api second = browser();
		register(first, wallet);
		Map<String, String> body = signed(wallet, challenge(first, wallet, "/api/auth/challenge"), wallet);
		first.get("/api/auth/csrf");
		second.get("/api/auth/csrf");

		CountDownLatch start = new CountDownLatch(1);
		List<CompletableFuture<Api.Response>> attempts = List.of(first, second).stream()
				.map(api -> CompletableFuture.supplyAsync(() -> {
					try {
						start.await();
					}
					catch (InterruptedException e) {
						Thread.currentThread().interrupt();
					}
					return api.post("/api/auth/verify", body);
				})).toList();
		start.countDown();
		List<Api.Response> responses = List.of(attempts.get(0).get(), attempts.get(1).get());

		assertThat(responses).extracting(Api.Response::status).containsExactlyInAnyOrder(200, 401);
		assertThat(responses).filteredOn(r -> r.status() == 401).extracting(Api.Response::code)
				.containsExactly("CHALLENGE_ALREADY_USED");
		assertThat(count("select count(*) from authentication_events where event_type = 'LOGIN' "
				+ "and event_status = 'SUCCESS'")).isEqualTo(1);
	}

}
