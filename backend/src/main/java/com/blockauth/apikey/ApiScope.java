package com.blockauth.apikey;

import com.blockauth.common.BlockAuthException;

/** What an API key may read. There is no scope that changes anything. */
public enum ApiScope {

	USERS_READ("users:read"),
	AUDIT_READ("audit:read"),
	WALLET_STATUS_READ("wallet-status:read");

	private final String value;

	ApiScope(String value) {
		this.value = value;
	}

	public String value() {
		return value;
	}

	/** The Spring Security authority a key with this scope holds. */
	public String authority() {
		return "SCOPE_" + value;
	}

	public static ApiScope of(String value) {
		for (ApiScope scope : values()) {
			if (scope.value.equals(value)) {
				return scope;
			}
		}
		throw BlockAuthException.invalid("scopes", "must contain only users:read, audit:read, wallet-status:read");
	}

}
