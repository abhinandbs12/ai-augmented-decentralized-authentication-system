package com.blockauth.common;

import java.util.Locale;
import java.util.regex.Pattern;

import org.web3j.crypto.Keys;

/** Validation and normalization of Ethereum wallet addresses (stored lowercase, returned EIP-55 checksummed). */
public final class WalletAddresses {

	/** Syntax of an address; shared with the Bean Validation constraints on request bodies. */
	public static final String FORMAT = "^0x[0-9a-fA-F]{40}$";
	public static final String FORMAT_MESSAGE = "must be a 0x-prefixed 40-hex-character address";

	private static final Pattern FORMAT_PATTERN = Pattern.compile(FORMAT);
	private static final String ZERO = "0x" + "0".repeat(40);

	private WalletAddresses() {
	}

	/** Returns the lowercase address, or throws VALIDATION_FAILED naming {@code field}. */
	public static String normalize(String raw, String field) {
		if (raw == null || !FORMAT_PATTERN.matcher(raw).matches()) {
			throw BlockAuthException.invalid(field, FORMAT_MESSAGE);
		}
		String hex = raw.substring(2);
		String lower = raw.toLowerCase(Locale.ROOT);
		// All-lowercase and all-uppercase forms carry no checksum; a mixed-case form must be a valid one.
		boolean mixedCase = !hex.equals(hex.toLowerCase(Locale.ROOT)) && !hex.equals(hex.toUpperCase(Locale.ROOT));
		if (mixedCase && !Keys.toChecksumAddress(lower).equals(raw)) {
			throw BlockAuthException.invalid(field, "has an invalid EIP-55 checksum");
		}
		if (lower.equals(ZERO)) {
			throw BlockAuthException.invalid(field, "must not be the zero address");
		}
		return lower;
	}

	/** Optional query filter: null/blank stays null, otherwise validated like {@link #normalize}. */
	public static String normalizeOptional(String raw, String field) {
		return raw == null || raw.isBlank() ? null : normalize(raw, field);
	}

	public static String checksum(String lower) {
		return lower == null ? null : Keys.toChecksumAddress(lower);
	}

}
