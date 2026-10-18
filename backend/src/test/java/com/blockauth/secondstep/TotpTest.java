package com.blockauth.secondstep;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Instant;

import org.junit.jupiter.api.Test;

class TotpTest {

	// RFC 6238 Appendix B, HMAC-SHA1 seed.
	private static final byte[] SEED = "12345678901234567890".getBytes(StandardCharsets.US_ASCII);

	@Test
	void matchesTheRfc6238TestVectors() {
		assertThat(Totp.code(SEED, Totp.step(Instant.ofEpochSecond(59L)), 8)).isEqualTo("94287082");
		assertThat(Totp.code(SEED, Totp.step(Instant.ofEpochSecond(1111111109L)), 8)).isEqualTo("07081804");
		assertThat(Totp.code(SEED, Totp.step(Instant.ofEpochSecond(1111111111L)), 8)).isEqualTo("14050471");
		assertThat(Totp.code(SEED, Totp.step(Instant.ofEpochSecond(1234567890L)), 8)).isEqualTo("89005924");
		assertThat(Totp.code(SEED, Totp.step(Instant.ofEpochSecond(2000000000L)), 8)).isEqualTo("69279037");
		assertThat(Totp.code(SEED, Totp.step(Instant.ofEpochSecond(20000000000L)), 8)).isEqualTo("65353130");
		// Six digits, as authenticator apps show them, are the last six.
		assertThat(Totp.code(SEED, Totp.step(Instant.ofEpochSecond(59L)))).isEqualTo("287082");
	}

	@Test
	void acceptsOneStepOfClockDriftEitherWayAndNoMore() {
		Instant now = Instant.ofEpochSecond(1234567890L);
		long step = Totp.step(now);

		assertThat(Totp.matchingStep(SEED, Totp.code(SEED, step - 1), now, -1)).isEqualTo(step - 1);
		assertThat(Totp.matchingStep(SEED, Totp.code(SEED, step + 1), now, -1)).isEqualTo(step + 1);
		assertThat(Totp.matchingStep(SEED, Totp.code(SEED, step - 2), now, -1)).isEqualTo(-1);
		assertThat(Totp.matchingStep(SEED, Totp.code(SEED, step + 2), now, -1)).isEqualTo(-1);
	}

	@Test
	void aCodeIsNotAcceptedForAStepAlreadyUsed() {
		Instant now = Instant.ofEpochSecond(1234567890L);
		long step = Totp.step(now);
		String code = Totp.code(SEED, step);

		assertThat(Totp.matchingStep(SEED, code, now, step - 1)).isEqualTo(step);
		assertThat(Totp.matchingStep(SEED, code, now, step)).isEqualTo(-1);
	}

	@Test
	void encodesBase32LikeRfc4648WithoutPadding() {
		assertThat(Totp.base32("f".getBytes(StandardCharsets.US_ASCII))).isEqualTo("MY");
		assertThat(Totp.base32("fo".getBytes(StandardCharsets.US_ASCII))).isEqualTo("MZXQ");
		assertThat(Totp.base32("foo".getBytes(StandardCharsets.US_ASCII))).isEqualTo("MZXW6");
		assertThat(Totp.base32("foob".getBytes(StandardCharsets.US_ASCII))).isEqualTo("MZXW6YQ");
		assertThat(Totp.base32("fooba".getBytes(StandardCharsets.US_ASCII))).isEqualTo("MZXW6YTB");
		assertThat(Totp.base32("foobar".getBytes(StandardCharsets.US_ASCII))).isEqualTo("MZXW6YTBOI");
	}

	@Test
	void newSecretsAreTwentyRandomBytes() {
		assertThat(Totp.newSecret()).hasSize(20).isNotEqualTo(Totp.newSecret());
	}

}
