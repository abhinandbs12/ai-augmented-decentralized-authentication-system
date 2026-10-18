package com.blockauth.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.apache.catalina.Context;
import org.apache.catalina.Session;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.tomcat.TomcatWebServer;
import org.springframework.boot.web.server.servlet.context.ServletWebServerApplicationContext;

import com.blockauth.Api;
import com.blockauth.IntegrationTest;
import com.blockauth.TestWallet;

/** IT-03 and ST-16: a session ends at logout and after its idle timeout. */
class LogoutIT extends IntegrationTest {

	@Autowired
	private ServletWebServerApplicationContext applicationContext;

	private final TestWallet wallet = new TestWallet();

	@Test
	void logoutEndsTheSessionExpiresBothCookiesAndIsRecorded() {
		Api api = registeredAndLoggedIn(wallet);
		api.get("/api/auth/csrf");
		String session = api.cookies.get("BLOCKAUTH_SESSION");

		Api.Response logout = api.post("/api/auth/logout", null);

		assertThat(logout.status()).isEqualTo(204);
		assertThat(logout.setCookies()).anyMatch(c -> c.startsWith("BLOCKAUTH_SESSION=;") && c.contains("Max-Age=0"));
		assertThat(logout.setCookies()).anyMatch(c -> c.startsWith("XSRF-TOKEN=;"));
		assertThat(api.cookies).doesNotContainKeys("BLOCKAUTH_SESSION", "XSRF-TOKEN");
		// The old cookie value is useless even if an attacker kept a copy.
		Api reuse = browser();
		reuse.cookies.put("BLOCKAUTH_SESSION", session);
		assertThat(reuse.get("/api/users/me").status()).isEqualTo(401);
		assertThat(count("select count(*) from authentication_events where event_type = 'LOGOUT' "
				+ "and event_status = 'SUCCESS' and wallet_address = ?", wallet.address())).isEqualTo(1);
	}

	@Test
	void logoutWithoutASessionIsANoOp() {
		Api anonymous = browser();

		assertThat(anonymous.post("/api/auth/logout", null).status()).isEqualTo(204);
		assertThat(anonymous.post("/api/auth/logout", null).status()).isEqualTo(204);

		assertThat(count("select count(*) from authentication_events")).isZero();
	}

	@Test
	void idleSessionExpires() throws Exception {
		Api api = registeredAndLoggedIn(wallet);
		Context context = (Context) ((TomcatWebServer) applicationContext.getWebServer()).getTomcat().getHost()
				.findChildren()[0];
		// SESSION_TIMEOUT (30m in the test profile) reached the servlet container.
		assertThat(context.getSessionTimeout()).isEqualTo(30);

		// Shorten this one session's idle limit to a second instead of waiting half an hour.
		Session session = context.getManager().findSession(api.cookies.get("BLOCKAUTH_SESSION"));
		assertThat(session.getMaxInactiveInterval()).isEqualTo(30 * 60);
		session.setMaxInactiveInterval(1);
		Thread.sleep(1500);

		Api.Response response = api.get("/api/users/me");

		assertThat(response.status()).isEqualTo(401);
		assertThat(response.code()).isEqualTo("UNAUTHENTICATED");
		// The session's record is closed as well, so it no longer appears in the user's session list.
		assertThat(count("select count(*) from user_sessions where end_reason = 'EXPIRED'")).isEqualTo(1);
		assertThat(count("select count(*) from user_sessions where ended_at is null")).isZero();
	}

}
