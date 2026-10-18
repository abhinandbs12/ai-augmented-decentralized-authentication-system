package com.blockauth.common;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Random secrets and their stored form. Secrets are never stored, only their SHA-256 hash. */
public final class Tokens {

	private static final SecureRandom RANDOM = new SecureRandom();

	private Tokens() {
	}

	/** {@code bytes} random bytes, Base64url without padding. */
	public static String random(int bytes) {
		byte[] value = new byte[bytes];
		RANDOM.nextBytes(value);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
	}

	public static byte[] randomBytes(int bytes) {
		byte[] value = new byte[bytes];
		RANDOM.nextBytes(value);
		return value;
	}

	/** Lowercase hex SHA-256 of the UTF-8 text. */
	public static String sha256Hex(String value) {
		try {
			return HexFormat.of()
				.formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

	/**
	 * Lowercase hex HMAC-SHA256 of the UTF-8 text. For short secrets (such as backup codes) whose plain
	 * hash could be reversed by trying every value: without the key a copy of the database is not enough.
	 */
	public static String hmacSha256Hex(byte[] key, String value) {
		try {
			Mac mac = Mac.getInstance("HmacSHA256");
			mac.init(new SecretKeySpec(key, "HmacSHA256"));
			return HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
		}
		catch (GeneralSecurityException e) {
			throw new IllegalStateException(e);
		}
	}

	/** Comparison whose duration does not depend on where the two values differ. */
	public static boolean constantTimeEquals(String a, String b) {
		return a != null && b != null
				&& MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
	}

}
