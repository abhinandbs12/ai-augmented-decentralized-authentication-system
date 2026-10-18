package com.blockauth.config;

import java.net.URI;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

import com.blockauth.common.BlockAuthException;
import com.blockauth.common.WalletAddresses;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

/** Typed {@code blockauth.*} configuration; an invalid or missing value fails startup. */
@ConfigurationProperties("blockauth")
@Validated
public record BlockAuthProperties(
		@NotBlank @Pattern(regexp = "^https?://[^/]+$", message = "must be an origin such as http://localhost:5173") String appOrigin,
		@DefaultValue("120") @Min(60) @Max(600) int challengeTtlSeconds,
		@DefaultValue List<String> adminWallets,
		@NotNull @Valid Blockchain blockchain) {

	private static final java.util.regex.Pattern KEY_SHAPED = java.util.regex.Pattern
			.compile("^(0x)?[0-9a-fA-F]{64}$");

	// Administrator wallets are checked here, not with a constraint annotation: a constraint violation
	// report prints the rejected value, and the likeliest mistake in this setting is a private key
	// pasted where a public address belongs.
	public BlockAuthProperties {
		adminWallets = normalizedAdminWallets(adminWallets);
	}

	/** Lowercase, validated like any other wallet address, without blanks or duplicates. */
	private static List<String> normalizedAdminWallets(List<String> configured) {
		Set<String> wallets = new LinkedHashSet<>();
		for (int i = 0; configured != null && i < configured.size(); i++) {
			String entry = configured.get(i) == null ? "" : configured.get(i).trim();
			if (entry.isEmpty()) {
				continue;
			}
			String position = "BLOCKAUTH_ADMIN_WALLETS entry " + (i + 1) + " ";
			if (KEY_SHAPED.matcher(entry).matches()) {
				throw new IllegalArgumentException(position + "has the length of a private key; "
						+ "list public wallet addresses (0x followed by 40 hexadecimal characters) only");
			}
			try {
				wallets.add(WalletAddresses.normalize(entry, "adminWallets"));
			}
			catch (BlockAuthException e) {
				throw new IllegalArgumentException(position + e.fieldErrors().get(0).message());
			}
		}
		return List.copyOf(wallets);
	}

	public record Blockchain(
			@NotBlank String rpcUrl,
			@Positive long chainId,
			@NotNull @Pattern(regexp = "^0x[0-9a-fA-F]{40}$") String contractAddress,
			String operatorPrivateKey) {

		private static final java.util.regex.Pattern PRIVATE_KEY = java.util.regex.Pattern
				.compile("^(0x)?[0-9a-fA-F]{64}$");

		// The key is checked here, not with a constraint annotation: a constraint violation report
		// prints the rejected value, and a mistyped key must never reach the log.
		public Blockchain {
			if (operatorPrivateKey == null || !PRIVATE_KEY.matcher(operatorPrivateKey).matches()) {
				throw new IllegalArgumentException(
						"BLOCKCHAIN_OPERATOR_PRIVATE_KEY must be 64 hexadecimal characters, optionally prefixed with 0x");
			}
		}

		@Override
		public String toString() {
			return "Blockchain[rpcUrl=" + rpcUrl + ", chainId=" + chainId + ", contractAddress=" + contractAddress + "]";
		}
	}

	/** host[:port] of the SPA origin, embedded in every challenge. */
	public String domain() {
		return URI.create(appOrigin).getAuthority();
	}

	public Set<String> adminWalletSet() {
		return Set.copyOf(adminWallets);
	}

}
