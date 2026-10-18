package com.blockauth.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;

import com.blockauth.Api;
import com.blockauth.IntegrationTest;
import com.blockauth.TestWallet;

/** IT-06 / ST-13: state-changing requests need the CSRF header token and an allowed origin. */
class CsrfIT extends IntegrationTest {

	private final TestWallet userWallet = new TestWallet();

	@Test
	void postWithoutOrWithAWrongTokenIsRejectedAndChangesNothing() {
		Api admin = registeredAndLoggedIn(ADMIN);
		registeredAndLoggedIn(userWallet);
		String revoke = "/api/admin/wallet/" + userWallet.checksumAddress() + "/revoke";

		assertRejected(admin.send("POST", revoke, null, Map.of(), false));
		assertRejected(admin.send("POST", revoke, null, Map.of("X-XSRF-TOKEN", "not-the-token"), false));
		assertRejected(admin.send("POST", "/api/auth/logout", null, Map.of(), false));

		assertThat(chain.get(userWallet.address()).active()).isTrue();
		assertThat(admin.get("/api/users/me").status()).isEqualTo(200);
		assertThat(count("select count(*) from security_events where attack_type = 'CSRF_REJECTED' "
				+ "and wallet_address = ?", ADMIN.address())).isEqualTo(3);
	}

	@Test
	void tokenIsAcceptedInTheHeaderOnly() {
		Api admin = registeredAndLoggedIn(ADMIN);
		admin.get("/api/auth/csrf");
		String token = admin.cookies.get("XSRF-TOKEN");

		// A correct token as a URL parameter or a form field is not the header.
		assertRejected(admin.send("POST", "/api/auth/logout?_csrf=" + token, null, Map.of(), false));
		assertRejected(admin.send("POST", "/api/auth/logout", "_csrf=" + token,
				Map.of("Content-Type", "application/x-www-form-urlencoded"), false));

		assertThat(admin.get("/api/users/me").status()).isEqualTo(200);
		assertThat(admin.send("POST", "/api/auth/logout", null, Map.of("X-XSRF-TOKEN", token), false).status())
				.isEqualTo(204);
	}

	@Test
	void foreignOriginIsRejectedEvenWithAValidToken() {
		Api admin = registeredAndLoggedIn(ADMIN);
		registeredAndLoggedIn(userWallet);
		admin.get("/api/auth/csrf");
		String revoke = "/api/admin/wallet/" + userWallet.checksumAddress() + "/revoke";

		assertRejected(admin.send("POST", revoke, null, Map.of("Origin", "http://evil.test"), true));
		assertRejected(admin.send("POST", revoke, null, Map.of("Origin", "null"), true));
		// Same host, different port or scheme: still another origin.
		assertRejected(admin.send("POST", revoke, null, Map.of("Origin", "http://localhost:3000"), true));
		assertRejected(admin.send("POST", revoke, null, Map.of("Origin", "https://localhost:5173"), true));

		assertThat(chain.get(userWallet.address()).active()).isTrue();
		assertThat(count("select count(*) from security_events where attack_type = 'CSRF_REJECTED'")).isEqualTo(4);
		// The SPA's own origin is accepted.
		assertThat(admin.send("POST", "/api/auth/logout", null, Map.of("Origin", "http://localhost:5173"), true)
				.status()).isEqualTo(204);
	}

	@Test
	void loginCsrfIsBlocked() {
		Api api = browser();
		register(api, userWallet);
		Map<String, String> body = signed(userWallet, challenge(api, userWallet, "/api/auth/challenge"), userWallet);

		Api.Response response = api.send("POST", "/api/auth/verify", Api.json(body), Map.of(), false);

		assertRejected(response);
		assertThat(api.cookies).doesNotContainKey("BLOCKAUTH_SESSION");
		// Rejected before authentication: the challenge was not consumed and no attempt was recorded.
		assertThat(count("select count(*) from authentication_challenges where purpose = 'LOGIN' and not used"))
				.isEqualTo(1);
		assertThat(count("select count(*) from authentication_events where event_type = 'LOGIN'")).isZero();
	}

	@Test
	void tokenIsRotatedAtLogin() {
		Api api = browser();
		register(api, userWallet);
		String before = api.cookies.get("XSRF-TOKEN");

		Api.Response login = login(api, userWallet);
		assertThat(login.setCookies()).anyMatch(c -> c.startsWith("XSRF-TOKEN=;"));
		api.get("/api/auth/csrf");

		assertThat(api.cookies.get("XSRF-TOKEN")).isNotNull().isNotEqualTo(before);
		// The token from before login no longer matches the browser's cookie.
		assertRejected(api.send("POST", "/api/auth/logout", null, Map.of("X-XSRF-TOKEN", before), false));
	}

	@Test
	void csrfCookieIsReadableByTheAppButScopedToTheSite() {
		Api.Response response = browser().get("/api/auth/csrf");

		String cookie = response.setCookies().stream().filter(c -> c.startsWith("XSRF-TOKEN=")).findFirst()
				.orElseThrow();
		assertThat(cookie).contains("SameSite=Strict", "Path=/").doesNotContain("HttpOnly");
		assertThat(cookie).contains(response.body().get("token").asString());
	}

	private static void assertRejected(Api.Response response) {
		assertThat(response.status()).isEqualTo(403);
		assertThat(response.code()).isEqualTo("CSRF_INVALID");
	}

}
