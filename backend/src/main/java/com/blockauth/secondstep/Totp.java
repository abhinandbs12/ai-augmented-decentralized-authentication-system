package com.blockauth.secondstep;

import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.time.Instant;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import com.blockauth.common.Tokens;

/**
 * Time-based one-time codes (RFC 6238 with HMAC-SHA1, 30-second steps, 6 digits), the scheme every
 * authenticator app supports.
 */
final class Totp {

	static final int SECRET_BYTES = 20;
	static final long PERIOD_SECONDS = 30;
	private static final int DIGITS = 6;
	private static final char[] BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".toCharArray();

	private Totp() {
	}

	static byte[] newSecret() {
		return Tokens.randomBytes(SECRET_BYTES);
	}

	static long step(Instant time) {
		return Math.floorDiv(time.getEpochSecond(), PERIOD_SECONDS);
	}

	static String code(byte[] secret, long step) {
		return code(secret, step, DIGITS);
	}

	/** RFC 4226 dynamic truncation of HMAC-SHA1(secret, step). */
	static String code(byte[] secret, long step, int digits) {
		try {
			Mac mac = Mac.getInstance("HmacSHA1");
			mac.init(new SecretKeySpec(secret, "HmacSHA1"));
			byte[] hash = mac.doFinal(ByteBuffer.allocate(8).putLong(step).array());
			int offset = hash[hash.length - 1] & 0x0f;
			int binary = ((hash[offset] & 0x7f) << 24) | ((hash[offset + 1] & 0xff) << 16)
					| ((hash[offset + 2] & 0xff) << 8) | (hash[offset + 3] & 0xff);
			int modulus = (int) Math.pow(10, digits);
			return String.format("%0" + digits + "d", binary % modulus);
		}
		catch (GeneralSecurityException e) {
			throw new IllegalStateException(e);
		}
	}

	/**
	 * The step whose code equals {@code code}, among the current step and one either side (clock drift
	 * between phone and server), skipping steps at or before {@code lastUsedStep} so that a code works
	 * only once. -1 when none matches.
	 */
	static long matchingStep(byte[] secret, String code, Instant now, long lastUsedStep) {
		long current = step(now);
		for (long step = current - 1; step <= current + 1; step++) {
			if (step > lastUsedStep && Tokens.constantTimeEquals(code(secret, step), code)) {
				return step;
			}
		}
		return -1;
	}

	/** RFC 4648 Base32 without padding, the form authenticator apps expect. */
	static String base32(byte[] data) {
		StringBuilder out = new StringBuilder();
		int buffer = 0;
		int bits = 0;
		for (byte b : data) {
			buffer = (buffer << 8) | (b & 0xff);
			bits += 8;
			while (bits >= 5) {
				out.append(BASE32[(buffer >> (bits - 5)) & 31]);
				bits -= 5;
			}
		}
		if (bits > 0) {
			out.append(BASE32[(buffer << (5 - bits)) & 31]);
		}
		return out.toString();
	}

}
