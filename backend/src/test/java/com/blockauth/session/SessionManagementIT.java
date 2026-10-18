package com.blockauth.session;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.stream.StreamSupport;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import tools.jackson.databind.JsonNode;

import com.blockauth.Api;
import com.blockauth.IntegrationTest;
import com.blockauth.TestWallet;
import com.blockauth.common.Tokens;

/** Sessions and devices: listed per user, ended from another device, enforced on the server. */
class SessionManagementIT extends IntegrationTest {

	private final TestWallet wallet = new TestWallet();

	@Autowired
	private SessionLifecycle lifecycle;

	private static String id(JsonNode list, boolean current) {
		return StreamSupport.stream(list.spliterator(), false)
			.filter(n -> n.get("current").asBoolean() == current)
			.findFirst()
			.orElseThrow()
			.get("id")
			.asString();
	}

	private Api secondDevice() {
		Api phone = browser();
		assertThat(login(phone, wallet).status()).isEqualTo(200);
		return phone;
	}

	@Test
	void sessionsAreListedAndAnotherOneCanBeEndedRemotely() {
		Api laptop = registeredAndLoggedIn(wallet);
		Api phone = secondDevice();

		Api.Response sessions = laptop.get("/api/users/sessions");
		assertThat(sessions.status()).isEqualTo(200);
		assertThat(sessions.body()).hasSize(2);
		assertShape(sessions.body().get(0), "id", "device", "ipAddress", "createdAt", "lastSeenAt", "secondStep",
				"current");
		assertThat(laptop.get("/api/users/devices").body()).hasSize(2);

		assertThat(laptop.post("/api/users/sessions/" + id(sessions.body(), true) + "/end", null).code())
			.isEqualTo("CURRENT_DEVICE");
		assertThat(laptop.post("/api/users/sessions/" + id(sessions.body(), false) + "/end", null).status())
			.isEqualTo(204);

		Api.Response me = phone.get("/api/users/me");
		assertThat(me.status()).isEqualTo(401);
		assertThat(me.code()).isEqualTo("SESSION_REVOKED");
		assertThat(laptop.get("/api/users/me").status()).isEqualTo(200);
		assertThat(count("select count(*) from user_sessions where end_reason = 'REMOTE_LOGOUT'")).isEqualTo(1);
		assertThat(count("select count(*) from authentication_events where event_type = 'REMOTE_LOGOUT'")).isEqualTo(1);
	}

	@Test
	void signOutEverywhereElseKeepsOnlyTheCurrentSession() {
		Api laptop = registeredAndLoggedIn(wallet);
		Api phone = secondDevice();
		Api tablet = secondDevice();

		Api.Response ended = laptop.post("/api/users/sessions/end-others", null);

		assertThat(ended.body().get("ended").asInt()).isEqualTo(2);
		assertThat(phone.get("/api/users/me").code()).isEqualTo("SESSION_REVOKED");
		assertThat(tablet.get("/api/users/me").code()).isEqualTo("SESSION_REVOKED");
		assertThat(laptop.get("/api/users/sessions").body()).hasSize(1);
	}

	@Test
	void anotherUsersSessionsAndDevicesAreNotReachable() {
		Api mine = registeredAndLoggedIn(wallet);
		Api other = registeredAndLoggedIn(new TestWallet());
		String otherSession = other.get("/api/users/sessions").body().get(0).get("id").asString();
		String otherDevice = other.get("/api/users/devices").body().get(0).get("id").asString();

		assertThat(mine.post("/api/users/sessions/" + otherSession + "/end", null).status()).isEqualTo(404);
		assertThat(mine.post("/api/users/devices/" + otherDevice + "/remove", null).status()).isEqualTo(404);
		assertThat(mine.get("/api/users/sessions").body()).hasSize(1);
		assertThat(other.get("/api/users/me").status()).isEqualTo(200);
	}

	@Test
	void removingADeviceEndsItsSessionsAndForgetsIt() {
		Api laptop = registeredAndLoggedIn(wallet);
		Api phone = secondDevice();
		JsonNode devices = laptop.get("/api/users/devices").body();

		assertThat(laptop.post("/api/users/devices/" + id(devices, true) + "/remove", null).code())
			.isEqualTo("CURRENT_DEVICE");
		assertThat(laptop.post("/api/users/devices/" + id(devices, false) + "/remove", null).status()).isEqualTo(204);

		assertThat(phone.get("/api/users/me").code()).isEqualTo("SESSION_REVOKED");
		assertThat(laptop.get("/api/users/devices").body()).hasSize(1);
		assertThat(count("select count(*) from authentication_events where event_type = 'DEVICE_REMOVED'")).isEqualTo(1);
	}

	@Test
	void theDeviceCookieIsHttpOnlyAndOnlyItsHashIsStored() {
		Api api = browser();
		register(api, wallet);
		Api.Response first = login(api, wallet);

		String cookie = first.setCookies().stream().filter(c -> c.startsWith("BLOCKAUTH_DEVICE=")).findFirst().orElseThrow();
		assertThat(cookie).contains("HttpOnly").contains("SameSite=Strict").contains("Path=/").contains("Max-Age=");
		String token = api.cookies.get("BLOCKAUTH_DEVICE");
		assertThat(count("select count(*) from devices where token_hash = ?", Tokens.sha256Hex(token))).isEqualTo(1);
		assertThat(count("select count(*) from devices where token_hash = ?", token)).isZero();

		// The same browser is recognised: no second device, no new cookie.
		Api.Response again = login(api, wallet);
		assertThat(again.setCookies()).noneMatch(c -> c.startsWith("BLOCKAUTH_DEVICE="));
		assertThat(count("select count(*) from devices")).isEqualTo(1);
	}

	@Test
	void signingInAgainAndLoggingOutCloseTheirRecords() {
		Api api = registeredAndLoggedIn(wallet);
		assertThat(login(api, wallet).status()).isEqualTo(200);
		assertThat(api.post("/api/auth/logout", null).status()).isEqualTo(204);

		assertThat(count("select count(*) from user_sessions where end_reason = 'RELOGIN'")).isEqualTo(1);
		assertThat(count("select count(*) from user_sessions where end_reason = 'LOGOUT'")).isEqualTo(1);
		assertThat(count("select count(*) from user_sessions where ended_at is null")).isZero();
	}

	@Test
	void aRestartClosesEveryOpenRecordAndItsSessionStopsWorking() {
		Api api = registeredAndLoggedIn(wallet);

		lifecycle.closeRecordsOfThePreviousRun();

		assertThat(api.get("/api/users/me").code()).isEqualTo("SESSION_REVOKED");
		assertThat(count("select count(*) from user_sessions where end_reason = 'RESTART'")).isEqualTo(1);
	}

}
