package com.blockauth.blockchain;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.blockauth.common.WalletAddresses;
import com.blockauth.user.UserService;

/** ADMIN-only lookups of any wallet's on-chain identity status. */
@RestController
@RequestMapping("/api/blockchain")
public class BlockchainController {

	public record VerifyResponse(String walletAddress, boolean valid, String reason) {
	}

	private final UserService users;

	public BlockchainController(UserService users) {
		this.users = users;
	}

	@GetMapping("/wallet/{address}")
	WalletStatusResponse wallet(@PathVariable String address) {
		String wallet = WalletAddresses.normalize(address, "address");
		return WalletStatusResponse.of(wallet, users.chainStatus(wallet));
	}

	@GetMapping("/verify/{address}")
	VerifyResponse verify(@PathVariable String address) {
		String wallet = WalletAddresses.normalize(address, "address");
		OnChainWalletStatus status = users.chainStatus(wallet);
		return new VerifyResponse(WalletAddresses.checksum(wallet), status.valid(), status.label());
	}

}
