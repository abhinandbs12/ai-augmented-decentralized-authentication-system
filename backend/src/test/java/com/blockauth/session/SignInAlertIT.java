package com.blockauth.session;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.blockauth.Api;
import com.blockauth.IntegrationTest;
import com.blockauth.TestWallet;

/** A sign-in on a device the wallet has not used is shown on the wallet's other sessions. */
class SignInAlertIT extends IntegrationTest {

	private final TestWallet wallet = new TestWallet();

	@Test
	void aNewDeviceRaisesOneAlertOnTheOtherSessionsOnly() {
		Api laptop = registeredAndLoggedIn(wallet);
		// The first device sets the baseline: nothing to alert about.
		assertThat(laptop.get("/api/users/alerts").body()).isEmpty();

		Api phone = browser();
		assertThat(login(phone, wallet).status()).isEqualTo(200);

		Api.Response alerts = laptop.get("/api/users/alerts");
		assertThat(alerts.body()).hasSize(1);
		assertShape(alerts.body().get(0), "id", "createdAt", "device", "ipAddress", "sessionOpen");
		assertThat(alerts.body().get(0).get("sessionOpen").asBoolean()).isTrue();
		assertThat(phone.get("/api/users/alerts").body()).isEmpty();

		// Signing in again on the same phone is not new.
		assertThat(login(phone, wallet).status()).isEqualTo(200);
		assertThat(count("select count(*) from sign_in_alerts")).isEqualTo(1);
	}

	@Test
	void confirmingAnAlertClosesItAndKeepsThatSession() {
		Api laptop = registeredAndLoggedIn(wallet);
		Api phone = browser();
		login(phone, wallet);
		long id = laptop.get("/api/users/alerts").body().get(0).get("id").asLong();

		assertThat(laptop.post("/api/users/alerts/" + id + "/confirm", null).status()).isEqualTo(204);

		assertThat(laptop.get("/api/users/alerts").body()).isEmpty();
		assertThat(phone.get("/api/users/me").status()).isEqualTo(200);
		assertThat(laptop.post("/api/users/alerts/" + id + "/confirm", null).status()).isEqualTo(404);
	}

	@Test
	void notMeEndsThatSessionAndForgetsItsDevice() {
		Api laptop = registeredAndLoggedIn(wallet);
		Api phone = browser();
		login(phone, wallet);
		long id = laptop.get("/api/users/alerts").body().get(0).get("id").asLong();

		assertThat(laptop.post("/api/users/alerts/" + id + "/sign-out", null).status()).isEqualTo(204);

		assertThat(phone.get("/api/users/me").code()).isEqualTo("SESSION_REVOKED");
		assertThat(laptop.get("/api/users/devices").body()).hasSize(1);
		assertThat(count("select count(*) from sign_in_alerts where resolution = 'SIGNED_OUT'")).isEqualTo(1);
		assertThat(count("select count(*) from authentication_events where event_type = 'REMOTE_LOGOUT'")).isEqualTo(1);
		// The forgotten phone counts as new again: its next sign-in raises a fresh alert.
		login(phone, wallet);
		assertThat(laptop.get("/api/users/alerts").body()).hasSize(1);
	}

	@Test
	void anotherUsersAlertIsNotFound() {
		Api laptop = registeredAndLoggedIn(wallet);
		login(browser(), wallet);
		long id = laptop.get("/api/users/alerts").body().get(0).get("id").asLong();
		Api stranger = registeredAndLoggedIn(new TestWallet());

		assertThat(stranger.post("/api/users/alerts/" + id + "/sign-out", null).status()).isEqualTo(404);
		assertThat(stranger.post("/api/users/alerts/" + id + "/confirm", null).status()).isEqualTo(404);
	}

}
