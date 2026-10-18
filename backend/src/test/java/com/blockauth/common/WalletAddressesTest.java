package com.blockauth.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

class WalletAddressesTest {

	private static final String CHECKSUMMED = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
	private static final String LOWER = CHECKSUMMED.toLowerCase();

	@Test
	void normalizesLowerUpperAndChecksummedFormsToOneIdentity() {
		assertThat(WalletAddresses.normalize(LOWER, "walletAddress")).isEqualTo(LOWER);
		assertThat(WalletAddresses.normalize("0x" + LOWER.substring(2).toUpperCase(), "walletAddress"))
				.isEqualTo(LOWER);
		assertThat(WalletAddresses.normalize(CHECKSUMMED, "walletAddress")).isEqualTo(LOWER);
		assertThat(WalletAddresses.checksum(LOWER)).isEqualTo(CHECKSUMMED);
	}

	@ParameterizedTest
	@NullSource
	@ValueSource(strings = { "", "0x", "5aaeb6053f3e94c9b9a09f33669435e7ef1beaed",
			"0x5aaeb6053f3e94c9b9a09f33669435e7ef1beae", "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaedd",
			"0xzzaeb6053f3e94c9b9a09f33669435e7ef1beaed", "0X5aaeb6053f3e94c9b9a09f33669435e7ef1beaed",
			// one letter's case flipped: a broken EIP-55 checksum
			"0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
			"0x0000000000000000000000000000000000000000", "' OR '1'='1",
			"0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed;DROP TABLE users;--" })
	void rejectsMalformedAddresses(String input) {
		assertThatThrownBy(() -> WalletAddresses.normalize(input, "walletAddress"))
				.isInstanceOf(BlockAuthException.class).satisfies(e -> {
					BlockAuthException ex = (BlockAuthException) e;
					assertThat(ex.code()).isEqualTo(ErrorCode.VALIDATION_FAILED);
					assertThat(ex.fieldErrors()).singleElement()
							.satisfies(f -> assertThat(f.field()).isEqualTo("walletAddress"));
				});
	}

	@Test
	void optionalFilterTreatsBlankAsAbsent() {
		assertThat(WalletAddresses.normalizeOptional(null, "walletAddress")).isNull();
		assertThat(WalletAddresses.normalizeOptional(" ", "walletAddress")).isNull();
		assertThat(WalletAddresses.normalizeOptional(CHECKSUMMED, "walletAddress")).isEqualTo(LOWER);
	}

}
