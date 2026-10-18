package com.blockauth.blockchain;

import java.io.IOException;
import java.math.BigInteger;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.web3j.abi.FunctionEncoder;
import org.web3j.abi.FunctionReturnDecoder;
import org.web3j.abi.TypeReference;
import org.web3j.abi.datatypes.Address;
import org.web3j.abi.datatypes.Bool;
import org.web3j.abi.datatypes.Function;
import org.web3j.abi.datatypes.Type;
import org.web3j.abi.datatypes.generated.Uint64;
import org.web3j.crypto.Credentials;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.core.DefaultBlockParameterName;
import org.web3j.protocol.core.methods.request.Transaction;
import org.web3j.protocol.core.methods.response.EthCall;
import org.web3j.protocol.core.methods.response.EthEstimateGas;
import org.web3j.protocol.core.methods.response.EthSendTransaction;
import org.web3j.protocol.core.methods.response.TransactionReceipt;
import org.web3j.tx.RawTransactionManager;

import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;
import com.blockauth.config.BlockAuthProperties;

/**
 * The only class that talks to the WalletRegistry contract. Reads are {@code eth_call}s; writes are
 * transactions signed by the operator account, which is the contract's immutable admin.
 */
@Component
public class WalletRegistryClient {

	private static final Logger log = LoggerFactory.getLogger(WalletRegistryClient.class);
	private static final BigInteger MAX_GAS = BigInteger.valueOf(200_000);
	private static final Duration DEFAULT_RECEIPT_TIMEOUT = Duration.ofSeconds(30);
	private static final long RECEIPT_POLL_MILLIS = 250;

	private final Web3j web3j;
	private final Credentials operator;
	private final String contractAddress;
	private final RawTransactionManager transactionManager;
	private final Duration receiptTimeout;

	@Autowired
	public WalletRegistryClient(Web3j web3j, BlockAuthProperties properties) {
		this(web3j, properties, DEFAULT_RECEIPT_TIMEOUT);
	}

	WalletRegistryClient(Web3j web3j, BlockAuthProperties properties, Duration receiptTimeout) {
		BlockAuthProperties.Blockchain config = properties.blockchain();
		this.receiptTimeout = receiptTimeout;
		this.web3j = web3j;
		this.operator = Credentials.create(config.operatorPrivateKey());
		this.contractAddress = config.contractAddress();
		this.transactionManager = new RawTransactionManager(web3j, operator, config.chainId());
	}

	public OnChainWalletStatus getWalletStatus(String wallet) {
		Function function = new Function("getWalletStatus", List.of(new Address(wallet)),
				List.of(new TypeReference<Bool>() {
				}, new TypeReference<Bool>() {
				}, new TypeReference<Uint64>() {
				}));
		List<Type> out = call(function);
		boolean registered = (Boolean) out.get(0).getValue();
		boolean active = (Boolean) out.get(1).getValue();
		long registeredAt = ((BigInteger) out.get(2).getValue()).longValueExact();
		return new OnChainWalletStatus(registered, active, registered ? Instant.ofEpochSecond(registeredAt) : null);
	}

	/** @return the transaction hash */
	public String registerWallet(String wallet) {
		return send("registerWallet", wallet);
	}

	/** @return the transaction hash */
	public String revokeWallet(String wallet) {
		return send("revokeWallet", wallet);
	}

	/** @return the transaction hash */
	public String activateWallet(String wallet) {
		return send("activateWallet", wallet);
	}

	/** Lowercase address of the contract's immutable admin. */
	public String contractAdmin() {
		Function function = new Function("admin", List.of(), List.of(new TypeReference<Address>() {
		}));
		return ((String) call(function).get(0).getValue()).toLowerCase();
	}

	public String operatorAddress() {
		return operator.getAddress().toLowerCase();
	}

	public long chainId() {
		try {
			return web3j.ethChainId().send().getChainId().longValueExact();
		}
		catch (IOException | RuntimeException e) {
			throw unavailable(e);
		}
	}

	public boolean contractHasCode() {
		try {
			String code = web3j.ethGetCode(contractAddress, DefaultBlockParameterName.LATEST).send().getCode();
			return code != null && code.length() > 2;
		}
		catch (IOException | RuntimeException e) {
			throw unavailable(e);
		}
	}

	@SuppressWarnings("rawtypes")
	private List<Type> call(Function function) {
		try {
			EthCall response = web3j.ethCall(Transaction.createEthCallTransaction(operator.getAddress(),
					contractAddress, FunctionEncoder.encode(function)), DefaultBlockParameterName.LATEST).send();
			if (response.hasError()) {
				throw new BlockAuthException(ErrorCode.BLOCKCHAIN_UNAVAILABLE);
			}
			List<Type> out = FunctionReturnDecoder.decode(response.getValue(), function.getOutputParameters());
			if (out.size() != function.getOutputParameters().size()) {
				// Empty result: nothing is deployed at the configured address.
				throw new BlockAuthException(ErrorCode.BLOCKCHAIN_UNAVAILABLE);
			}
			return out;
		}
		catch (IOException | RuntimeException e) {
			throw e instanceof BlockAuthException known ? known : unavailable(e);
		}
	}

	// Serialized so the operator account's transaction nonce never collides.
	private synchronized String send(String functionName, String wallet) {
		String data = FunctionEncoder.encode(new Function(functionName, List.of(new Address(wallet)), List.of()));
		String txHash;
		try {
			EthEstimateGas estimate = web3j
					.ethEstimateGas(Transaction.createEthCallTransaction(operator.getAddress(), contractAddress, data))
					.send();
			if (estimate.hasError()) {
				// The contract would revert (e.g. the wallet is already in the target state).
				throw new BlockAuthException(ErrorCode.BLOCKCHAIN_TX_FAILED);
			}
			BigInteger gasLimit = estimate.getAmountUsed().multiply(BigInteger.valueOf(12)).divide(BigInteger.TEN)
					.min(MAX_GAS);
			BigInteger gasPrice = web3j.ethGasPrice().send().getGasPrice();
			EthSendTransaction sent = transactionManager.sendTransaction(gasPrice, gasLimit, contractAddress, data,
					BigInteger.ZERO);
			if (sent.hasError()) {
				throw new BlockAuthException(ErrorCode.BLOCKCHAIN_TX_FAILED);
			}
			txHash = sent.getTransactionHash();
		}
		catch (IOException | RuntimeException e) {
			throw e instanceof BlockAuthException known ? known : unavailable(e);
		}
		TransactionReceipt receipt = awaitReceipt(txHash);
		if (!receipt.isStatusOK()) {
			log.error("{} transaction {} reverted", functionName, txHash);
			throw new BlockAuthException(ErrorCode.BLOCKCHAIN_TX_FAILED);
		}
		return txHash;
	}

	private TransactionReceipt awaitReceipt(String txHash) {
		long deadline = System.nanoTime() + receiptTimeout.toNanos();
		try {
			while (true) {
				Optional<TransactionReceipt> receipt = web3j.ethGetTransactionReceipt(txHash).send()
						.getTransactionReceipt();
				if (receipt.isPresent()) {
					return receipt.get();
				}
				if (System.nanoTime() >= deadline) {
					log.error("Transaction {} not confirmed within {}", txHash, receiptTimeout);
					throw new BlockAuthException(ErrorCode.BLOCKCHAIN_TIMEOUT);
				}
				Thread.sleep(RECEIPT_POLL_MILLIS);
			}
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new BlockAuthException(ErrorCode.BLOCKCHAIN_TIMEOUT);
		}
		catch (IOException | RuntimeException e) {
			// Web3j reports a non-2xx answer from the node as an unchecked exception.
			throw e instanceof BlockAuthException known ? known : unavailable(e);
		}
	}

	private static BlockAuthException unavailable(Exception cause) {
		log.error("Blockchain RPC call failed: {}", cause.getClass().getSimpleName());
		return new BlockAuthException(ErrorCode.BLOCKCHAIN_UNAVAILABLE);
	}

}
