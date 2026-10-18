package com.blockauth.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;

import java.time.Duration;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.web3j.utils.Numeric;

import com.blockauth.Api;
import com.blockauth.IntegrationTest;
import com.blockauth.TestWallet;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;

/** IT-02: login and session hardening, plus the signature and challenge attacks ST-01 to ST-08 and ST-15. */
class LoginFlowIT extends IntegrationTest {

	private final TestWallet wallet = new TestWallet();
	private Api browser;

	@BeforeEach
	void registerWallet() {
		browser = browser();
		assertThat(register(browser, wallet).status()).isEqualTo(201);
	}

	@Test
	void loginCreatesAHardenedSessionAndUnlocksTheApi() {
		Api.Response response = login(browser, wallet);

		assertThat(response.status()).isEqualTo(200);
		assertShape(response.body(), "id", "walletAddress", "role", "status", "createdAt");
		assertThat(response.body().get("walletAddress").asString()).isEqualTo(wallet.checksumAddress());
		assertThat(response.body().get("role").asString()).isEqualTo("USER");
		String sessionCookie = response.setCookies().stream().filter(c -> c.startsWith("BLOCKAUTH_SESSION="))
				.findFirst().orElseThrow();
		assertThat(sessionCookie).contains("HttpOnly", "SameSite=Strict", "Path=/");
		// The session ID travels in the cookie only, never in a URL or a response body.
		assertThat(response.body().toString()).doesNotContain(browser.cookies.get("BLOCKAUTH_SESSION"));

		Api.Response me = browser.get("/api/users/me");
		assertThat(me.status()).isEqualTo(200);
		assertShape(me.body(), "id", "walletAddress", "role", "status", "createdAt");
		assertThat(me.body()).isEqualTo(response.body());
		assertThat(count("select count(*) from authentication_events where event_type = 'LOGIN' "
				+ "and event_status = 'SUCCESS' and user_id is not null")).isEqualTo(1);
	}

	@Test
	void sessionFixation_plantedSessionIdIsNeverAuthenticated() {
		browser.cookies.put("BLOCKAUTH_SESSION", "ATTACKER-CHOSEN-ID");

		assertThat(login(browser, wallet).status()).isEqualTo(200);

		assertThat(browser.cookies.get("BLOCKAUTH_SESSION")).isNotEqualTo("ATTACKER-CHOSEN-ID");
		Api attacker = browser();
		attacker.cookies.put("BLOCKAUTH_SESSION", "ATTACKER-CHOSEN-ID");
		assertThat(attacker.get("/api/users/me").status()).isEqualTo(401);
	}

	@Test
	void loginRotatesAnExistingSession() {
		login(browser, wallet);
		String first = browser.cookies.get("BLOCKAUTH_SESSION");

		login(browser, wallet);

		assertThat(browser.cookies.get("BLOCKAUTH_SESSION")).isNotEqualTo(first);
		Api stale = browser();
		stale.cookies.put("BLOCKAUTH_SESSION", first);
		assertThat(stale.get("/api/users/me").status()).isEqualTo(401);
	}

	@Test
	void loginAsAnotherWalletReplacesTheSession() {
		TestWallet other = new TestWallet();
		register(browser, other);
		login(browser, wallet);
		String first = browser.cookies.get("BLOCKAUTH_SESSION");

		assertThat(login(browser, other).status()).isEqualTo(200);

		assertThat(browser.get("/api/users/me").body().get("walletAddress").asString())
				.isEqualTo(other.checksumAddress());
		Api stale = browser();
		stale.cookies.put("BLOCKAUTH_SESSION", first);
		assertThat(stale.get("/api/users/me").status()).isEqualTo(401);
	}

	@Test
	void twoBrowsersCanHoldIndependentSessions() {
		login(browser, wallet);
		Api second = browser();

		assertThat(login(second, wallet).status()).isEqualTo(200);

		assertThat(browser.get("/api/users/me").status()).isEqualTo(200);
		assertThat(second.get("/api/users/me").status()).isEqualTo(200);
		assertThat(second.cookies.get("BLOCKAUTH_SESSION")).isNotEqualTo(browser.cookies.get("BLOCKAUTH_SESSION"));
	}

	@Test
	void replay_resubmittingASuccessfulLoginIsRejected() {
		Map<String, String> body = signed(wallet, challenge(browser, wallet, "/api/auth/challenge"), wallet);
		assertThat(browser.post("/api/auth/verify", body).status()).isEqualTo(200);

		Api attacker = browser();
		Api.Response replay = attacker.post("/api/auth/verify", body);

		assertThat(replay.status()).isEqualTo(401);
		assertThat(replay.code()).isEqualTo("CHALLENGE_ALREADY_USED");
		assertThat(attacker.cookies).doesNotContainKey("BLOCKAUTH_SESSION");
		assertThat(count("select count(*) from security_events where attack_type = 'REPLAY_ATTEMPT' "
				+ "and result = 'BLOCKED'")).isEqualTo(1);
		assertThat(count("select count(*) from authentication_events where event_type = 'LOGIN' "
				+ "and event_status = 'FAILURE' and failure_reason = 'CHALLENGE_ALREADY_USED'")).isEqualTo(1);
	}

	@Test
	void challengeIsBurnedByAFailedAttempt() {
		String challenge = challenge(browser, wallet, "/api/auth/challenge");
		Api.Response forged = browser.post("/api/auth/verify", signed(wallet, challenge, new TestWallet()));
		assertThat(forged.status()).isEqualTo(401);
		assertThat(forged.code()).isEqualTo("SIGNATURE_MISMATCH");

		Api.Response second = browser.post("/api/auth/verify", signed(wallet, challenge, wallet));

		assertThat(second.code()).isEqualTo("CHALLENGE_ALREADY_USED");
		assertThat(browser.cookies).doesNotContainKey("BLOCKAUTH_SESSION");
	}

	@Test
	void expiredChallengeIsRejected() {
		Map<String, String> body = signed(wallet, challenge(browser, wallet, "/api/auth/challenge"), wallet);
		clock.advance(Duration.ofSeconds(121));

		Api.Response response = browser.post("/api/auth/verify", body);

		assertThat(response.status()).isEqualTo(401);
		assertThat(response.code()).isEqualTo("CHALLENGE_EXPIRED");
		assertThat(browser.cookies).doesNotContainKey("BLOCKAUTH_SESSION");
		assertThat(count("select count(*) from security_events where attack_type = 'EXPIRED_CHALLENGE'"))
				.isEqualTo(1);
	}

	@Test
	void challengeIsStillValidJustBeforeItsTwoMinutesAreUp() {
		Map<String, String> body = signed(wallet, challenge(browser, wallet, "/api/auth/challenge"), wallet);
		clock.advance(Duration.ofSeconds(118));

		assertThat(browser.post("/api/auth/verify", body).status()).isEqualTo(200);
	}

	@Test
	void tamperedSignaturesNeverAuthenticate() {
		Map<String, String> flipped = signed(wallet, challenge(browser, wallet, "/api/auth/challenge"), wallet);
		byte[] raw = Numeric.hexStringToByteArray(flipped.get("signature"));
		raw[5] ^= 0x01;
		flipped.put("signature", Numeric.toHexString(raw));
		Api.Response first = browser.post("/api/auth/verify", flipped);
		assertThat(first.status()).isEqualTo(401);
		assertThat(first.code()).isIn("INVALID_SIGNATURE", "SIGNATURE_MISMATCH");

		Map<String, String> badV = signed(wallet, challenge(browser, wallet, "/api/auth/challenge"), wallet);
		raw = Numeric.hexStringToByteArray(badV.get("signature"));
		raw[64] = 29;
		badV.put("signature", Numeric.toHexString(raw));
		assertThat(browser.post("/api/auth/verify", badV).code()).isEqualTo("INVALID_SIGNATURE");

		Map<String, String> tooShort = signed(wallet, challenge(browser, wallet, "/api/auth/challenge"), wallet);
		tooShort.put("signature", tooShort.get("signature").substring(0, 130));
		Api.Response malformed = browser.post("/api/auth/verify", tooShort);
		assertThat(malformed.status()).isEqualTo(400);
		assertThat(malformed.body().get("fieldErrors").get(0).get("field").asString()).isEqualTo("signature");

		assertThat(browser.cookies).doesNotContainKey("BLOCKAUTH_SESSION");
		assertThat(count("select count(*) from security_events where attack_type in "
				+ "('INVALID_SIGNATURE', 'SIGNATURE_MISMATCH')")).isEqualTo(2);
	}

	@Test
	void modifiedChallengeTextIsNotAKnownChallenge() {
		String challenge = challenge(browser, wallet, "/api/auth/challenge");
		String altered = challenge.replace("Sign in to BlockAuth.", "Sign in to BlockAuth. ");

		Api.Response response = browser.post("/api/auth/verify", signed(wallet, altered, wallet));

		assertThat(response.status()).isEqualTo(401);
		assertThat(response.code()).isEqualTo("INVALID_CHALLENGE");
		// The untouched original was not consumed by the forgery and still works for its owner.
		assertThat(browser.post("/api/auth/verify", signed(wallet, challenge, wallet)).status()).isEqualTo(200);
	}

	@Test
	void signatureByAnotherRegisteredWalletIsAMismatch() {
		TestWallet other = new TestWallet();
		register(browser, other);

		Api.Response response = browser.post("/api/auth/verify",
				signed(wallet, challenge(browser, wallet, "/api/auth/challenge"), other));

		assertThat(response.status()).isEqualTo(401);
		assertThat(response.code()).isEqualTo("SIGNATURE_MISMATCH");
		assertThat(browser.cookies).doesNotContainKey("BLOCKAUTH_SESSION");
		assertThat(count("select count(*) from security_events where attack_type = 'SIGNATURE_MISMATCH'"))
				.isEqualTo(1);
	}

	@Test
	void challengeIsBoundToItsWalletAndPurpose() {
		TestWallet other = new TestWallet();
		register(browser, other);

		// A registration challenge cannot log in...
		String registration = challenge(browser, wallet, "/api/auth/register/challenge");
		assertThat(browser.post("/api/auth/verify", signed(wallet, registration, wallet)).code())
				.isEqualTo("INVALID_CHALLENGE");
		// ...a login challenge cannot register...
		TestWallet fresh = new TestWallet();
		String loginChallenge = challenge(browser, fresh, "/api/auth/challenge");
		assertThat(browser.post("/api/auth/register", signed(fresh, loginChallenge, fresh)).code())
				.isEqualTo("INVALID_CHALLENGE");
		// ...and a challenge issued for one wallet cannot be claimed by another, even correctly signed.
		String forWallet = challenge(browser, wallet, "/api/auth/challenge");
		assertThat(browser.post("/api/auth/verify", signed(other, forWallet, other)).code())
				.isEqualTo("INVALID_CHALLENGE");

		assertThat(browser.cookies).doesNotContainKey("BLOCKAUTH_SESSION");
		assertThat(chain).doesNotContainKey(fresh.address());
		assertThat(count("select count(*) from security_events where attack_type = 'INVALID_CHALLENGE'"))
				.isEqualTo(3);
	}

	@Test
	void unregisteredWalletWithAValidSignatureIsRefused() {
		TestWallet stranger = new TestWallet();

		Api.Response response = login(browser, stranger);

		assertThat(response.status()).isEqualTo(403);
		assertThat(response.code()).isEqualTo("WALLET_NOT_REGISTERED");
		assertThat(count("select count(*) from security_events where attack_type = 'UNREGISTERED_WALLET'"))
				.isEqualTo(1);
	}

	@Test
	void thereIsNoPasswordSurface() {
		Map<String, String> body = signed(wallet, challenge(browser, wallet, "/api/auth/challenge"), wallet);
		body.put("password", "x");

		Api.Response response = browser.post("/api/auth/verify", body);

		assertThat(response.status()).isEqualTo(400);
		assertThat(response.code()).isEqualTo("MALFORMED_REQUEST");
		// The only "secret" columns hold the encrypted authenticator secret and the hash of an API key's secret.
		assertThat(jdbc.queryForList("select table_name || '.' || column_name from information_schema.columns "
				+ "where table_schema = 'public' and (column_name ilike '%password%' or column_name ilike '%secret%' "
				+ "or column_name ilike '%private%')", String.class))
			.containsExactlyInAnyOrder("second_factors.secret_ciphertext", "api_keys.secret_hash");
	}

	@Test
	void chainOutageFailsLoginClosedButKeepsExistingSessionsWorking() {
		login(browser, wallet);
		doThrow(new BlockAuthException(ErrorCode.BLOCKCHAIN_UNAVAILABLE)).when(registry).getWalletStatus(anyString());

		Api second = browser();
		Api.Response response = login(second, wallet);

		assertThat(response.status()).isEqualTo(503);
		assertThat(response.code()).isEqualTo("BLOCKCHAIN_UNAVAILABLE");
		assertThat(second.cookies).doesNotContainKey("BLOCKAUTH_SESSION");
		// The challenge was spent on the failed attempt: a new one is needed.
		assertThat(count("select count(*) from authentication_challenges where purpose = 'LOGIN' and not used"))
				.isZero();
		// Endpoints backed by the database only keep working; the one that reads the chain does not.
		assertThat(browser.get("/api/users/me").status()).isEqualTo(200);
		assertThat(browser.get("/api/users/authentication-history").status()).isEqualTo(200);
		assertThat(browser.get("/api/users/wallet-status").status()).isEqualTo(503);
	}

	@Test
	void walletStatusComesFromTheChain() {
		login(browser, wallet);

		Api.Response status = browser.get("/api/users/wallet-status");

		assertThat(status.status()).isEqualTo(200);
		assertShape(status.body(), "walletAddress", "registered", "active", "status", "registeredAt", "source");
		assertThat(status.body().get("walletAddress").asString()).isEqualTo(wallet.checksumAddress());
		assertThat(status.body().get("status").asString()).isEqualTo("ACTIVE");
		assertThat(status.body().get("registered").asBoolean()).isTrue();
		assertThat(status.body().get("source").asString()).isEqualTo("BLOCKCHAIN");
	}

}
