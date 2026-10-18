package com.blockauth.security;

import java.io.IOException;
import java.time.Duration;
import java.util.Set;

import org.springframework.web.filter.OncePerRequestFilter;

import com.blockauth.audit.AttackType;
import com.blockauth.audit.AuditService;
import com.blockauth.audit.AuthEventType;
import com.blockauth.audit.ClientInfo;
import com.blockauth.common.ApiErrorWriter;
import com.blockauth.common.ErrorCode;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Per-IP limits: 10/min on the challenge endpoints, 10/min on register/verify/second step, 120/min on the rest of
 * the API, plus the temporary block after repeated authentication failures.
 */
public class RateLimitFilter extends OncePerRequestFilter {

	private static final Duration WINDOW = Duration.ofMinutes(1);
	private static final int AUTH_REQUESTS_PER_WINDOW = 10;
	private static final int API_REQUESTS_PER_WINDOW = 120;
	private static final Set<String> CHALLENGE_PATHS = Set.of("/api/auth/register/challenge", "/api/auth/challenge");
	private static final Set<String> VERIFY_PATHS = Set.of("/api/auth/register", "/api/auth/verify",
			"/api/auth/second-step");

	private final InMemoryRateLimiter limiter;
	private final AuditService audit;
	private final ApiErrorWriter errors;

	public RateLimitFilter(InMemoryRateLimiter limiter, AuditService audit, ApiErrorWriter errors) {
		this.limiter = limiter;
		this.audit = audit;
		this.errors = errors;
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		return !routedPath(request).startsWith("/api/");
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String path = routedPath(request);
		ClientInfo client = ClientInfoResolver.resolve(request);
		boolean challenge = CHALLENGE_PATHS.contains(path);
		boolean authEndpoint = "POST".equals(request.getMethod()) && (challenge || VERIFY_PATHS.contains(path));

		if (authEndpoint) {
			long blockedSeconds = limiter.blockedSeconds(client.ip());
			if (blockedSeconds > 0) {
				errors.write(request, response, ErrorCode.IP_TEMPORARILY_BLOCKED, blockedSeconds);
				return;
			}
		}

		InMemoryRateLimiter.Decision decision = !authEndpoint
				? limiter.acquire("api-ip", client.ip(), API_REQUESTS_PER_WINDOW, WINDOW)
				: limiter.acquire(challenge ? "challenge-ip" : "verify-ip", client.ip(), AUTH_REQUESTS_PER_WINDOW,
						WINDOW);
		if (!decision.allowed()) {
			// Audited on the first rejection of a window only, so a flood cannot also flood the database.
			if (decision.firstRejection()) {
				if (authEndpoint) {
					AuthEventType type = path.contains("/register") ? AuthEventType.REGISTRATION : AuthEventType.LOGIN;
					audit.recordFailure(type, null, ErrorCode.RATE_LIMITED, client);
				}
				else {
					audit.recordSecurityEvent(AttackType.RATE_LIMIT_EXCEEDED, null, null, client.ip());
				}
			}
			errors.write(request, response, ErrorCode.RATE_LIMITED, decision.retryAfterSeconds());
			return;
		}
		chain.doFilter(request, response);
	}

	/**
	 * The path as the dispatcher will route it: decoded and normalized by the container. Matching on
	 * the raw request URI would let "/api/auth/%76erify" escape the authentication limits.
	 */
	static String routedPath(HttpServletRequest request) {
		String pathInfo = request.getPathInfo();
		return pathInfo == null ? request.getServletPath() : request.getServletPath() + pathInfo;
	}

}
