package com.blockauth.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;

import org.junit.jupiter.api.Test;

import com.blockauth.Api;
import com.blockauth.IntegrationTest;
import com.blockauth.TestWallet;
import com.blockauth.blockchain.OnChainWalletStatus;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;

/** IT-01 and the registration edge cases (EC-01, EC-02, EC-06, EC-08, EC-09, EC-11, EC-12). */
class RegistrationFlowIT extends IntegrationTest {

	private final TestWallet wallet = new TestWallet();

	@Test
	void signedRegistrationWritesChainUserAndEventButNoSession() {
		Api api = browser();

		Api.Response response = register(api, wallet);

		assertThat(response.status()).isEqualTo(201);
		assertShape(response.body(), "walletAddress", "role", "status", "registeredAt", "transactionHash");
		assertThat(response.body().get("walletAddress").asString()).isEqualTo(wallet.checksumAddress());
		assertThat(response.body().get("role").asString()).isEqualTo("USER");
		assertThat(response.body().get("status").asString()).isEqualTo("ACTIVE");
		assertThat(response.body().get("transactionHash").asString()).startsWith("0x");
		assertThat(chain.get(wallet.address()).valid()).isTrue();
		assertThat(count("select count(*) from users where wallet_address = ? and status = 'ACTIVE'",
				wallet.address())).isEqualTo(1);
		assertThat(count("select count(*) from authentication_events where event_type = 'REGISTRATION' "
				+ "and event_status = 'SUCCESS' and wallet_address = ? and user_id is not null "
				+ "and ip_address is not null", wallet.address())).isEqualTo(1);
		// Registration never logs the user in.
		assertThat(api.cookies).doesNotContainKey("BLOCKAUTH_SESSION");
		assertThat(api.get("/api/users/me").status()).isEqualTo(401);
	}

	@Test
	void bootstrapWalletBecomesAdmin() {
		assertThat(register(browser(), ADMIN).body().get("role").asString()).isEqualTo("ADMIN");
	}

	@Test
	void secondRegistrationOfTheSameWalletIsAConflictAndSendsNoTransaction() {
		Api api = browser();
		register(api, wallet);

		Api.Response again = register(api, wallet);

		assertThat(again.status()).isEqualTo(409);
		assertThat(again.code()).isEqualTo("WALLET_ALREADY_REGISTERED");
		assertThat(count("select count(*) from users")).isEqualTo(1);
		verify(registry, times(1)).registerWallet(anyString());
	}

	@Test
	void challengeIsIssuedIdenticallyForUnregisteredWallets() {
		Api.Response response = browser().post("/api/auth/challenge",
				Map.of("walletAddress", wallet.checksumAddress()));

		assertThat(response.status()).isEqualTo(201);
		assertShape(response.body(), "challenge", "nonce", "expiresAt");
		assertThat(response.body().get("nonce").asString()).matches("^[0-9a-f]{32}$");
		assertThat(response.body().get("challenge").asString()).startsWith(
				"localhost:5173 wants you to sign in with your Ethereum account:\n" + wallet.checksumAddress() + "\n")
			.contains("Sign in to BlockAuth.", "URI: http://localhost:5173", "Chain ID: 31337",
					"Nonce: " + response.body().get("nonce").asString());
	}

	@Test
	void everyInvalidFieldIsReportedInOneResponse() {
		Api.Response response = browser().post("/api/auth/register", Map.of());

		assertThat(response.status()).isEqualTo(400);
		assertThat(response.code()).isEqualTo("VALIDATION_FAILED");
		assertThat(response.body().get("fieldErrors")).extracting(e -> e.get("field").asString())
				.containsExactlyInAnyOrder("walletAddress", "challenge", "signature");
	}

	@Test
	void lowerUpperAndChecksummedAddressesAreOneIdentity() {
		Api api = browser();
		String upper = "0x" + wallet.address().substring(2).toUpperCase();
		String challenge = api.post("/api/auth/register/challenge", Map.of("walletAddress", wallet.address())).body()
				.get("challenge").asString();
		Map<String, String> body = new LinkedHashMap<>();
		body.put("walletAddress", upper);
		body.put("challenge", challenge);
		body.put("signature", wallet.sign(challenge));

		assertThat(api.post("/api/auth/register", body).status()).isEqualTo(201);
		assertThat(login(api, wallet).status()).isEqualTo(200);

		assertThat(count("select count(*) from users")).isEqualTo(1);
		assertThat(count("select count(*) from users where wallet_address = ?", wallet.address())).isEqualTo(1);
	}

	@Test
	void clientCannotChooseItsOwnRole() {
		Api api = browser();
		Map<String, String> body = signed(wallet, challenge(api, wallet, "/api/auth/register/challenge"), wallet);
		body.put("role", "ADMIN");

		Api.Response response = api.post("/api/auth/register", body);

		assertThat(response.status()).isEqualTo(400);
		assertThat(response.code()).isEqualTo("MALFORMED_REQUEST");
		assertThat(count("select count(*) from users")).isZero();
	}

	@Test
	void concurrentRegistrationsOfOneWalletCreateExactlyOneUser() throws Exception {
		Api first = browser();
		Api second = browser();
		Map<String, String> firstBody = signed(wallet, challenge(first, wallet, "/api/auth/register/challenge"),
				wallet);
		Map<String, String> secondBody = signed(wallet, challenge(second, wallet, "/api/auth/register/challenge"),
				wallet);

		CountDownLatch start = new CountDownLatch(1);
		CompletableFuture<Api.Response> a = CompletableFuture.supplyAsync(() -> {
			await(start);
			return first.post("/api/auth/register", firstBody);
		});
		CompletableFuture<Api.Response> b = CompletableFuture.supplyAsync(() -> {
			await(start);
			return second.post("/api/auth/register", secondBody);
		});
		start.countDown();
		List<Api.Response> responses = List.of(a.get(), b.get());

		// One request wins; the other finds the wallet already registered. Never a 500, never two rows.
		assertThat(responses).extracting(Api.Response::status).containsExactlyInAnyOrder(201, 409);
		assertThat(responses).filteredOn(r -> r.status() == 409).extracting(Api.Response::code)
				.containsExactly("WALLET_ALREADY_REGISTERED");
		assertThat(count("select count(*) from users where wallet_address = ?", wallet.address())).isEqualTo(1);
		assertThat(chain.get(wallet.address()).valid()).isTrue();
	}

	@Test
	void chainOutageDuringRegistrationWritesNothingAndARetrySucceeds() {
		Api api = browser();
		doThrow(new BlockAuthException(ErrorCode.BLOCKCHAIN_UNAVAILABLE)).when(registry).getWalletStatus(anyString());

		Api.Response outage = register(api, wallet);

		assertThat(outage.status()).isEqualTo(503);
		assertThat(outage.code()).isEqualTo("BLOCKCHAIN_UNAVAILABLE");
		assertThat(chain).isEmpty();
		assertThat(count("select count(*) from users")).isZero();

		stubChain();
		assertThat(register(api, wallet).status()).isEqualTo(201);
	}

	@Test
	void unconfirmedTransactionTimesOutAndARetryReconcilesWithoutASecondTransaction() {
		Api api = browser();
		// The transaction is sent and mined, but its receipt does not arrive in time.
		doAnswer(call -> {
			chain.put(call.getArgument(0), new OnChainWalletStatus(true, true, clock.instant()));
			throw new BlockAuthException(ErrorCode.BLOCKCHAIN_TIMEOUT);
		}).when(registry).registerWallet(anyString());

		Api.Response timeout = register(api, wallet);

		assertThat(timeout.status()).isEqualTo(504);
		assertThat(timeout.code()).isEqualTo("BLOCKCHAIN_TIMEOUT");
		assertThat(count("select count(*) from users")).isZero();

		Api.Response retry = register(api, wallet);

		assertThat(retry.status()).isEqualTo(201);
		assertThat(retry.body().get("transactionHash").isNull()).isTrue();
		verify(registry, times(1)).registerWallet(anyString());
	}

	@Test
	void retryAfterAFailedUserInsertCompletesRegistration() {
		// An earlier attempt reached the chain but never stored the user row.
		registry.registerWallet(wallet.address());
		Api api = browser();
		Api.Response incomplete = login(api, wallet);
		assertThat(incomplete.status()).isEqualTo(409);
		assertThat(incomplete.code()).isEqualTo("REGISTRATION_INCOMPLETE");

		Api.Response retry = register(api, wallet);

		assertThat(retry.status()).isEqualTo(201);
		assertThat(retry.body().get("transactionHash").isNull()).isTrue();
		assertThat(login(api, wallet).status()).isEqualTo(200);
	}

	@Test
	void chainResetKeepsAnActiveUserButNeverReactivatesARevokedOne() {
		Api api = browser();
		register(api, wallet);
		UUID id = jdbc.queryForObject("select id from users where wallet_address = ?", UUID.class, wallet.address());

		// The local chain was restarted: the registry is empty while the database still has the user.
		chain.clear();
		Api.Response afterReset = login(api, wallet);
		assertThat(afterReset.status()).isEqualTo(403);
		assertThat(afterReset.code()).isEqualTo("WALLET_NOT_REGISTERED");

		assertThat(register(api, wallet).status()).isEqualTo(201);
		assertThat(jdbc.queryForObject("select id from users where wallet_address = ?", UUID.class, wallet.address()))
				.isEqualTo(id);

		jdbc.update("update users set status = 'REVOKED' where id = ?", id);
		chain.clear();
		Api.Response revoked = register(api, wallet);
		assertThat(revoked.status()).isEqualTo(409);
		assertThat(revoked.code()).isEqualTo("STATE_CONFLICT");
		assertThat(chain).isEmpty();
	}

	private static void await(CountDownLatch latch) {
		try {
			latch.await();
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
		}
	}

}
