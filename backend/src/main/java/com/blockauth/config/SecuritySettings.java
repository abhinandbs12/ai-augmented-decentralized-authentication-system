package com.blockauth.config;

import java.time.Duration;
import java.util.Base64;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/**
 * Settings of the account-security features: second step, trusted devices, trust score, delayed
 * administrator actions and API keys. An invalid or missing value fails startup.
 */
@ConfigurationProperties("blockauth.security")
@Validated
public record SecuritySettings(
		String secondStepKey,
		@DefaultValue("30") @Min(1) @Max(365) int trustedDeviceDays,
		@DefaultValue("10m") Duration adminActionDelay,
		@DefaultValue("90") @Min(1) @Max(365) int apiKeyMaxDays,
		@DefaultValue @Valid Trust trust) {

	private static final Duration MIN_DELAY = Duration.ofSeconds(1);
	private static final Duration MAX_DELAY = Duration.ofDays(7);

	// Checked here, not with a constraint annotation: a constraint violation report prints the rejected
	// value, and this one is a secret.
	public SecuritySettings {
		byte[] key = null;
		try {
			key = secondStepKey == null ? null : Base64.getDecoder().decode(secondStepKey.trim());
		}
		catch (IllegalArgumentException e) {
			// reported below without the value
		}
		if (key == null || key.length != 32) {
			throw new IllegalArgumentException(
					"SECOND_STEP_ENCRYPTION_KEY must be 32 random bytes, Base64-encoded (44 characters)");
		}
		if (adminActionDelay == null || adminActionDelay.compareTo(MIN_DELAY) < 0
				|| adminActionDelay.compareTo(MAX_DELAY) > 0) {
			throw new IllegalArgumentException("ADMIN_ACTION_DELAY must be between 1 second and 7 days");
		}
	}

	public byte[] secondStepKeyBytes() {
		return Base64.getDecoder().decode(secondStepKey.trim());
	}

	public Duration trustedDevicePeriod() {
		return Duration.ofDays(trustedDeviceDays);
	}

	@Override
	public String toString() {
		return "SecuritySettings[trustedDeviceDays=" + trustedDeviceDays + ", adminActionDelay=" + adminActionDelay
				+ ", apiKeyMaxDays=" + apiKeyMaxDays + ", trust=" + trust + "]";
	}

	/**
	 * Trust score policy. Every sign-in starts at 100 and loses the penalty of each rule that applies.
	 * At or above {@code allowAt} the wallet signature is enough; at or above {@code secondStepAt} a
	 * second step is asked for when one is set up; below that a second step is required and a wallet
	 * without one is refused.
	 */
	public record Trust(
			@DefaultValue("90") @Min(1) @Max(100) int allowAt,
			@DefaultValue("50") @Min(0) @Max(100) int secondStepAt,
			@DefaultValue("30") @Min(0) @Max(100) int newDevicePenalty,
			@DefaultValue("20") @Min(0) @Max(100) int newNetworkPenalty,
			@DefaultValue("35") @Min(0) @Max(100) int flaggedWalletPenalty,
			@DefaultValue("25") @Min(0) @Max(100) int repeatedFailuresPenalty,
			@DefaultValue("3") @Min(1) @Max(100) int repeatedFailuresThreshold,
			@DefaultValue("35") @Min(0) @Max(100) int linkedToFlaggedPenalty,
			@DefaultValue("3") @Min(1) @Max(5) int graphDepth) {

		public Trust {
			if (secondStepAt >= allowAt) {
				throw new IllegalArgumentException("blockauth.security.trust: second-step-at must be below allow-at");
			}
		}

	}

}
