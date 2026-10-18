package com.blockauth.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import com.blockauth.config.BlockAuthProperties.Blockchain;

class BlockAuthPropertiesTest {

	private static final String CONTRACT = "0x0000000000000000000000000000000000000001";
	private static final String VALID_KEY = "ab".repeat(32);

	@Test
	void acceptsAKeyWithOrWithoutThe0xPrefix() {
		assertThat(new Blockchain("http://127.0.0.1:8545", 31337, CONTRACT, VALID_KEY)).isNotNull();
		assertThat(new Blockchain("http://127.0.0.1:8545", 31337, CONTRACT, "0x" + VALID_KEY)).isNotNull();
	}

	@ParameterizedTest
	@NullSource
	@ValueSource(strings = { "", "0x", "0xdeadbeefcafe1234567890",
			// a real-looking key with one character missing, and one with a non-hex character
			"0xabababababababababababababababababababababababababababababababa",
			"0xabababababababababababababababababababababababababababababababag" })
	void rejectsAMalformedKeyWithoutEchoingIt(String key) {
		assertThatThrownBy(() -> new Blockchain("http://127.0.0.1:8545", 31337, CONTRACT, key))
				.isInstanceOf(IllegalArgumentException.class).satisfies(e -> {
					assertThat(e.getMessage()).contains("BLOCKCHAIN_OPERATOR_PRIVATE_KEY");
					if (key != null && key.length() > 2) {
						assertThat(e.getMessage()).doesNotContain(key).doesNotContain(key.substring(2));
					}
				});
	}

	@Test
	void theKeyNeverAppearsInToString() {
		BlockAuthProperties properties = new BlockAuthProperties("http://localhost:5173", 120, List.of(),
				new Blockchain("http://127.0.0.1:8545", 31337, CONTRACT, VALID_KEY));

		assertThat(properties.toString()).doesNotContain(VALID_KEY).contains(CONTRACT);
	}

	@Test
	void derivesTheChallengeDomainFromTheOrigin() {
		Blockchain chain = new Blockchain("http://127.0.0.1:8545", 31337, CONTRACT, VALID_KEY);

		assertThat(new BlockAuthProperties("http://localhost:5173", 120, List.of(), chain).domain())
				.isEqualTo("localhost:5173");
		assertThat(new BlockAuthProperties("https://auth.example.org", 120, List.of(), chain).domain())
				.isEqualTo("auth.example.org");
	}

	@Test
	void adminWalletsAreMatchedInLowercase() {
		BlockAuthProperties properties = new BlockAuthProperties("http://localhost:5173", 120,
				List.of("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"),
				new Blockchain("http://127.0.0.1:8545", 31337, CONTRACT, VALID_KEY));

		assertThat(properties.adminWalletSet()).containsExactly("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed");
	}

}
