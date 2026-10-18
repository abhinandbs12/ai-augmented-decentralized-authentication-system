package com.blockauth.risk;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

import com.blockauth.Api;
import com.blockauth.IntegrationTest;
import com.blockauth.TestWallet;
import com.blockauth.secondstep.SecondStepTestSupport;

/** The trust score of each sign-in, computed from the server's own records after the signature checks out. */
class TrustScoreIT extends IntegrationTest {

	private final TestWallet wallet = new TestWallet();

	private Map<String, Object> lastAssessment(TestWallet of) {
		return jdbc.queryForMap("select score, rules, decision from login_assessments where wallet_address = ? "
				+ "order by id desc limit 1", of.address());
	}

	private void flag(Api admin, TestWallet target) {
		Map<String, Object> body = new LinkedHashMap<>(proof(admin, ADMIN, "FLAG_WALLET", target));
		body.put("walletAddress", target.checksumAddress());
		body.put("reason", "Reported in a phishing campaign");
		Api.Response response = admin.post("/api/admin/wallet-flags", body);
		assertThat(response.status()).as(response.body().toString()).isEqualTo(201);
	}

	@Test
	void theFirstSignInHasNothingToCompareWithAndScoresFull() {
		registeredAndLoggedIn(wallet);

		assertThat(lastAssessment(wallet)).containsEntry("score", 100).containsEntry("rules", "")
			.containsEntry("decision", "ALLOW");
	}

	@Test
	void aNewDeviceLowersTheScoreButASignatureAloneStillSuffices() {
		registeredAndLoggedIn(wallet);

		assertThat(login(browser(), wallet).status()).isEqualTo(200);

		assertThat(lastAssessment(wallet)).containsEntry("score", 70).containsEntry("rules", "NEW_DEVICE")
			.containsEntry("decision", "ALLOW");
	}

	@Test
	void aFlaggedWalletOnANewDeviceIsRefusedButCanStillUseItsKnownDevice() {
		Api laptop = registeredAndLoggedIn(wallet);
		flag(registeredAndLoggedIn(ADMIN), wallet);

		Api.Response refused = login(browser(), wallet);

		assertThat(refused.status()).isEqualTo(403);
		assertThat(refused.code()).isEqualTo("LOGIN_RISK_TOO_HIGH");
		assertThat(lastAssessment(wallet)).containsEntry("score", 35)
			.containsEntry("rules", "NEW_DEVICE,FLAGGED_WALLET")
			.containsEntry("decision", "REFUSE");
		assertThat(count("select count(*) from security_events where attack_type = 'LOW_TRUST_LOGIN' "
				+ "and wallet_address = ?", wallet.address())).isEqualTo(1);
		assertThat(login(laptop, wallet).status()).isEqualTo(200);
		assertThat(lastAssessment(wallet)).containsEntry("score", 65).containsEntry("decision", "ALLOW");
	}

	@Test
	void withASecondStepALowScoreAsksForTheCodeInsteadOfRefusing() {
		Api laptop = registeredAndLoggedIn(wallet);
		SecondStepTestSupport.enable(laptop, clock.instant(), action -> proof(laptop, wallet, action, Map.of()));
		flag(registeredAndLoggedIn(ADMIN), wallet);

		// Even the trusted laptop is asked: the flag alone takes the score below the "allow" threshold.
		assertThat(login(laptop, wallet).status()).isEqualTo(202);
		assertThat(login(browser(), wallet).status()).isEqualTo(202);
		assertThat(lastAssessment(wallet)).containsEntry("decision", "SECOND_STEP");
	}

	@Test
	void repeatedFailuresFromTheSameAddressLowerTheScore() {
		Api laptop = registeredAndLoggedIn(wallet);
		for (int i = 0; i < 3; i++) {
			TestWallet stranger = new TestWallet();
			assertThat(login(browser(), stranger).code()).isEqualTo("WALLET_NOT_REGISTERED");
		}

		assertThat(login(browser(), wallet).code()).isEqualTo("LOGIN_RISK_TOO_HIGH");
		assertThat(lastAssessment(wallet)).containsEntry("score", 45)
			.containsEntry("rules", "NEW_DEVICE,REPEATED_FAILURES");
		assertThat(login(laptop, wallet).status()).isEqualTo(200);
	}

	@Test
	void sharingADeviceWithAFlaggedWalletLowersTheScore() {
		TestWallet flagged = new TestWallet();
		// Both wallets signed in on one browser, so they share a device.
		Api shared = registeredAndLoggedIn(flagged);
		assertThat(register(shared, wallet).status()).isEqualTo(201);
		assertThat(login(shared, wallet).status()).isEqualTo(200);
		flag(registeredAndLoggedIn(ADMIN), flagged);

		assertThat(login(browser(), wallet).code()).isEqualTo("LOGIN_RISK_TOO_HIGH");
		assertThat(lastAssessment(wallet)).containsEntry("score", 35)
			.containsEntry("rules", "NEW_DEVICE,LINKED_TO_FLAGGED");
	}

	@Test
	void removingTheFlagRestoresTheScore() {
		registeredAndLoggedIn(wallet);
		Api admin = registeredAndLoggedIn(ADMIN);
		flag(admin, wallet);
		assertThat(login(browser(), wallet).code()).isEqualTo("LOGIN_RISK_TOO_HIGH");

		assertThat(admin.post("/api/admin/wallet-flags/" + wallet.checksumAddress() + "/remove",
				proof(admin, ADMIN, "UNFLAG_WALLET", wallet)).status()).isEqualTo(204);

		assertThat(login(browser(), wallet).status()).isEqualTo(200);
		assertThat(count("select count(*) from authentication_events where event_type in "
				+ "('WALLET_FLAGGED', 'WALLET_UNFLAGGED')")).isEqualTo(2);
	}

	@Test
	void flagsAreValidatedAndNotDuplicated() {
		register(browser(), wallet);
		Api admin = registeredAndLoggedIn(ADMIN);
		Map<String, Object> body = new LinkedHashMap<>(proof(admin, ADMIN, "FLAG_WALLET", wallet));
		body.put("walletAddress", wallet.checksumAddress());
		body.put("reason", "<script>");
		assertThat(admin.post("/api/admin/wallet-flags", body).code()).isEqualTo("VALIDATION_FAILED");

		flag(admin, wallet);
		body.put("reason", "Again");
		assertThat(admin.post("/api/admin/wallet-flags", body).code()).isEqualTo("WALLET_ALREADY_FLAGGED");
		assertThat(admin.post("/api/admin/wallet-flags/" + new TestWallet().checksumAddress() + "/remove",
				proof(admin, ADMIN, "UNFLAG_WALLET", wallet)).code()).isEqualTo("WALLET_NOT_FLAGGED");
	}

	@Test
	void administratorsCanReviewTheAssessmentsAndUsersCannot() {
		Api user = registeredAndLoggedIn(wallet);
		login(browser(), wallet);
		Api admin = registeredAndLoggedIn(ADMIN);

		Api.Response page = admin.get("/api/admin/login-assessments?walletAddress=" + wallet.checksumAddress());

		assertThat(page.status()).isEqualTo(200);
		JsonNode items = page.body().get("items");
		assertThat(items).hasSize(2);
		assertShape(items.get(0), "id", "walletAddress", "ipAddress", "score", "rules", "decision", "assessedAt");
		assertThat(items.get(0).get("score").asInt()).isEqualTo(70);
		assertThat(admin.get("/api/admin/login-assessments?decision=REFUSE").body().get("items")).isEmpty();
		assertThat(user.get("/api/admin/login-assessments").status()).isEqualTo(403);
		assertThat(user.get("/api/admin/wallet-flags").status()).isEqualTo(403);
	}

}
