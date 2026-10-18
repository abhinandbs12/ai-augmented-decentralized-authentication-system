package com.blockauth.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

class TokensTest {

	@Test
	void hmacMatchesTheRfc4231TestVector() {
		// RFC 4231, test case 2.
		assertThat(Tokens.hmacSha256Hex("Jefe".getBytes(StandardCharsets.US_ASCII), "what do ya want for nothing?"))
			.isEqualTo("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
	}

	@Test
	void theKeyChangesTheHash() {
		assertThat(Tokens.hmacSha256Hex(new byte[] { 1 }, "ABCD2345"))
			.isNotEqualTo(Tokens.hmacSha256Hex(new byte[] { 2 }, "ABCD2345"))
			.isNotEqualTo(Tokens.sha256Hex("ABCD2345"))
			.matches("^[0-9a-f]{64}$");
	}

	@Test
	void randomTokensAreUrlSafeAndDistinct() {
		String a = Tokens.random(32);
		assertThat(a).matches("^[A-Za-z0-9_-]{43}$").isNotEqualTo(Tokens.random(32));
	}

}
