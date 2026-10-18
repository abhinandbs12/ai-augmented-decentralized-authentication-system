package com.blockauth.apikey;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import com.blockauth.common.BlockAuthException;

/** A validated request for a new API key. {@link #details()} is the text the confirming signature covers. */
public record ApiKeySpec(String name, Set<ApiScope> scopes, int days) {

	private static final Pattern NAME = Pattern.compile("^[A-Za-z0-9 ._-]{1,60}$");

	public static ApiKeySpec of(String name, List<String> scopes, Integer days, int maxDays) {
		if (name == null || !NAME.matcher(name).matches() || !name.equals(name.strip())) {
			throw BlockAuthException.invalid("name", "must be 1-60 letters, digits, spaces, dots, dashes or underscores");
		}
		if (scopes == null || scopes.isEmpty()) {
			throw BlockAuthException.invalid("scopes", "must name at least one scope");
		}
		Set<ApiScope> parsed = EnumSet.noneOf(ApiScope.class);
		scopes.forEach(s -> parsed.add(ApiScope.of(s)));
		if (days == null || days < 1 || days > maxDays) {
			throw BlockAuthException.invalid("days", "must be between 1 and " + maxDays);
		}
		return new ApiKeySpec(name, parsed, days);
	}

	public String details() {
		// Single quotes: a double quote is not allowed in an EIP-4361 statement.
		return "'" + name + "' (" + scopes.stream().map(ApiScope::value).collect(Collectors.joining(", ")) + ") for "
				+ days + " days";
	}

}
