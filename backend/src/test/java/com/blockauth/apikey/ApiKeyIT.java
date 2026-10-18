package com.blockauth.apikey;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.blockauth.Api;
import com.blockauth.IntegrationTest;
import com.blockauth.TestWallet;
import com.blockauth.common.Tokens;

/** Read-only API keys: each limited to its scopes and lifetime, and only as good as its owner's role. */
class ApiKeyIT extends IntegrationTest {

	private static final Map<String, Object> DUMMY_PROOF = Map.of("proof",
			Map.of("challenge", "x", "signature", "0x" + "ab".repeat(65)));

	private Api admin;

	@BeforeEach
	void setUp() {
		admin = registeredAndLoggedIn(ADMIN);
	}

	private Api.Response create(String name, List<String> scopes, int days) {
		Map<String, Object> parameters = Map.of("name", name, "scopes", scopes, "days", days);
		Map<String, Object> body = new LinkedHashMap<>(proof(admin, ADMIN, "CREATE_API_KEY", parameters));
		body.putAll(parameters);
		return admin.post("/api/admin/api-keys", body);
	}

	private String token(String... scopes) {
		Api.Response created = create("Reporting", List.of(scopes), 30);
		assertThat(created.status()).as(created.body().toString()).isEqualTo(201);
		return created.body().get("token").asString();
	}

	/** A request from a program: no cookies, only the key. */
	private Api.Response withKey(String token, String path) {
		return browser().send("GET", path, null, Map.of(ApiKeyFilter.HEADER, token), false);
	}

	@Test
	void theTokenIsShownOnceAndOnlyAHashOfItsSecretIsStored() {
		Api.Response created = create("Nightly report", List.of("audit:read", "users:read"), 30);

		assertThat(created.status()).isEqualTo(201);
		assertShape(created.body(), "key", "token");
		assertShape(created.body().get("key"), "id", "name", "owner", "scopes", "createdAt", "expiresAt", "revokedAt",
				"lastUsedAt", "status");
		String token = created.body().get("token").asString();
		assertThat(token).matches("^bak\\.[0-9a-f-]{36}\\.[A-Za-z0-9_-]{43}$");
		String secret = token.substring(token.lastIndexOf('.') + 1);
		assertThat(count("select count(*) from api_keys where secret_hash = ?", Tokens.sha256Hex(secret))).isEqualTo(1);
		assertThat(count("select count(*) from api_keys where secret_hash = ? or name = ?", secret, token)).isZero();
		Api.Response list = admin.get("/api/admin/api-keys");
		assertThat(list.body().get("items")).hasSize(1);
		assertThat(list.body().toString()).doesNotContain(secret);
		assertThat(list.body().get("items").get(0).get("status").asString()).isEqualTo("ACTIVE");
		assertThat(count("select count(*) from authentication_events where event_type = 'API_KEY_CREATED'"))
			.isEqualTo(1);
	}

	@Test
	void aKeyReadsOnlyWhatItsScopesAllow() {
		String users = token("users:read");
		String audit = token("audit:read");
		String status = token("wallet-status:read");

		assertThat(withKey(users, "/api/admin/users").status()).isEqualTo(200);
		assertThat(withKey(users, "/api/admin/statistics").status()).isEqualTo(403);
		assertThat(withKey(audit, "/api/admin/statistics").status()).isEqualTo(200);
		assertThat(withKey(audit, "/api/admin/security-events").status()).isEqualTo(200);
		assertThat(withKey(audit, "/api/admin/login-assessments").status()).isEqualTo(200);
		assertThat(withKey(audit, "/api/admin/users").status()).isEqualTo(403);
		assertThat(withKey(status, "/api/blockchain/wallet/" + ADMIN.checksumAddress()).status()).isEqualTo(200);
		// No scope opens anything else: not the session endpoints, not the key list, not the controls.
		for (String token : List.of(users, audit, status)) {
			assertThat(withKey(token, "/api/users/me").status()).isEqualTo(403);
			assertThat(withKey(token, "/api/admin/api-keys").status()).isEqualTo(403);
			assertThat(withKey(token, "/api/admin/emergency-stop").status()).isEqualTo(403);
		}
	}

	@Test
	void aKeyCannotChangeAnythingEvenWithACsrfToken() {
		TestWallet target = new TestWallet();
		register(browser(), target);
		String key = token("users:read", "audit:read", "wallet-status:read");

		Api.Response attempt = browser().send("POST", "/api/admin/wallet/" + target.checksumAddress() + "/revoke",
				Api.json(DUMMY_PROOF), Map.of(ApiKeyFilter.HEADER, key), true);

		assertThat(attempt.status()).isEqualTo(403);
		assertThat(chain.get(target.address()).active()).isTrue();
	}

	@Test
	void aKeyHoldsNoSession() {
		String key = token("users:read");

		Api.Response response = withKey(key, "/api/admin/users");

		assertThat(response.status()).isEqualTo(200);
		assertThat(response.setCookies()).noneMatch(c -> c.startsWith("JSESSIONID="));
		assertThat(jdbc.queryForObject("select last_used_at is not null from api_keys", Boolean.class)).isTrue();
	}

	@Test
	void everyUnusableKeyIsRefusedTheSameWay() {
		String key = token("users:read");
		String id = key.split("\\.")[1];
		String wrongSecret = "bak." + id + "." + "A".repeat(43);

		for (String bad : List.of("nonsense", wrongSecret, "bak." + java.util.UUID.randomUUID() + "." + "A".repeat(43))) {
			Api.Response refused = withKey(bad, "/api/admin/users");
			assertThat(refused.status()).isEqualTo(401);
			assertThat(refused.code()).isEqualTo("INVALID_API_KEY");
		}
		// Audited once a minute per address, so a flood of bad keys cannot flood the log.
		assertThat(count("select count(*) from security_events where attack_type = 'INVALID_API_KEY'")).isEqualTo(1);
		assertThat(withKey(key, "/api/admin/users").status()).isEqualTo(200);
	}

	@Test
	void aRevokedKeyStopsWorkingAtOnce() {
		Api.Response created = create("Temporary", List.of("users:read"), 30);
		String key = created.body().get("token").asString();
		String id = created.body().get("key").get("id").asString();

		Api.Response revoked = admin.post("/api/admin/api-keys/" + id + "/revoke", null);

		assertThat(revoked.body().get("status").asString()).isEqualTo("REVOKED");
		assertThat(withKey(key, "/api/admin/users").code()).isEqualTo("INVALID_API_KEY");
		assertThat(count("select count(*) from authentication_events where event_type = 'API_KEY_REVOKED'"))
			.isEqualTo(1);
	}

	@Test
	void twoSimultaneousRevocationsAreRecordedOnce() {
		String id = create("Twice", List.of("users:read"), 30).body().get("key").get("id").asString();
		Api other = sameSession(admin);

		List<Api.Response> responses = concurrently(List.<Supplier<Api.Response>>of(
				() -> admin.post("/api/admin/api-keys/" + id + "/revoke", null),
				() -> other.post("/api/admin/api-keys/" + id + "/revoke", null)));

		assertThat(responses).extracting(Api.Response::status).containsOnly(200);
		assertThat(responses).allSatisfy(r -> assertThat(r.body().get("status").asString()).isEqualTo("REVOKED"));
		assertThat(count("select count(*) from authentication_events where event_type = 'API_KEY_REVOKED'"))
			.isEqualTo(1);
	}

	@Test
	void oneConfirmationCreatesAtMostOneKeyEvenWhenSentTwiceAtOnce() {
		Map<String, Object> parameters = Map.of("name", "Double click", "scopes", List.of("users:read"), "days", 30);
		Map<String, Object> body = new LinkedHashMap<>(proof(admin, ADMIN, "CREATE_API_KEY", parameters));
		body.putAll(parameters);
		Api other = sameSession(admin);

		List<Api.Response> responses = concurrently(List.<Supplier<Api.Response>>of(
				() -> admin.post("/api/admin/api-keys", body), () -> other.post("/api/admin/api-keys", body)));

		assertThat(responses).extracting(Api.Response::status).containsExactlyInAnyOrder(201, 403);
		assertThat(responses).filteredOn(r -> r.status() == 403).extracting(Api.Response::code)
			.containsExactly("STEP_UP_FAILED");
		assertThat(count("select count(*) from api_keys")).isEqualTo(1);
	}

	@Test
	void aKeyExpires() {
		Api.Response created = create("One day", List.of("users:read"), 1);
		String key = created.body().get("token").asString();
		assertThat(withKey(key, "/api/admin/users").status()).isEqualTo(200);

		clock.advance(Duration.ofDays(1).plusSeconds(1));

		assertThat(withKey(key, "/api/admin/users").code()).isEqualTo("INVALID_API_KEY");
	}

	@Test
	void aKeyIsOnlyAsGoodAsItsOwner() {
		String key = token("users:read");

		jdbc.update("update users set role = 'USER' where wallet_address = ?", ADMIN.address());
		assertThat(withKey(key, "/api/admin/users").code()).isEqualTo("INVALID_API_KEY");
		jdbc.update("update users set role = 'ADMIN', status = 'REVOKED' where wallet_address = ?", ADMIN.address());
		assertThat(withKey(key, "/api/admin/users").code()).isEqualTo("INVALID_API_KEY");
	}

	@Test
	void creationIsValidatedAndBoundToTheSignedParameters() {
		for (Map<String, Object> wrong : List.<Map<String, Object>>of(
				Map.of("name", "", "scopes", List.of("users:read"), "days", 30),
				Map.of("name", "Report", "scopes", List.of(), "days", 30),
				Map.of("name", "Report", "scopes", List.of("users:write"), "days", 30),
				Map.of("name", "Report", "scopes", List.of("users:read"), "days", 0),
				Map.of("name", "Report", "scopes", List.of("users:read"), "days", 91))) {
			Map<String, Object> body = new LinkedHashMap<>(DUMMY_PROOF);
			body.putAll(wrong);
			assertThat(admin.post("/api/admin/api-keys", body).code()).as(wrong.toString()).isEqualTo("VALIDATION_FAILED");
			Map<String, Object> challenge = new LinkedHashMap<>(wrong);
			challenge.put("action", "CREATE_API_KEY");
			assertThat(admin.post("/api/auth/step-up", challenge).code()).isEqualTo("VALIDATION_FAILED");
		}
		// Signed for one scope, submitted with more.
		Map<String, Object> signed = Map.of("name", "Report", "scopes", List.of("users:read"), "days", 30);
		Map<String, Object> body = new LinkedHashMap<>(proof(admin, ADMIN, "CREATE_API_KEY", signed));
		body.putAll(signed);
		body.put("scopes", List.of("users:read", "audit:read"));
		assertThat(admin.post("/api/admin/api-keys", body).code()).isEqualTo("STEP_UP_FAILED");
		assertThat(count("select count(*) from api_keys")).isZero();
	}

	@Test
	void usersCannotManageKeys() {
		Api user = registeredAndLoggedIn(new TestWallet());

		assertThat(user.get("/api/admin/api-keys").status()).isEqualTo(403);
		Map<String, Object> body = new LinkedHashMap<>(DUMMY_PROOF);
		body.putAll(Map.of("name", "Mine", "scopes", List.of("users:read"), "days", 30));
		assertThat(user.post("/api/admin/api-keys", body).status()).isEqualTo(403);
	}

}
