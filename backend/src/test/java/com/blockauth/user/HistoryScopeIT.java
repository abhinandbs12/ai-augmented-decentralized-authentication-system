package com.blockauth.user;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.blockauth.Api;
import com.blockauth.IntegrationTest;
import com.blockauth.TestWallet;

import tools.jackson.databind.JsonNode;

/** IT-13 / ST-18 / ST-12: a user sees only their own history; admin lists filter; stored text stays inert. */
class HistoryScopeIT extends IntegrationTest {

	private static final String SCRIPT_USER_AGENT = "<script>alert(1)</script><img src=x onerror=alert(1)>";

	private final TestWallet userWallet = new TestWallet();
	private Api admin;
	private Api user;

	/** Admin and user each register and log in; then the user's wallet is attacked twice. */
	@BeforeEach
	void scenario() {
		admin = registeredAndLoggedIn(ADMIN);
		user = browser();
		register(user, userWallet);
		Map<String, String> loginBody = signed(userWallet, challenge(user, userWallet, "/api/auth/challenge"),
				userWallet);
		assertThat(user.post("/api/auth/verify", loginBody).status()).isEqualTo(200);

		Api attacker = browser();
		assertThat(attacker.send("POST", "/api/auth/verify", Api.json(loginBody),
				Map.of("User-Agent", SCRIPT_USER_AGENT), true).code()).isEqualTo("CHALLENGE_ALREADY_USED");
		assertThat(attacker.post("/api/auth/verify",
				signed(userWallet, challenge(attacker, userWallet, "/api/auth/challenge"), new TestWallet())).code())
				.isEqualTo("SIGNATURE_MISMATCH");
	}

	@Test
	void userSeesOnlyOwnHistoryNewestFirst() {
		// A user id in the query string is not a parameter of this endpoint and changes nothing.
		String adminId = admin.get("/api/users/me").body().get("id").asString();
		JsonNode history = user.get("/api/users/authentication-history?userId=" + adminId).body();

		// Own registration, login, and the two attacks made against this wallet; nothing of the admin's.
		assertShape(history, "items", "page", "size", "totalElements", "totalPages");
		assertThat(history.get("totalElements").asInt()).isEqualTo(4);
		assertThat(history.get("size").asInt()).isEqualTo(20);
		assertShape(history.get("items").get(0), "id", "eventType", "eventStatus", "failureReason", "occurredAt",
				"ipAddress");
		assertThat(history.get("items").get(0).get("failureReason").asString()).isEqualTo("SIGNATURE_MISMATCH");
		assertThat(history.get("items").get(1).get("failureReason").asString()).isEqualTo("CHALLENGE_ALREADY_USED");
		assertThat(history.get("items").get(2).get("eventStatus").asString()).isEqualTo("SUCCESS");
		assertThat(history.get("items").get(3).get("eventType").asString()).isEqualTo("REGISTRATION");
		assertThat(admin.get("/api/users/authentication-history").body().get("totalElements").asInt()).isEqualTo(2);
	}

	@Test
	void historyIsPagedAndFilterable() {
		JsonNode page = user.get("/api/users/authentication-history?size=1&page=1&eventType=LOGIN").body();

		assertThat(page.get("totalElements").asInt()).isEqualTo(3);
		assertThat(page.get("totalPages").asInt()).isEqualTo(3);
		assertThat(page.get("page").asInt()).isEqualTo(1);
		assertThat(page.get("items").size()).isEqualTo(1);
		assertThat(page.get("items").get(0).get("failureReason").asString()).isEqualTo("CHALLENGE_ALREADY_USED");
		assertThat(user.get("/api/users/authentication-history?size=100").status()).isEqualTo(200);
		assertThat(user.get("/api/users/authentication-history?page=9").body().get("items").isEmpty()).isTrue();

		assertThat(user.get("/api/users/authentication-history?size=101").status()).isEqualTo(400);
		assertThat(user.get("/api/users/authentication-history?eventType=NOPE").status()).isEqualTo(400);
	}

	@Test
	void adminEventListsFilter() {
		assertThat(total("/api/admin/authentication-events")).isEqualTo(6);
		assertThat(total("/api/admin/authentication-events?eventType=REGISTRATION")).isEqualTo(2);
		assertThat(total("/api/admin/authentication-events?eventType=LOGIN&eventStatus=FAILURE")).isEqualTo(2);
		assertThat(total("/api/admin/authentication-events?eventStatus=BLOCKED")).isZero();
		assertThat(total("/api/admin/authentication-events?walletAddress=" + ADMIN.checksumAddress())).isEqualTo(2);
		assertThat(total("/api/admin/authentication-events?from=2099-01-01T00:00:00Z")).isZero();
		assertThat(total("/api/admin/authentication-events?to=2099-01-01T00:00:00Z")).isEqualTo(6);
		assertThat(total("/api/admin/authentication-events?from=2000-01-01T00:00:00Z&to=2099-01-01T00:00:00Z"))
				.isEqualTo(6);

		assertThat(total("/api/admin/security-events")).isEqualTo(2);
		assertThat(total("/api/admin/security-events?attackType=REPLAY_ATTEMPT")).isEqualTo(1);
		assertThat(total("/api/admin/security-events?walletAddress=" + userWallet.address())).isEqualTo(2);
		assertThat(total("/api/admin/security-events?walletAddress=" + ADMIN.address())).isZero();
		assertThat(total("/api/admin/security-events?to=2000-01-01T00:00:00Z")).isZero();

		JsonNode authEvent = admin.get("/api/admin/authentication-events?size=1").body().get("items").get(0);
		assertShape(authEvent, "id", "userId", "actorUserId", "walletAddress", "eventType", "eventStatus",
				"failureReason", "occurredAt", "ipAddress", "userAgent");
		assertThat(authEvent.get("walletAddress").asString()).isEqualTo(userWallet.checksumAddress());
		JsonNode securityEvent = admin.get("/api/admin/security-events?size=1").body().get("items").get(0);
		assertShape(securityEvent, "id", "userId", "walletAddress", "attackType", "description", "result",
				"occurredAt", "ipAddress");
		assertThat(securityEvent.get("result").asString()).isEqualTo("BLOCKED");
	}

	@Test
	void hostileUserAgentIsStoredAndReturnedAsInertText() {
		Api.Response events = admin.get("/api/admin/authentication-events?eventType=LOGIN&eventStatus=FAILURE");

		assertThat(events.body().get("items").get(1).get("userAgent").asString()).isEqualTo(SCRIPT_USER_AGENT);
		// JSON with nosniff: a browser will never interpret this response as HTML.
		assertThat(events.headers().firstValue("Content-Type").orElseThrow()).startsWith("application/json");
		assertThat(events.headers().firstValue("X-Content-Type-Options")).contains("nosniff");
		// Descriptions are server text; nothing the attacker sent ends up in them.
		JsonNode event = admin.get("/api/admin/security-events?attackType=REPLAY_ATTEMPT").body().get("items").get(0);
		assertThat(event.get("description").asString()).doesNotContain("<");
	}

	@Test
	void overlongUserAgentIsTruncatedNotRejected() {
		String longAgent = "A".repeat(600);

		assertThat(browser().send("POST", "/api/auth/verify",
				Api.json(signed(userWallet, "never issued", userWallet)), Map.of("User-Agent", longAgent), true)
				.code()).isEqualTo("INVALID_CHALLENGE");

		assertThat(jdbc.queryForObject("select max(length(user_agent)) from authentication_events", Integer.class))
				.isEqualTo(512);
	}

	private int total(String path) {
		Api.Response response = admin.get(path);
		assertThat(response.status()).as(response.body().toString()).isEqualTo(200);
		return response.body().get("totalElements").asInt();
	}

}
