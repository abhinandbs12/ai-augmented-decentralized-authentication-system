package com.blockauth.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.blockauth.Api;
import com.blockauth.IntegrationTest;
import com.blockauth.TestWallet;
import com.blockauth.admin.AdminActionService;

/** IT-04 / ST-17: every row of the endpoint authorization matrix for anonymous, USER and ADMIN callers. */
class AuthorizationMatrixIT extends IntegrationTest {

	@Autowired
	private AdminActionService adminActions;

	private final TestWallet userWallet = new TestWallet();
	private final TestWallet victim = new TestWallet();

	private List<String> userEndpoints() {
		return List.of("/api/users/me", "/api/users/authentication-history", "/api/users/wallet-status",
				"/api/users/sessions", "/api/users/devices", "/api/users/alerts", "/api/users/second-step");
	}

	private List<String> adminGets() {
		return List.of("/api/admin/users", "/api/admin/authentication-events", "/api/admin/security-events",
				"/api/admin/statistics", "/api/admin/login-assessments", "/api/admin/wallet-flags",
				"/api/admin/emergency-stop", "/api/admin/actions", "/api/admin/api-keys",
				"/api/blockchain/wallet/" + victim.checksumAddress(), "/api/blockchain/verify/" + victim.checksumAddress());
	}

	private List<String> adminPosts() {
		return List.of("/api/admin/wallet/" + victim.checksumAddress() + "/revoke",
				"/api/admin/wallet/" + victim.checksumAddress() + "/activate",
				"/api/admin/wallet/" + victim.checksumAddress() + "/second-step/reset", "/api/admin/emergency-stop/activate",
				"/api/admin/emergency-stop/lift", "/api/admin/actions/1/cancel", "/api/admin/wallet-flags",
				"/api/admin/wallet-flags/" + victim.checksumAddress() + "/remove", "/api/admin/api-keys",
				"/api/admin/api-keys/" + UUID.randomUUID() + "/revoke");
	}

	@Test
	void anonymousCallersReachOnlyThePublicEndpoints() {
		Api anonymous = browser();

		Api.Response health = anonymous.get("/actuator/health");
		assertThat(health.status()).isEqualTo(200);
		assertThat(health.body().get("status").asString()).isEqualTo("UP");
		assertThat(health.body().has("components")).isFalse();
		Api.Response csrf = anonymous.get("/api/auth/csrf");
		assertThat(csrf.status()).isEqualTo(200);
		assertShape(csrf.body(), "headerName", "token");
		assertThat(csrf.body().get("headerName").asString()).isEqualTo("X-XSRF-TOKEN");
		assertThat(anonymous.post("/api/auth/logout", null).status()).isEqualTo(204);

		for (String path : userEndpoints()) {
			assertUnauthenticated(anonymous.get(path));
		}
		for (String path : adminGets()) {
			assertUnauthenticated(anonymous.get(path));
		}
		for (String path : adminPosts()) {
			assertUnauthenticated(anonymous.post(path, null));
		}
		// Deny by default: unmapped paths, non-exposed actuator endpoints, and a public path's other methods.
		assertUnauthenticated(anonymous.get("/api/unknown"));
		assertUnauthenticated(anonymous.get("/actuator/env"));
		assertUnauthenticated(anonymous.get("/actuator"));
		assertUnauthenticated(anonymous.get("/"));
		assertUnauthenticated(anonymous.get("/api/auth/verify"));
		assertThat(anonymous.cookies).doesNotContainKey("BLOCKAUTH_SESSION");
		assertThat(count("select count(*) from security_events")).isZero();
	}

	@Test
	void userIsConfinedToUserEndpointsAndEscalationIsRecorded() {
		registry.registerWallet(victim.address());
		Api user = registeredAndLoggedIn(userWallet);

		for (String path : userEndpoints()) {
			assertThat(user.get(path).status()).as(path).isEqualTo(200);
		}
		for (String path : adminGets()) {
			assertDenied(user.get(path));
		}
		for (String path : adminPosts()) {
			assertDenied(user.post(path, null));
		}
		assertDenied(user.get("/actuator/env"));

		// Nothing was executed on the victim's wallet, and every attempt left a trace.
		assertThat(chain.get(victim.address()).active()).isTrue();
		assertThat(count("select count(*) from security_events where attack_type = 'PRIVILEGE_ESCALATION_ATTEMPT' "
				+ "and wallet_address = ? and user_id is not null and ip_address is not null",
				userWallet.address())).isEqualTo(adminGets().size() + adminPosts().size() + 1);
		assertThat(count("select count(*) from security_events where description like '%Target: GET /api/admin.'"))
				.isEqualTo(adminGets().size() - 2);
		assertThat(count("select count(*) from security_events where description like '%Target: POST /api/admin.'"))
				.isEqualTo(adminPosts().size());
		assertThat(count("select count(*) from security_events where description like '%Target: GET /api/blockchain.'"))
				.isEqualTo(2);
	}

	@Test
	void adminReachesEverything() {
		registry.registerWallet(victim.address());
		Api admin = registeredAndLoggedIn(ADMIN);

		for (String path : userEndpoints()) {
			assertThat(admin.get(path).status()).as(path).isEqualTo(200);
		}
		for (String path : adminGets()) {
			assertThat(admin.get(path).status()).as(path).isEqualTo(200);
		}
		Api.Response verify = admin.get("/api/blockchain/verify/" + victim.checksumAddress());
		assertShape(verify.body(), "walletAddress", "valid", "reason");
		assertThat(verify.body().get("valid").asBoolean()).isTrue();
		assertThat(verify.body().get("reason").asString()).isEqualTo("ACTIVE");
		Api.Response unknown = admin.get("/api/blockchain/wallet/" + new TestWallet().checksumAddress());
		assertShape(unknown.body(), "walletAddress", "registered", "active", "status", "registeredAt", "source");
		assertThat(unknown.body().get("status").asString()).isEqualTo("NOT_REGISTERED");
		assertThat(unknown.body().get("registeredAt").isNull()).isTrue();

		// The victim is registered on-chain but has no user row: the change still succeeds and is audited.
		assertThat(admin.post(adminPosts().get(0), proof(admin, ADMIN, "REVOKE_WALLET", victim)).status())
			.isEqualTo(200);
		Api.Response revoked = admin.get("/api/blockchain/verify/" + victim.checksumAddress());
		assertThat(revoked.body().get("valid").asBoolean()).isFalse();
		assertThat(revoked.body().get("reason").asString()).isEqualTo("REVOKED");
		assertThat(admin.post(adminPosts().get(1), proof(admin, ADMIN, "ACTIVATE_WALLET", victim)).status())
			.isEqualTo(202);
		clock.advance(Duration.ofMinutes(11));
		adminActions.runDue();
		assertThat(count("select count(*) from authentication_events where event_type in ('WALLET_REVOKED', "
				+ "'WALLET_ACTIVATED') and wallet_address = ? and user_id is null and actor_user_id is not null",
				victim.address())).isEqualTo(2);
	}

	@Test
	void unmappedPathsAre404AndWrongMethodsAre405OnlyAfterAuthorization() {
		Api user = registeredAndLoggedIn(userWallet);

		Api.Response unmapped = user.get("/api/users/nothing-here");
		Api.Response wrongMethod = user.send("POST", "/api/users/me", "{}", Map.of(), true);
		// An unmapped path outside the user's area is denied before the dispatcher could say "not found".
		Api.Response unmappedAdmin = user.get("/api/admin/nothing-here");

		assertThat(unmapped.status()).isEqualTo(404);
		assertThat(unmapped.code()).isEqualTo("RESOURCE_NOT_FOUND");
		assertThat(wrongMethod.status()).isEqualTo(405);
		assertThat(wrongMethod.code()).isEqualTo("METHOD_NOT_ALLOWED");
		assertDenied(unmappedAdmin);
	}

	@Test
	void roleChangeInTheDatabaseAppliesOnTheNextRequest() {
		Api user = registeredAndLoggedIn(userWallet);
		assertDenied(user.get("/api/admin/statistics"));

		jdbc.update("update users set role = 'ADMIN' where wallet_address = ?", userWallet.address());
		assertThat(user.get("/api/admin/statistics").status()).isEqualTo(200);

		jdbc.update("update users set role = 'USER' where wallet_address = ?", userWallet.address());
		assertDenied(user.get("/api/admin/statistics"));
	}

	@Test
	void deletedUserLosesTheSession() {
		Api user = registeredAndLoggedIn(userWallet);
		jdbc.update("delete from authentication_events");
		jdbc.update("delete from login_assessments");
		jdbc.update("delete from sign_in_alerts");
		jdbc.update("delete from user_sessions");
		jdbc.update("delete from user_devices");
		jdbc.update("delete from users where wallet_address = ?", userWallet.address());

		Api.Response response = user.get("/api/users/me");

		assertThat(response.status()).isEqualTo(401);
		assertThat(response.code()).isEqualTo("SESSION_REVOKED");
		assertThat(count("select count(*) from authentication_events where event_type = 'SESSION_TERMINATED' "
				+ "and user_id is null and wallet_address = ?", userWallet.address())).isEqualTo(1);
		assertThat(user.get("/api/users/me").code()).isEqualTo("UNAUTHENTICATED");
	}

	private static void assertUnauthenticated(Api.Response response) {
		assertThat(response.status()).isEqualTo(401);
		assertThat(response.code()).isEqualTo("UNAUTHENTICATED");
	}

	private static void assertDenied(Api.Response response) {
		assertThat(response.status()).isEqualTo(403);
		assertThat(response.code()).isEqualTo("ACCESS_DENIED");
	}

}
