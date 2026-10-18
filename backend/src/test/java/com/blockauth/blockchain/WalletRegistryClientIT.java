package com.blockauth.blockchain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.Reader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse.BodyHandlers;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Properties;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.web3j.crypto.Keys;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.exceptions.ClientConnectionException;
import org.web3j.protocol.http.HttpService;
import org.web3j.utils.Numeric;

import com.blockauth.TestWallet;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;
import com.blockauth.config.BlockAuthProperties;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * IT-11: the real client against a running Hardhat node with WalletRegistry deployed, using the chain
 * settings the application itself would use. Run with {@code mvnw verify -Pblockchain-it}.
 */
@Tag("blockchain")
class WalletRegistryClientIT {

	private static final ObjectMapper JSON = new ObjectMapper();
	private static final HttpClient HTTP = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();

	private static BlockAuthProperties.Blockchain config;
	private static WalletRegistryClient client;

	@BeforeAll
	static void connect() throws IOException {
		Properties file = new Properties();
		Path dotEnv = Path.of("..", ".env.local");
		if (Files.exists(dotEnv)) {
			try (Reader reader = Files.newBufferedReader(dotEnv)) {
				file.load(reader);
			}
		}
		config = new BlockAuthProperties.Blockchain(setting(file, "BLOCKCHAIN_RPC_URL"),
				Long.parseLong(setting(file, "BLOCKCHAIN_CHAIN_ID")), setting(file, "CONTRACT_ADDRESS"),
				setting(file, "BLOCKCHAIN_OPERATOR_PRIVATE_KEY"));
		client = clientFor(config, Duration.ofSeconds(30));
	}

	/** Same precedence as the application: a real environment variable wins over the repository's .env.local. */
	private static String setting(Properties file, String name) {
		String fromEnvironment = System.getenv(name);
		return fromEnvironment != null ? fromEnvironment
				: Objects.requireNonNull(file.getProperty(name), name + " is set neither in the environment nor in ../.env.local");
	}

	@Test
	void walletMovesThroughTheContractStateMachine() {
		String wallet = new TestWallet().address();
		assertThat(client.getWalletStatus(wallet)).isEqualTo(new OnChainWalletStatus(false, false, null));

		assertThat(client.registerWallet(wallet)).matches("^0x[0-9a-f]{64}$");
		OnChainWalletStatus registered = client.getWalletStatus(wallet);
		assertThat(registered.valid()).isTrue();
		assertThat(registered.registeredAt()).isAfter(Instant.parse("2020-01-01T00:00:00Z"));

		assertThat(client.revokeWallet(wallet)).startsWith("0x");
		assertThat(client.getWalletStatus(wallet).label()).isEqualTo("REVOKED");

		assertThat(client.activateWallet(wallet)).startsWith("0x");
		// The registration time survives revocation and reactivation.
		assertThat(client.getWalletStatus(wallet)).isEqualTo(registered);
	}

	@Test
	void transitionsTheContractWouldRevertAreReportedNotSent() {
		String wallet = new TestWallet().address();
		long blockBefore = blockNumber();
		assertFails(() -> client.revokeWallet(wallet), ErrorCode.BLOCKCHAIN_TX_FAILED);
		assertFails(() -> client.activateWallet(wallet), ErrorCode.BLOCKCHAIN_TX_FAILED);
		assertFails(() -> client.registerWallet("0x0000000000000000000000000000000000000000"),
				ErrorCode.BLOCKCHAIN_TX_FAILED);
		assertThat(blockNumber()).isEqualTo(blockBefore);

		client.registerWallet(wallet);
		assertFails(() -> client.registerWallet(wallet), ErrorCode.BLOCKCHAIN_TX_FAILED);
		assertFails(() -> client.activateWallet(wallet), ErrorCode.BLOCKCHAIN_TX_FAILED);
		assertThat(client.getWalletStatus(wallet).valid()).isTrue();
	}

	@Test
	void anAccountThatIsNotTheContractAdminCannotChangeState() {
		// A fresh key: it is not the deployer, so the contract's onlyAdmin check refuses it.
		WalletRegistryClient outsider = clientFor(new BlockAuthProperties.Blockchain(config.rpcUrl(),
				config.chainId(), config.contractAddress(), randomPrivateKey()), Duration.ofSeconds(5));
		String wallet = new TestWallet().address();
		client.registerWallet(wallet);

		assertFails(() -> outsider.registerWallet(new TestWallet().address()), ErrorCode.BLOCKCHAIN_TX_FAILED);
		assertFails(() -> outsider.revokeWallet(wallet), ErrorCode.BLOCKCHAIN_TX_FAILED);
		assertThat(client.getWalletStatus(wallet).valid()).isTrue();
	}

	@Test
	void anUnconfirmedTransactionTimesOutAndIsNotTreatedAsSuccess() {
		String wallet = new TestWallet().address();
		WalletRegistryClient impatient = clientFor(config, Duration.ofSeconds(2));
		rpc("evm_setAutomine", false);
		try {
			// Nothing mines the transaction, so no receipt arrives within the timeout.
			assertFails(() -> impatient.registerWallet(wallet), ErrorCode.BLOCKCHAIN_TIMEOUT);
			assertThat(client.getWalletStatus(wallet).registered()).isFalse();
		}
		finally {
			rpc("evm_setAutomine", true);
			rpc("evm_mine");
		}
		// It was mined late. A retry must find the wallet registered rather than register it twice.
		assertThat(client.getWalletStatus(wallet).valid()).isTrue();
		assertFails(() -> client.registerWallet(wallet), ErrorCode.BLOCKCHAIN_TX_FAILED);
	}

	@Test
	void aMinedButRevertedTransactionIsReportedAsFailed() throws Exception {
		String wallet = new TestWallet().address();
		WalletRegistryClient first = clientFor(config, Duration.ofSeconds(20));
		// The second client pauses between estimating gas and sending, so that a competing transaction
		// can get in front of it: its own transaction then passes estimation but reverts when mined.
		Web3j paused = Mockito.spy(Web3j.build(new HttpService(config.rpcUrl())));
		CountDownLatch estimated = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		Mockito.doAnswer(call -> {
			estimated.countDown();
			release.await(20, TimeUnit.SECONDS);
			return call.callRealMethod();
		}).when(paused).ethGasPrice();
		WalletRegistryClient second = new WalletRegistryClient(paused,
				new BlockAuthProperties("http://localhost:5173", 120, List.of(), config), Duration.ofSeconds(20));

		long pendingBefore = pendingNonce();
		CompletableFuture<String> early;
		CompletableFuture<String> late;
		rpc("evm_setAutomine", false);
		try {
			late = CompletableFuture.supplyAsync(() -> second.registerWallet(wallet));
			assertThat(estimated.await(10, TimeUnit.SECONDS)).isTrue();
			early = CompletableFuture.supplyAsync(() -> first.registerWallet(wallet));
			awaitPendingNonce(pendingBefore + 1);
			release.countDown();
			awaitPendingNonce(pendingBefore + 2);
		}
		finally {
			release.countDown();
			rpc("evm_setAutomine", true);
			rpc("evm_mine");
		}

		assertThat(early.get(30, TimeUnit.SECONDS)).matches("^0x[0-9a-f]{64}$");
		assertThatThrownBy(() -> late.get(30, TimeUnit.SECONDS)).hasCauseInstanceOf(BlockAuthException.class)
				.cause().extracting(e -> ((BlockAuthException) e).code()).isEqualTo(ErrorCode.BLOCKCHAIN_TX_FAILED);
		// Confirm the scenario really happened: one block, two transactions, one of them reverted.
		JsonNode block = rpc("eth_getBlockByNumber", "latest", false);
		assertThat(block.get("transactions").size()).isEqualTo(2);
		List<String> statuses = new ArrayList<>();
		for (JsonNode hash : block.get("transactions")) {
			statuses.add(rpc("eth_getTransactionReceipt", hash.asString()).get("status").asString());
		}
		assertThat(statuses).containsExactlyInAnyOrder("0x1", "0x0");
		assertThat(client.getWalletStatus(wallet).valid()).isTrue();
	}

	@Test
	void rpcFailureWhileWaitingForTheReceiptIsReportedAsUnavailable() {
		String wallet = new TestWallet().address();
		// The node accepts the transaction, then answers the receipt query with an HTTP error.
		Web3j flaky = Mockito.spy(Web3j.build(new HttpService(config.rpcUrl())));
		Mockito.doThrow(new ClientConnectionException("Invalid response received: 502")).when(flaky)
				.ethGetTransactionReceipt(Mockito.anyString());
		WalletRegistryClient unlucky = new WalletRegistryClient(flaky,
				new BlockAuthProperties("http://localhost:5173", 120, List.of(), config), Duration.ofSeconds(5));

		assertFails(() -> unlucky.registerWallet(wallet), ErrorCode.BLOCKCHAIN_UNAVAILABLE);

		// The transaction itself was mined, so a retry finds the wallet registered instead of sending again.
		assertThat(client.getWalletStatus(wallet).valid()).isTrue();
		assertFails(() -> client.registerWallet(wallet), ErrorCode.BLOCKCHAIN_TX_FAILED);
	}

	@Test
	void concurrentWritesFromTheOperatorNeverCollideOnTheNonce() {
		List<String> wallets = IntStream.range(0, 6).mapToObj(i -> new TestWallet().address()).toList();
		long nonceBefore = pendingNonce();
		ExecutorService pool = Executors.newFixedThreadPool(wallets.size());
		List<String> hashes;
		try {
			List<CompletableFuture<String>> writes = wallets.stream()
					.map(wallet -> CompletableFuture.supplyAsync(() -> client.registerWallet(wallet), pool)).toList();
			hashes = writes.stream().map(CompletableFuture::join).toList();
		}
		finally {
			pool.shutdown();
		}

		assertThat(hashes).doesNotHaveDuplicates().allMatch(hash -> hash.matches("^0x[0-9a-f]{64}$"));
		assertThat(pendingNonce()).isEqualTo(nonceBefore + wallets.size());
		assertThat(wallets).allMatch(wallet -> client.getWalletStatus(wallet).valid());
	}

	@Test
	void startupVerifierAcceptsTheConfiguredChain() {
		assertThat(client.chainId()).isEqualTo(config.chainId());
		assertThat(client.contractHasCode()).isTrue();
		assertThat(client.contractAdmin()).isEqualTo(client.operatorAddress());
		assertThatCode(() -> verifier(config).verify()).doesNotThrowAnyException();
	}

	@Test
	void startupVerifierRejectsWrongChainMissingContractAndForeignOperator() {
		assertThatThrownBy(() -> verifier(new BlockAuthProperties.Blockchain(config.rpcUrl(), 1,
				config.contractAddress(), config.operatorPrivateKey())).verify())
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("chain ID");

		assertThatThrownBy(() -> verifier(new BlockAuthProperties.Blockchain(config.rpcUrl(), config.chainId(),
				new TestWallet().address(), config.operatorPrivateKey())).verify())
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("No contract");

		String foreignKey = randomPrivateKey();
		assertThatThrownBy(() -> verifier(new BlockAuthProperties.Blockchain(config.rpcUrl(), config.chainId(),
				config.contractAddress(), foreignKey)).verify()).isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("admin").hasMessageNotContaining(foreignKey.substring(2));
	}

	@Test
	void unreachableRpcFailsClosedButDoesNotBlockStartup() {
		BlockAuthProperties.Blockchain down = new BlockAuthProperties.Blockchain("http://127.0.0.1:1",
				config.chainId(), config.contractAddress(), config.operatorPrivateKey());
		WalletRegistryClient offline = clientFor(down, Duration.ofSeconds(2));

		assertFails(() -> offline.getWalletStatus(new TestWallet().address()), ErrorCode.BLOCKCHAIN_UNAVAILABLE);
		assertFails(() -> offline.registerWallet(new TestWallet().address()), ErrorCode.BLOCKCHAIN_UNAVAILABLE);
		assertFails(offline::chainId, ErrorCode.BLOCKCHAIN_UNAVAILABLE);
		assertThatCode(() -> verifier(down).verify()).doesNotThrowAnyException();
	}

	private static WalletRegistryClient clientFor(BlockAuthProperties.Blockchain blockchain, Duration receiptTimeout) {
		return new WalletRegistryClient(Web3j.build(new HttpService(blockchain.rpcUrl())),
				new BlockAuthProperties("http://localhost:5173", 120, List.of(), blockchain), receiptTimeout);
	}

	private static BlockchainStartupVerifier verifier(BlockAuthProperties.Blockchain blockchain) {
		return new BlockchainStartupVerifier(clientFor(blockchain, Duration.ofSeconds(5)),
				new BlockAuthProperties("http://localhost:5173", 120, List.of(), blockchain));
	}

	private static String randomPrivateKey() {
		try {
			return Numeric.toHexStringWithPrefixZeroPadded(Keys.createEcKeyPair().getPrivateKey(), 64);
		}
		catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	private static long blockNumber() {
		return Numeric.decodeQuantity(rpc("eth_blockNumber").asString()).longValueExact();
	}

	private static long pendingNonce() {
		return Numeric.decodeQuantity(rpc("eth_getTransactionCount", client.operatorAddress(), "pending").asString())
				.longValueExact();
	}

	private static void awaitPendingNonce(long expected) throws InterruptedException {
		for (int i = 0; i < 100 && pendingNonce() < expected; i++) {
			Thread.sleep(100);
		}
		assertThat(pendingNonce()).isEqualTo(expected);
	}

	/** Raw JSON-RPC, for the Hardhat test-control methods that Web3j has no API for. */
	private static JsonNode rpc(String method, Object... params) {
		try {
			String body = JSON.writeValueAsString(
					java.util.Map.of("jsonrpc", "2.0", "id", 1, "method", method, "params", List.of(params)));
			String response = HTTP.send(HttpRequest.newBuilder(URI.create(config.rpcUrl()))
					.header("Content-Type", "application/json").POST(BodyPublishers.ofString(body)).build(),
					BodyHandlers.ofString()).body();
			JsonNode node = JSON.readTree(response);
			assertThat(node.has("error")).as(response).isFalse();
			return node.get("result");
		}
		catch (IOException e) {
			throw new IllegalStateException(e);
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException(e);
		}
	}

	private static void assertFails(Runnable action, ErrorCode expected) {
		assertThatThrownBy(action::run).isInstanceOf(BlockAuthException.class)
				.extracting(e -> ((BlockAuthException) e).code()).isEqualTo(expected);
	}

}
