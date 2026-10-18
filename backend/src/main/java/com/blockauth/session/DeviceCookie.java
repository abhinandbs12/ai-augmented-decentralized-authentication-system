package com.blockauth.session;

import java.time.Duration;
import java.util.Optional;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * The device cookie: a random token the server issues at the first sign-in on a browser. HttpOnly, so
 * page scripts cannot read it. Having it proves nothing on its own; it only lets the server recognise a
 * browser it has seen before.
 */
@Component
public class DeviceCookie {

	static final String NAME = "BLOCKAUTH_DEVICE";
	private static final Pattern TOKEN = Pattern.compile("^[A-Za-z0-9_-]{43}$");
	private static final Duration LIFETIME = Duration.ofDays(400);

	private final boolean secure;

	public DeviceCookie(@Value("${server.servlet.session.cookie.secure:true}") boolean secure) {
		this.secure = secure;
	}

	/** The token, if the request carries one in the expected form. */
	public Optional<String> read(HttpServletRequest request) {
		Cookie[] cookies = request.getCookies();
		if (cookies == null) {
			return Optional.empty();
		}
		for (Cookie cookie : cookies) {
			if (NAME.equals(cookie.getName()) && cookie.getValue() != null
					&& TOKEN.matcher(cookie.getValue()).matches()) {
				return Optional.of(cookie.getValue());
			}
		}
		return Optional.empty();
	}

	public void write(HttpServletResponse response, String token) {
		response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from(NAME, token).path("/").maxAge(LIFETIME)
			.httpOnly(true).secure(secure).sameSite("Strict").build().toString());
	}

}
