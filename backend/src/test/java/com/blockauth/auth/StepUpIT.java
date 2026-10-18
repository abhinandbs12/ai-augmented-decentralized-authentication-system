package com.blockauth.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.blockauth.Api;
import com.blockauth.IntegrationTest;
import com.blockauth.TestWallet;

/**
 * Fresh signatures for dangerous actions: one-time, short-lived, bound to the action, its parameters,
 * the session and the session's wallet. Checked through two of the protected endpoints.
 */
class StepUpIT extends IntegrationTest {

	private final TestWallet target = new TestWallet();
	private final TestWallet other = new TestWallet();
	private Api admin;

	@BeforeEach
	void setUp() {
		admin = registeredAndLoggedIn(ADMIN);
		register(browser(), target);
		register(browser(), other);
	}

	private static Map<String, Object> flagBody(Map<String, Object> proof, TestWallet wallet) {
		Map<String, Object> body = new LinkedHashMap<>(proof);
		body.put("walletAddress", wallet.checksumAddress());
		body.put("reason", "Seen in a phishing report");
		return body;
	}

	private Api.Response revoke(Api api, TestWallet wallet, Map<String, Object> body) {
		return api.post("/api/admin/wallet/" + wallet.checksumAddress() + "/revoke", body);
	}

	@Test
	void theChallengeNamesTheActionAndItsParameters() {
		Api.Response issued = admin.post("/api/auth/step-up",
				Map.of("action", "REVOKE_WALLET", "walletAddress", target.address()));

		assertThat(issued.status()).isEqualTo(201);
		assertShape(issued.body(), "challenge", "expiresAt");
		String text = issued.body().get("challenge").asString();
		assertThat(text).startsWith("localhost:5173 wants you to sign in with your Ethereum account:\n"
				+ ADMIN.checksumAddress() + "\n\nConfirm in BlockAuth: Revoke wallet " + target.checksumAddress()
				+ ". This request sends no transaction and costs no gas.\n");
		assertThat(count("select count(*) from authentication_challenges where purpose = 'ACTION' "
				+ "and action = 'REVOKE_WALLET' and session_id is not null")).isEqualTo(1);
	}

	@Test
	void withoutAProofTheActionIsRefusedAndNothingChanges() {
		assertThat(revoke(admin, target, null).code()).isEqualTo("MALFORMED_REQUEST");
		assertThat(revoke(admin, target, Map.of()).code()).isEqualTo("VALIDATION_FAILED");
		assertThat(revoke(admin, target, Map.of("proof", Map.of("challenge", "x", "signature", "0x12"))).code())
			.isEqualTo("VALIDATION_FAILED");

		assertThat(chain.get(target.address()).active()).isTrue();
	}

	@Test
	void aProofForOneWalletCannotBeUsedForAnother() {
		Map<String, Object> forTarget = proof(admin, ADMIN, "REVOKE_WALLET", target);

		Api.Response response = revoke(admin, other, forTarget);

		assertThat(response.status()).isEqualTo(403);
		assertThat(response.code()).isEqualTo("STEP_UP_FAILED");
		assertThat(chain.get(other.address()).active()).isTrue();
		assertThat(count("select count(*) from security_events where attack_type = 'STEP_UP_FAILED'")).isEqualTo(1);
		// Refused without being used up: it still works for exactly what was signed, and only once.
		assertThat(revoke(admin, target, forTarget).status()).isEqualTo(200);
		assertThat(chain.get(target.address()).active()).isFalse();
	}

	@Test
	void aProofForOneActionCannotBeUsedForAnother() {
		Map<String, Object> flagProof = proof(admin, ADMIN, "FLAG_WALLET", target);

		assertThat(revoke(admin, target, flagProof).code()).isEqualTo("STEP_UP_FAILED");
		assertThat(chain.get(target.address()).active()).isTrue();
	}

	@Test
	void aProofWorksOnce() {
		Map<String, Object> proof = proof(admin, ADMIN, "FLAG_WALLET", target);
		assertThat(admin.post("/api/admin/wallet-flags", flagBody(proof, target)).status()).isEqualTo(201);
		jdbc.update("delete from wallet_flags");

		Api.Response replay = admin.post("/api/admin/wallet-flags", flagBody(proof, target));

		assertThat(replay.code()).isEqualTo("STEP_UP_FAILED");
		assertThat(count("select count(*) from wallet_flags")).isZero();
	}

	@Test
	void aProofExpires() {
		Map<String, Object> proof = proof(admin, ADMIN, "REVOKE_WALLET", target);
		clock.advance(Duration.ofSeconds(121));

		assertThat(revoke(admin, target, proof).code()).isEqualTo("STEP_UP_FAILED");
		assertThat(chain.get(target.address()).active()).isTrue();
	}

	@Test
	void aProofIsBoundToTheSessionItWasIssuedTo() {
		Api secondAdminBrowser = browser();
		assertThat(login(secondAdminBrowser, ADMIN).status()).isEqualTo(200);
		Map<String, Object> issuedElsewhere = proof(secondAdminBrowser, ADMIN, "REVOKE_WALLET", target);

		assertThat(revoke(admin, target, issuedElsewhere).code()).isEqualTo("STEP_UP_FAILED");
		assertThat(chain.get(target.address()).active()).isTrue();
	}

	@Test
	void aStolenSessionCannotProduceTheWalletsSignature() {
		// Whoever holds the cookie can ask for a challenge, but only the wallet's key can sign it.
		Map<String, Object> signedByAnotherKey = proof(admin, new TestWallet(), "REVOKE_WALLET", target);

		assertThat(revoke(admin, target, signedByAnotherKey).code()).isEqualTo("STEP_UP_FAILED");
		assertThat(chain.get(target.address()).active()).isTrue();
	}

	@Test
	void theRightProofCarriesTheActionOut() {
		Api.Response response = revoke(admin, target, proof(admin, ADMIN, "REVOKE_WALLET", target));

		assertThat(response.status()).isEqualTo(200);
		assertThat(chain.get(target.address()).active()).isFalse();
		assertThat(count("select count(*) from authentication_challenges where purpose = 'ACTION' and used"))
			.isEqualTo(1);
	}

	@Test
	void aUserGetsChallengesForTheirOwnActionsOnly() {
		Api user = browser();
		assertThat(login(user, target).status()).isEqualTo(200);

		Api.Response adminAction = user.post("/api/auth/step-up",
				Map.of("action", "REVOKE_WALLET", "walletAddress", other.checksumAddress()));
		assertThat(adminAction.status()).isEqualTo(403);
		assertThat(adminAction.code()).isEqualTo("ACCESS_DENIED");
		assertThat(count("select count(*) from security_events where attack_type = 'PRIVILEGE_ESCALATION_ATTEMPT' "
				+ "and wallet_address = ?", target.address())).isEqualTo(1);
		assertThat(count("select count(*) from authentication_challenges where purpose = 'ACTION'")).isZero();
		assertThat(user.post("/api/auth/step-up", Map.of("action", "ENABLE_SECOND_STEP")).status()).isEqualTo(201);
		assertThat(browser().post("/api/auth/step-up", Map.of("action", "ENABLE_SECOND_STEP")).status())
			.isEqualTo(401);
		assertThat(user.post("/api/auth/step-up", Map.of("action", "DELETE_EVERYTHING")).status()).isEqualTo(400);
	}

}
