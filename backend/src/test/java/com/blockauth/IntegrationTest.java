package com.blockauth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.blockauth.blockchain.OnChainWalletStatus;
import com.blockauth.blockchain.WalletRegistryClient;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;
import com.blockauth.security.InMemoryRateLimiter;

import tools.jackson.databind.JsonNode;

/**
 * Base for integration tests: the real application on a random port, the Neon "test" branch, real HTTP
 * and real signatures. Only the chain is replaced, by an in-memory stand-in with the same state machine
 * as the WalletRegistry contract (the real client is covered by WalletRegistryClientIT).
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(IntegrationTest.Config.class)
public abstract class IntegrationTest {

	@TestConfiguration
	static class Config {

		@Bean
		@Primary
		MutableClock testClock() {
			return new MutableClock();
		}

	}

	protected static final TestWallet ADMIN = new TestWallet();
	private static final OnChainWalletStatus NOT_REGISTERED = new OnChainWalletStatus(false, false, null);

	@DynamicPropertySource
	static void testProperties(DynamicPropertyRegistry registry) {
		registry.add("blockauth.admin-wallets", ADMIN::checksumAddress);
		// Built at runtime so that no key-shaped literal sits in the repository.
		registry.add("blockauth.blockchain.operator-private-key", () -> "0x" + "11".repeat(32));
		registry.add("blockauth.security.second-step-key", () -> {
			byte[] key = new byte[32];
			new SecureRandom().nextBytes(key);
			return Base64.getEncoder().encodeToString(key);
		});
	}

	@LocalServerPort
	private int port;

	@MockitoBean
	protected WalletRegistryClient registry;

	@Autowired
	protected JdbcTemplate jdbc;

	@Autowired
	protected InMemoryRateLimiter rateLimiter;

	@Autowired
	protected MutableClock clock;

	/** The stand-in chain: wallet -> status. */
	protected final Map<String, OnChainWalletStatus> chain = new ConcurrentHashMap<>();

	@BeforeEach
	void resetState() {
		jdbc.execute("TRUNCATE users, authentication_challenges, authentication_events, security_events, devices, "
				+ "user_devices, user_sessions, sign_in_alerts, second_factors, backup_codes, wallet_flags, "
				+ "login_assessments, admin_actions, api_keys RESTART IDENTITY CASCADE");
		jdbc.execute("INSERT INTO emergency_stop (id, active, block_logins) VALUES (1, FALSE, FALSE) "
				+ "ON CONFLICT (id) DO UPDATE SET active = FALSE, block_logins = FALSE, reason = NULL, "
				+ "changed_by = NULL, changed_at = NULL");
		rateLimiter.clear();
		clock.reset();
		chain.clear();
		stubChain();
	}

	/** (Re)installs the normal behavior of the stand-in chain, e.g. after a test simulated an outage. */
	protected void stubChain() {
		// doAnswer(..).when(..) rather than when(..).thenAnswer(..): the latter calls the method while
		// stubbing, which would run (or throw from) whatever stub a test installed before.
		doAnswer(call -> chain.getOrDefault(call.<String>getArgument(0), NOT_REGISTERED)).when(registry)
				.getWalletStatus(anyString());
		doAnswer(call -> {
			OnChainWalletStatus active = new OnChainWalletStatus(true, true, clock.instant());
			return transition(chain.putIfAbsent(call.getArgument(0), active) == null);
		}).when(registry).registerWallet(anyString());
		doAnswer(call -> transition(chain.computeIfPresent(call.getArgument(0),
				(w, s) -> s.active() ? new OnChainWalletStatus(true, false, s.registeredAt()) : null) != null))
				.when(registry).revokeWallet(anyString());
		doAnswer(call -> transition(chain.computeIfPresent(call.getArgument(0),
				(w, s) -> s.active() ? null : new OnChainWalletStatus(true, true, s.registeredAt())) != null))
				.when(registry).activateWallet(anyString());
	}

	// Like the contract, an impossible transition reverts.
	private static String transition(boolean applied) {
		if (!applied) {
			throw new BlockAuthException(ErrorCode.BLOCKCHAIN_TX_FAILED);
		}
		return "0x" + "ab".repeat(32);
	}

	protected Api browser() {
		return new Api("http://localhost:" + port);
	}

	protected String challenge(Api api, TestWallet wallet, String path) {
		Api.Response response = api.post(path, Map.of("walletAddress", wallet.checksumAddress()));
		assertThat(response.status()).as(response.body().toString()).isEqualTo(201);
		return response.body().get("challenge").asString();
	}

	protected static Map<String, String> signed(TestWallet claimed, String challenge, TestWallet signer) {
		Map<String, String> body = new LinkedHashMap<>();
		body.put("walletAddress", claimed.checksumAddress());
		body.put("challenge", challenge);
		body.put("signature", signer.sign(challenge));
		return body;
	}

	protected Api.Response register(Api api, TestWallet wallet) {
		String challenge = challenge(api, wallet, "/api/auth/register/challenge");
		return api.post("/api/auth/register", signed(wallet, challenge, wallet));
	}

	protected Api.Response login(Api api, TestWallet wallet) {
		String challenge = challenge(api, wallet, "/api/auth/challenge");
		return api.post("/api/auth/verify", signed(wallet, challenge, wallet));
	}

	/** A fresh browser holding an authenticated session for a newly registered wallet. */
	protected Api registeredAndLoggedIn(TestWallet wallet) {
		Api api = browser();
		assertThat(register(api, wallet).status()).isEqualTo(201);
		assertThat(login(api, wallet).status()).isEqualTo(200);
		return api;
	}

	/**
	 * Obtains and signs the one-time challenge for a dangerous action, as the web app does with
	 * MetaMask. @return the request body part {"proof": {challenge, signature}}
	 */
	protected Map<String, Object> proof(Api api, TestWallet signer, String action, Map<String, Object> parameters) {
		Map<String, Object> body = new LinkedHashMap<>(parameters);
		body.put("action", action);
		Api.Response issued = api.post("/api/auth/step-up", body);
		assertThat(issued.status()).as(issued.body().toString()).isEqualTo(201);
		String challenge = issued.body().get("challenge").asString();
		return Map.of("proof", Map.of("challenge", challenge, "signature", signer.sign(challenge)));
	}

	/** The proof for an action on one wallet. */
	protected Map<String, Object> proof(Api api, TestWallet signer, String action, TestWallet target) {
		return proof(api, signer, action, Map.of("walletAddress", target.checksumAddress()));
	}

	/** A second client holding the same cookies, i.e. the same session, for parallel requests. */
	protected Api sameSession(Api api) {
		Api copy = browser();
		copy.cookies.putAll(api.cookies);
		return copy;
	}

	/** Starts every call at the same moment and waits for all of them. */
	protected static List<Api.Response> concurrently(List<Supplier<Api.Response>> calls) {
		CountDownLatch start = new CountDownLatch(1);
		List<CompletableFuture<Api.Response>> running = calls.stream()
			.map(call -> CompletableFuture.supplyAsync(() -> {
				try {
					start.await();
				}
				catch (InterruptedException e) {
					Thread.currentThread().interrupt();
				}
				return call.get();
			}))
			.toList();
		start.countDown();
		return running.stream().map(CompletableFuture::join).toList();
	}

	protected long count(String sql, Object... args) {
		return jdbc.queryForObject(sql, Long.class, args);
	}

	/** The response object has exactly these properties: the API contract, no more and no less. */
	protected static void assertShape(JsonNode object, String... properties) {
		assertThat(object.propertyNames()).containsExactlyInAnyOrder(properties);
	}

}
