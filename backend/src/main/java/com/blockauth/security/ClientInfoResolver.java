package com.blockauth.security;

import org.springframework.http.HttpHeaders;

import com.blockauth.audit.ClientInfo;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Identifies the client of a request for rate limiting and auditing. The IP is the connection's remote
 * address: X-Forwarded-For is never read here, so a caller cannot choose its own identity. Behind a
 * trusted reverse proxy (prod profile) the container itself rewrites the remote address.
 */
public final class ClientInfoResolver {

	private ClientInfoResolver() {
	}

	public static ClientInfo resolve(HttpServletRequest request) {
		return new ClientInfo(request.getRemoteAddr(), request.getHeader(HttpHeaders.USER_AGENT));
	}

}
