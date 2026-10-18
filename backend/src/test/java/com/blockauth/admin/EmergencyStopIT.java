package com.blockauth.admin;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.blockauth.Api;
import com.blockauth.IntegrationTest;
import com.blockauth.TestWallet;

/** The emergency stop: switched on at once with a fresh signature, lifted only after the waiting period. */
class EmergencyStopIT extends IntegrationTest {

	private static final Duration AFTER_DELAY = Duration.ofMinutes(10).plusSeconds(1);

	@Autowired
	private AdminActionService actions;

	private final TestWallet user = new TestWallet();
	private Api admin;

	@BeforeEach
	void setUp() {
		admin = registeredAndLoggedIn(ADMIN);
	}

	private Map<String, Object> stopBody(boolean signedBlockLogins, boolean blockLogins, boolean endUserSessions) {
		Map<String, Object> body = new LinkedHashMap<>(proof(admin, ADMIN, "START_EMERGENCY_STOP",
				Map.of("blockLogins", signedBlockLogins, "endUserSessions", endUserSessions)));
		body.put("reason", "Suspected theft of an administrator key");
		body.put("blockLogins", blockLogins);
		body.put("endUserSessions", endUserSessions);
		return body;
	}

	private void switchOn(boolean blockLogins, boolean endUserSessions) {
		Api.Response response = admin.post("/api/admin/emergency-stop/activate",
				stopBody(blockLogins, blockLogins, endUserSessions));
		assertThat(response.status()).as(response.body().toString()).isEqualTo(200);
	}

	private Api.Response lift() {
		return admin.post("/api/admin/emergency-stop/lift", proof(admin, ADMIN, "LIFT_EMERGENCY_STOP", Map.of()));
	}

	private boolean active() {
		return admin.get("/api/admin/emergency-stop").body().get("active").asBoolean();
	}

	@Test
	void theStateIsVisibleToAdministratorsOnly() {
		Api.Response state = admin.get("/api/admin/emergency-stop");

		assertShape(state.body(), "active", "blockLogins", "reason", "changedBy", "changedAt");
		assertThat(state.body().get("active").asBoolean()).isFalse();
		assertThat(registeredAndLoggedIn(user).get("/api/admin/emergency-stop").status()).isEqualTo(403);
	}

	@Test
	void switchingItOnNeedsAReasonAndASignatureForTheExactSettings() {
		Map<String, Object> tampered = stopBody(true, false, false);
		assertThat(admin.post("/api/admin/emergency-stop/activate", tampered).code()).isEqualTo("STEP_UP_FAILED");
		Map<String, Object> noReason = stopBody(false, false, false);
		noReason.put("reason", "");
		assertThat(admin.post("/api/admin/emergency-stop/activate", noReason).code()).isEqualTo("VALIDATION_FAILED");
		assertThat(active()).isFalse();

		Api.Response on = admin.post("/api/admin/emergency-stop/activate", stopBody(true, true, false));

		assertThat(on.status()).isEqualTo(200);
		assertThat(on.body().get("active").asBoolean()).isTrue();
		assertThat(on.body().get("blockLogins").asBoolean()).isTrue();
		assertThat(on.body().get("reason").asString()).isEqualTo("Suspected theft of an administrator key");
		assertThat(count("select count(*) from authentication_events where event_type = 'EMERGENCY_STOP_ON'"))
			.isEqualTo(1);
		assertThat(admin.post("/api/admin/emergency-stop/activate", stopBody(false, false, false)).code())
			.isEqualTo("EMERGENCY_STOP_ALREADY_ACTIVE");
	}

	@Test
	void twoSimultaneousActivationsSwitchItOnOnce() {
		Map<String, Object> first = stopBody(true, true, false);
		Map<String, Object> second = stopBody(false, false, false);
		Api other = sameSession(admin);

		List<Api.Response> responses = concurrently(List.<Supplier<Api.Response>>of(
				() -> admin.post("/api/admin/emergency-stop/activate", first),
				() -> other.post("/api/admin/emergency-stop/activate", second)));

		assertThat(responses).extracting(Api.Response::status).containsExactlyInAnyOrder(200, 409);
		assertThat(responses).filteredOn(r -> r.status() == 409).extracting(Api.Response::code)
			.containsExactly("EMERGENCY_STOP_ALREADY_ACTIVE");
		assertThat(count("select count(*) from authentication_events where event_type = 'EMERGENCY_STOP_ON'"))
			.isEqualTo(1);
		assertThat(active()).isTrue();
	}

	@Test
	void whileOnChangesThatGrantAccessAreRefusedButRevokingStillWorks() {
		TestWallet other = new TestWallet();
		Api signedIn = registeredAndLoggedIn(user);
		register(browser(), other);
		switchOn(false, false);

		Api.Response registration = register(browser(), new TestWallet());
		assertThat(registration.status()).isEqualTo(503);
		assertThat(registration.code()).isEqualTo("EMERGENCY_STOP_ACTIVE");
		// Revoking a wallet is containment, so it stays possible.
		assertThat(admin.post("/api/admin/wallet/" + other.checksumAddress() + "/revoke",
				proof(admin, ADMIN, "REVOKE_WALLET", other)).status()).isEqualTo(200);
		assertThat(admin.post("/api/admin/wallet/" + other.checksumAddress() + "/activate",
				proof(admin, ADMIN, "ACTIVATE_WALLET", other)).code()).isEqualTo("EMERGENCY_STOP_ACTIVE");
		assertThat(admin.post("/api/admin/wallet/" + user.checksumAddress() + "/second-step/reset",
				proof(admin, ADMIN, "RESET_SECOND_STEP", user)).code()).isEqualTo("EMERGENCY_STOP_ACTIVE");
		assertThat(admin.post("/api/admin/wallet-flags/" + user.checksumAddress() + "/remove",
				proof(admin, ADMIN, "UNFLAG_WALLET", user)).code()).isEqualTo("EMERGENCY_STOP_ACTIVE");
		Map<String, Object> key = Map.of("name", "Reporting", "scopes", List.of("audit:read"), "days", 30);
		Map<String, Object> keyBody = new LinkedHashMap<>(proof(admin, ADMIN, "CREATE_API_KEY", key));
		keyBody.putAll(key);
		assertThat(admin.post("/api/admin/api-keys", keyBody).code()).isEqualTo("EMERGENCY_STOP_ACTIVE");
		assertThat(count("select count(*) from admin_actions")).isZero();
		assertThat(count("select count(*) from api_keys")).isZero();
		// Sign-ins were not blocked this time: the user's session and new sign-ins still work.
		assertThat(signedIn.get("/api/users/me").status()).isEqualTo(200);
		assertThat(login(browser(), user).status()).isEqualTo(200);
	}

	@Test
	void blockingSignInsStopsUsersButNeverAdministrators() {
		Api signedIn = registeredAndLoggedIn(user);

		switchOn(true, true);

		assertThat(signedIn.get("/api/users/me").code()).isEqualTo("SESSION_REVOKED");
		assertThat(count("select count(*) from user_sessions where end_reason = 'EMERGENCY_STOP'")).isEqualTo(1);
		Api.Response refused = login(browser(), user);
		assertThat(refused.status()).isEqualTo(503);
		assertThat(refused.code()).isEqualTo("EMERGENCY_STOP_ACTIVE");
		assertThat(admin.get("/api/users/me").status()).isEqualTo(200);
		assertThat(login(browser(), ADMIN).status()).isEqualTo(200);
	}

	@Test
	void liftingTakesEffectOnlyAfterTheWaitingPeriod() {
		switchOn(true, false);

		Api.Response lift = lift();

		assertThat(lift.status()).isEqualTo(202);
		assertShape(lift.body(), "id", "action", "targetWallet", "requestedBy", "requestedAt", "executeAfter", "status",
				"decidedAt", "failureReason");
		assertThat(lift.body().get("action").asString()).isEqualTo("LIFT_EMERGENCY_STOP");
		assertThat(lift.body().get("status").asString()).isEqualTo("PENDING");
		actions.runDue();
		assertThat(active()).isTrue();
		assertThat(lift().code()).isEqualTo("ADMIN_ACTION_ALREADY_PENDING");

		clock.advance(AFTER_DELAY);
		actions.runDue();

		assertThat(active()).isFalse();
		assertThat(count("select count(*) from authentication_events where event_type = 'EMERGENCY_STOP_OFF'"))
			.isEqualTo(1);
		assertThat(count("select count(*) from admin_actions where status = 'EXECUTED'")).isEqualTo(1);
		assertThat(lift().code()).isEqualTo("EMERGENCY_STOP_NOT_ACTIVE");
		assertThat(registeredAndLoggedIn(user).get("/api/users/me").status()).isEqualTo(200);
	}

	@Test
	void aCancelledLiftLeavesTheStopOn() {
		switchOn(false, false);
		long id = lift().body().get("id").asLong();

		assertThat(admin.post("/api/admin/actions/" + id + "/cancel", null).body().get("status").asString())
			.isEqualTo("CANCELLED");
		clock.advance(AFTER_DELAY);
		actions.runDue();

		assertThat(active()).isTrue();
	}

	@Test
	void actionsRequestedBeforeTheStopWaitUntilItIsLifted() {
		register(browser(), user);
		assertThat(admin.post("/api/admin/wallet/" + user.checksumAddress() + "/revoke",
				proof(admin, ADMIN, "REVOKE_WALLET", user)).status()).isEqualTo(200);
		assertThat(admin.post("/api/admin/wallet/" + user.checksumAddress() + "/activate",
				proof(admin, ADMIN, "ACTIVATE_WALLET", user)).status()).isEqualTo(202);
		switchOn(false, false);

		clock.advance(AFTER_DELAY);
		actions.runDue();
		assertThat(chain.get(user.address()).active()).isFalse();

		lift();
		clock.advance(AFTER_DELAY);
		actions.runDue();
		actions.runDue();

		assertThat(active()).isFalse();
		assertThat(chain.get(user.address()).active()).isTrue();
	}

}
