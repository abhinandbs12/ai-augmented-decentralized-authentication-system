package com.blockauth.secondstep;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.blockauth.Api;
import com.blockauth.IntegrationTest;
import com.blockauth.TestWallet;
import com.blockauth.common.Tokens;

/**
 * The second step: an authenticator code asked for when a sign-in does not look like the wallet's
 * usual one. Set up and confirmed with a fresh signature; the device it is passed on becomes trusted.
 */
class SecondStepIT extends IntegrationTest {

	private final TestWallet wallet = new TestWallet();
	private Api laptop;

	@BeforeEach
	void signIn() {
		laptop = registeredAndLoggedIn(wallet);
	}

	private SecondStepTestSupport.Enabled enable() {
		return SecondStepTestSupport.enable(laptop, clock.instant(), action -> proof(laptop, wallet, action, Map.of()));
	}

	private String code(SecondStepTestSupport.Enabled enabled) {
		return SecondStepTestSupport.code(enabled.secret(), clock.instant());
	}

	/** A sign-in on a new browser, which stops at the second step. */
	private Api waitingForCode() {
		Api phone = browser();
		Api.Response response = login(phone, wallet);
		assertThat(response.status()).as(response.body().toString()).isEqualTo(202);
		return phone;
	}

	private static Api.Response submit(Api api, String code) {
		return api.post("/api/auth/second-step", Map.of("code", code));
	}

	private Map<String, Object> codeAndProof(String code, String action) {
		Map<String, Object> body = new LinkedHashMap<>(proof(laptop, wallet, action, Map.of()));
		body.put("code", code);
		return body;
	}

	@Test
	void turningItOnNeedsACorrectCodeAndAFreshSignature() {
		Api.Response setup = laptop.post("/api/users/second-step/setup", null);
		assertShape(setup.body(), "secret", "otpauthUri");
		String secret = setup.body().get("secret").asString();
		assertThat(setup.body().get("otpauthUri").asString()).startsWith("otpauth://totp/BlockAuth%3A")
			.contains("secret=" + secret, "issuer=BlockAuth", "digits=6", "period=30");
		byte[] key = SecondStepTestSupport.base32Decode(secret);
		String rightCode = SecondStepTestSupport.code(key, clock.instant());
		String wrongCode = rightCode.equals("000000") ? "111111" : "000000";

		assertThat(laptop.post("/api/users/second-step/enable", codeAndProof(wrongCode, "ENABLE_SECOND_STEP")).code())
			.isEqualTo("VERIFICATION_CODE_INVALID");
		assertThat(laptop.post("/api/users/second-step/enable", Map.of("code", rightCode)).code())
			.isEqualTo("VALIDATION_FAILED");
		assertThat(laptop.get("/api/users/second-step").body().get("enabled").asBoolean()).isFalse();

		Api.Response enabled = laptop.post("/api/users/second-step/enable",
				codeAndProof(rightCode, "ENABLE_SECOND_STEP"));

		assertThat(enabled.status()).isEqualTo(200);
		List<String> backupCodes = SecondStepTestSupport.backupCodes(enabled);
		assertThat(backupCodes).hasSize(10).doesNotHaveDuplicates().allMatch(c -> c.matches("^[A-Z0-9]{4}-[A-Z0-9]{4}$"));
		Api.Response status = laptop.get("/api/users/second-step");
		assertThat(status.body().get("enabled").asBoolean()).isTrue();
		assertThat(status.body().get("backupCodesLeft").asInt()).isEqualTo(10);
		assertThat(count("select count(*) from authentication_events where event_type = 'SECOND_STEP_ENABLED'"))
			.isEqualTo(1);
		// Stored: the secret only encrypted, the backup codes only hashed.
		String stored = jdbc.queryForObject("select secret_ciphertext from second_factors", String.class);
		assertThat(stored).doesNotContain(secret);
		// Keyed hashes: a plain SHA-256 of a code (which a database copy alone could reverse) is not stored.
		assertThat(count("select count(*) from backup_codes")).isEqualTo(10);
		assertThat(count("select count(*) from backup_codes where code_hash = ?",
				Tokens.sha256Hex(backupCodes.get(0).replace("-", "")))).isZero();
		// Starting the setup again while it is on is refused.
		assertThat(laptop.post("/api/users/second-step/setup", null).code()).isEqualTo("SECOND_STEP_ALREADY_ENABLED");
	}

	@Test
	void anotherUsersSignedConfirmationIsRefused() {
		TestWallet otherWallet = new TestWallet();
		Api other = registeredAndLoggedIn(otherWallet);
		Map<String, Object> theirs = proof(other, otherWallet, "ENABLE_SECOND_STEP", Map.of());
		byte[] secret = SecondStepTestSupport
			.base32Decode(laptop.post("/api/users/second-step/setup", null).body().get("secret").asString());
		Map<String, Object> body = new LinkedHashMap<>(theirs);
		body.put("code", SecondStepTestSupport.code(secret, clock.instant()));

		Api.Response refused = laptop.post("/api/users/second-step/enable", body);

		assertThat(refused.status()).isEqualTo(403);
		assertThat(refused.code()).isEqualTo("STEP_UP_FAILED");
		assertThat(laptop.get("/api/users/second-step").body().get("enabled").asBoolean()).isFalse();
	}

	@Test
	void aNewDeviceIsAskedForTheCodeAndThenTrusted() {
		SecondStepTestSupport.Enabled enabled = enable();
		Api phone = waitingForCode();
		// Not signed in yet.
		assertThat(phone.get("/api/users/me").status()).isEqualTo(401);
		clock.advance(Duration.ofSeconds(30));

		Api.Response done = submit(phone, code(enabled));

		assertThat(done.status()).isEqualTo(200);
		assertThat(done.body().get("walletAddress").asString()).isEqualTo(wallet.checksumAddress());
		assertThat(phone.get("/api/users/me").status()).isEqualTo(200);
		assertThat(count("select count(*) from user_sessions where second_step and ended_at is null")).isEqualTo(1);
		assertThat(count("select count(*) from authentication_events where event_type = 'SECOND_STEP' "
				+ "and event_status = 'SUCCESS'")).isEqualTo(1);
		// The phone is now trusted, and so is the laptop the second step was turned on with.
		assertThat(login(phone, wallet).status()).isEqualTo(200);
		assertThat(login(laptop, wallet).status()).isEqualTo(200);
	}

	@Test
	void anAuthenticatorCodeIsAcceptedOnlyOnce() {
		SecondStepTestSupport.Enabled enabled = enable();
		clock.advance(Duration.ofSeconds(30));
		String code = code(enabled);
		assertThat(submit(waitingForCode(), code).status()).isEqualTo(200);

		Api tablet = waitingForCode();
		Api.Response replay = submit(tablet, code);

		assertThat(replay.status()).isEqualTo(401);
		assertThat(replay.code()).isEqualTo("SECOND_STEP_INVALID");
		assertThat(count("select count(*) from security_events where attack_type = 'SECOND_STEP_FAILED'")).isEqualTo(1);
		clock.advance(Duration.ofSeconds(30));
		assertThat(submit(tablet, code(enabled)).status()).isEqualTo(200);
	}

	@Test
	void aBackupCodeWorksOnceInAnyCommonSpelling() {
		String backupCode = enable().backupCodes().get(0);

		assertThat(submit(waitingForCode(), backupCode.toLowerCase().replace("-", " ")).status()).isEqualTo(200);
		assertThat(submit(waitingForCode(), backupCode).code()).isEqualTo("SECOND_STEP_INVALID");
		assertThat(laptop.get("/api/users/second-step").body().get("backupCodesLeft").asInt()).isEqualTo(9);
	}

	@Test
	void fiveWrongCodesEndTheAttempt() {
		SecondStepTestSupport.Enabled enabled = enable();
		Api phone = waitingForCode();
		clock.advance(Duration.ofSeconds(30));
		String right = code(enabled);
		String wrong = right.equals("000000") ? "111111" : "000000";

		for (int i = 0; i < 5; i++) {
			assertThat(submit(phone, wrong).code()).isEqualTo("SECOND_STEP_INVALID");
		}

		assertThat(submit(phone, right).code()).isEqualTo("SECOND_STEP_EXPIRED");
		assertThat(phone.get("/api/users/me").status()).isEqualTo(401);
		// The wallet signs again and gets a new attempt (after a minute: sign-in calls are limited to ten
		// a minute per address).
		clock.advance(Duration.ofMinutes(1));
		Api.Response again = login(phone, wallet);
		assertThat(again.status()).isEqualTo(202);
		assertThat(submit(phone, code(enabled)).status()).isEqualTo(200);
	}

	@Test
	void theAttemptExpiresAfterFiveMinutes() {
		SecondStepTestSupport.Enabled enabled = enable();
		Api phone = waitingForCode();
		clock.advance(Duration.ofMinutes(5));

		assertThat(submit(phone, code(enabled)).code()).isEqualTo("SECOND_STEP_EXPIRED");
	}

	@Test
	void onlyTheBrowserThatSignedCanFinish() {
		SecondStepTestSupport.Enabled enabled = enable();
		Api phone = waitingForCode();
		clock.advance(Duration.ofSeconds(30));

		// Someone who knows (or guesses) the code but did not sign has nothing to complete.
		assertThat(submit(browser(), code(enabled)).code()).isEqualTo("SECOND_STEP_EXPIRED");
		assertThat(submit(phone, code(enabled)).status()).isEqualTo(200);
	}

	@Test
	void trustOnADeviceRunsOutAfterThirtyDays() {
		SecondStepTestSupport.Enabled enabled = enable();
		Api phone = waitingForCode();
		clock.advance(Duration.ofSeconds(30));
		assertThat(submit(phone, code(enabled)).status()).isEqualTo(200);
		clock.advance(Duration.ofDays(29));
		assertThat(login(phone, wallet).status()).isEqualTo(200);

		clock.advance(Duration.ofDays(2));

		assertThat(login(phone, wallet).status()).isEqualTo(202);
	}

	@Test
	void aWalletRevokedMeanwhileCannotFinish() {
		SecondStepTestSupport.Enabled enabled = enable();
		Api phone = waitingForCode();
		Api admin = registeredAndLoggedIn(ADMIN);
		assertThat(admin.post("/api/admin/wallet/" + wallet.checksumAddress() + "/revoke",
				proof(admin, ADMIN, "REVOKE_WALLET", wallet)).status()).isEqualTo(200);
		clock.advance(Duration.ofSeconds(30));

		assertThat(submit(phone, code(enabled)).code()).isEqualTo("WALLET_REVOKED");
		assertThat(phone.get("/api/users/me").status()).isEqualTo(401);
	}

	@Test
	void turningItOffNeedsACodeAndAFreshSignature() {
		SecondStepTestSupport.Enabled enabled = enable();
		clock.advance(Duration.ofSeconds(30));
		assertThat(laptop.post("/api/users/second-step/disable", Map.of("code", code(enabled))).code())
			.isEqualTo("VALIDATION_FAILED");

		assertThat(laptop.post("/api/users/second-step/disable", codeAndProof(code(enabled), "DISABLE_SECOND_STEP"))
			.status()).isEqualTo(204);

		assertThat(count("select count(*) from second_factors")).isZero();
		assertThat(count("select count(*) from backup_codes")).isZero();
		assertThat(login(browser(), wallet).status()).isEqualTo(200);
	}

	@Test
	void renewedBackupCodesReplaceTheOldOnes() {
		SecondStepTestSupport.Enabled enabled = enable();
		clock.advance(Duration.ofSeconds(30));

		Api.Response renewed = laptop.post("/api/users/second-step/backup-codes",
				codeAndProof(code(enabled), "RENEW_BACKUP_CODES"));

		List<String> fresh = SecondStepTestSupport.backupCodes(renewed);
		assertThat(fresh).hasSize(10).doesNotContainAnyElementsOf(enabled.backupCodes());
		assertThat(submit(waitingForCode(), enabled.backupCodes().get(0)).code()).isEqualTo("SECOND_STEP_INVALID");
		assertThat(submit(waitingForCode(), fresh.get(0)).status()).isEqualTo(200);
	}

}
