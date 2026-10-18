package com.blockauth.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.Base64;

import org.junit.jupiter.api.Test;

class SecuritySettingsTest {

	private static final SecuritySettings.Trust TRUST = new SecuritySettings.Trust(90, 50, 30, 20, 35, 25, 3, 35, 3);
	private static final String KEY = Base64.getEncoder().encodeToString(new byte[32]);

	private static SecuritySettings with(String key, Duration delay) {
		return new SecuritySettings(key, 30, delay, 90, TRUST);
	}

	@Test
	void acceptsA32ByteBase64Key() {
		assertThat(with(KEY, Duration.ofMinutes(10)).secondStepKeyBytes()).hasSize(32);
	}

	@Test
	void aWrongKeyFailsStartupWithoutEchoingIt() {
		String wrong = "not-base64-SENTINEL";
		String shortKey = Base64.getEncoder().encodeToString(new byte[16]);

		assertThatThrownBy(() -> with(wrong, Duration.ofMinutes(10))).hasMessageNotContaining("SENTINEL")
			.hasMessageContaining("SECOND_STEP_ENCRYPTION_KEY");
		assertThatThrownBy(() -> with(shortKey, Duration.ofMinutes(10))).hasMessageNotContaining(shortKey);
		assertThatThrownBy(() -> with(null, Duration.ofMinutes(10))).isInstanceOf(IllegalArgumentException.class);
		assertThat(with(KEY, Duration.ofMinutes(10)).toString()).doesNotContain(KEY);
	}

	@Test
	void theDelayMustBeBetweenOneSecondAndSevenDays() {
		assertThatThrownBy(() -> with(KEY, Duration.ZERO)).hasMessageContaining("ADMIN_ACTION_DELAY");
		assertThatThrownBy(() -> with(KEY, Duration.ofDays(8))).hasMessageContaining("ADMIN_ACTION_DELAY");
		assertThat(with(KEY, Duration.ofSeconds(1)).adminActionDelay()).hasSeconds(1);
	}

	@Test
	void theSecondStepThresholdMustBeBelowTheAllowThreshold() {
		assertThatThrownBy(() -> new SecuritySettings.Trust(50, 50, 30, 20, 35, 25, 3, 35, 3))
			.isInstanceOf(IllegalArgumentException.class);
	}

}
