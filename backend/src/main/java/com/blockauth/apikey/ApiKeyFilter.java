package com.blockauth.apikey;

import java.io.IOException;
import java.time.Duration;

import org.springframework.dao.DataAccessException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.TransactionException;
import org.springframework.web.filter.OncePerRequestFilter;

import com.blockauth.audit.AttackType;
import com.blockauth.audit.AuditService;
import com.blockauth.common.ApiErrorWriter;
import com.blockauth.common.ErrorCode;
import com.blockauth.security.ClientInfoResolver;
import com.blockauth.security.InMemoryRateLimiter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Authenticates a request that carries an X-API-Key header, for that request only: nothing is stored
 * in a session. The key's scopes become the request's only authorities, so the authorization rules
 * decide what it may read; a key never holds a role.
 */
public class ApiKeyFilter extends OncePerRequestFilter {

	public static final String HEADER = "X-API-Key";

	private final ApiKeyService keys;
	private final AuditService audit;
	private final InMemoryRateLimiter limiter;
	private final ApiErrorWriter errors;

	public ApiKeyFilter(ApiKeyService keys, AuditService audit, InMemoryRateLimiter limiter, ApiErrorWriter errors) {
		this.keys = keys;
		this.audit = audit;
		this.limiter = limiter;
		this.errors = errors;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String token = request.getHeader(HEADER);
		if (token == null) {
			chain.doFilter(request, response);
			return;
		}
		ApiKeyService.Authenticated authenticated;
		try {
			authenticated = keys.authenticate(token).orElse(null);
		}
		catch (DataAccessException | TransactionException e) {
			errors.write(request, response, ErrorCode.DATABASE_UNAVAILABLE);
			return;
		}
		if (authenticated == null) {
			String ip = ClientInfoResolver.resolve(request).ip();
			// Audited once a minute per address, so a flood of bad keys cannot flood the database.
			if (limiter.acquire("invalid-api-key", ip, 1, Duration.ofMinutes(1)).allowed()) {
				audit.recordSecurityEvent(AttackType.INVALID_API_KEY, null, null, ip);
			}
			errors.write(request, response, ErrorCode.INVALID_API_KEY);
			return;
		}
		SecurityContext context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(authenticated.principal(), null,
				authenticated.authorities()));
		SecurityContextHolder.setContext(context);
		chain.doFilter(request, response);
	}

}
