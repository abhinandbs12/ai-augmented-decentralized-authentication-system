package com.blockauth.blockchain;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import com.blockauth.common.BlockAuthException;
import com.blockauth.config.BlockAuthProperties;

/**
 * Refuses to start against the wrong chain, an address with no contract, or a contract whose admin is
 * not the operator account. An unreachable RPC endpoint is tolerated: chain-dependent requests then
 * fail closed with 503 while DB-backed pages keep working.
 * <p>
 * Runs once all beans exist but before the web server opens its port, so a misconfigured instance
 * never serves a request.
 */
@Component
@Profile("!test")
public class BlockchainStartupVerifier implements SmartInitializingSingleton {

	private static final Logger log = LoggerFactory.getLogger(BlockchainStartupVerifier.class);

	private final WalletRegistryClient registry;
	private final long expectedChainId;

	public BlockchainStartupVerifier(WalletRegistryClient registry, BlockAuthProperties properties) {
		this.registry = registry;
		this.expectedChainId = properties.blockchain().chainId();
	}

	@Override
	public void afterSingletonsInstantiated() {
		verify();
	}

	void verify() {
		long chainId;
		try {
			chainId = registry.chainId();
		}
		catch (BlockAuthException e) {
			log.error("Blockchain RPC endpoint is unreachable; authentication will return 503 until it is available");
			return;
		}
		if (chainId != expectedChainId) {
			throw new IllegalStateException(
					"Blockchain chain ID is " + chainId + " but BLOCKCHAIN_CHAIN_ID is " + expectedChainId);
		}
		if (!registry.contractHasCode()) {
			throw new IllegalStateException("No contract is deployed at CONTRACT_ADDRESS");
		}
		if (!registry.contractAdmin().equals(registry.operatorAddress())) {
			throw new IllegalStateException(
					"WalletRegistry admin does not match the account of BLOCKCHAIN_OPERATOR_PRIVATE_KEY");
		}
		log.info("Blockchain verified: chain {}, WalletRegistry deployed, operator is contract admin", chainId);
	}

}
