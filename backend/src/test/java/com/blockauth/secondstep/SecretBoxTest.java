package com.blockauth.secondstep;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Base64;

import org.junit.jupiter.api.Test;

import com.blockauth.common.Tokens;

class SecretBoxTest {

	private final SecretBox box = new SecretBox(Tokens.randomBytes(32));

	@Test
	void roundTripsAndNeverRepeatsACiphertext() {
		byte[] secret = Tokens.randomBytes(20);

		String first = box.seal(secret);
		String second = box.seal(secret);

		assertThat(box.open(first)).isEqualTo(secret);
		assertThat(first).isNotEqualTo(second);
		assertThat(first).hasSizeLessThanOrEqualTo(120);
	}

	@Test
	void anAlteredValueIsRejected() {
		byte[] sealed = Base64.getDecoder().decode(box.seal(Tokens.randomBytes(20)));
		sealed[sealed.length - 1] ^= 1;

		assertThatThrownBy(() -> box.open(Base64.getEncoder().encodeToString(sealed)))
			.isInstanceOf(IllegalStateException.class);
	}

	@Test
	void anotherKeyCannotOpenIt() {
		String sealed = box.seal(Tokens.randomBytes(20));

		assertThatThrownBy(() -> new SecretBox(Tokens.randomBytes(32)).open(sealed))
			.isInstanceOf(IllegalStateException.class);
	}

}
