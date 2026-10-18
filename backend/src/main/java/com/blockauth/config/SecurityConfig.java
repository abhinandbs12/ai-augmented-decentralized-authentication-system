package com.blockauth.config;

import java.time.Clock;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.csrf.CsrfTokenRequestHandler;
import org.springframework.security.web.firewall.RequestRejectedHandler;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;

import com.blockauth.apikey.ApiKeyFilter;
import com.blockauth.apikey.ApiKeyService;
import com.blockauth.apikey.ApiScope;
import com.blockauth.audit.AuditService;
import com.blockauth.common.ApiErrorWriter;
import com.blockauth.common.ErrorCode;
import com.blockauth.security.ActiveUserFilter;
import com.blockauth.security.InMemoryRateLimiter;
import com.blockauth.security.OriginCheckFilter;
import com.blockauth.security.RateLimitFilter;
import com.blockauth.security.RestAccessDeniedHandler;
import com.blockauth.security.RestAuthenticationEntryPoint;
import com.blockauth.session.UserSessionRepository;

import jakarta.servlet.http.HttpServletRequest;

@Configuration
public class SecurityConfig {

	/** The authenticated principal lives in the server-side session, nowhere else. */
	@Bean
	SecurityContextRepository securityContextRepository() {
		return new HttpSessionSecurityContextRepository();
	}

	/** Readable by the SPA (not HttpOnly) so it can echo the token in X-XSRF-TOKEN. */
	@Bean
	CookieCsrfTokenRepository csrfTokenRepository(
			@Value("${server.servlet.session.cookie.secure:true}") boolean secureCookies) {
		CookieCsrfTokenRepository repository = CookieCsrfTokenRepository.withHttpOnlyFalse();
		repository.setCookieCustomizer(cookie -> cookie.sameSite("Strict").secure(secureCookies).path("/"));
		return repository;
	}

	/**
	 * URLs the HTTP firewall refuses outright (";", encoded slashes, traversal). Answering here keeps
	 * the standard error body; otherwise the container error dispatch would hit deny-by-default.
	 */
	@Bean
	RequestRejectedHandler requestRejectedHandler(ApiErrorWriter errors) {
		return (request, response, e) -> errors.write(request, response, ErrorCode.VALIDATION_FAILED);
	}

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http, SecurityContextRepository securityContextRepository,
			CookieCsrfTokenRepository csrfTokenRepository, RestAuthenticationEntryPoint authenticationEntryPoint,
			RestAccessDeniedHandler accessDeniedHandler, ApiErrorWriter errors, AuditService audit,
			InMemoryRateLimiter rateLimiter, UserSessionRepository sessions, ApiKeyService apiKeys,
			BlockAuthProperties properties, Clock clock) throws Exception {
		http
			.authorizeHttpRequests(auth -> auth
				.requestMatchers(HttpMethod.GET, "/api/auth/csrf", "/actuator/health").permitAll()
				.requestMatchers(HttpMethod.POST, "/api/auth/step-up").hasAnyRole("USER", "ADMIN")
				.requestMatchers(HttpMethod.POST, "/api/auth/register/challenge", "/api/auth/register",
						"/api/auth/challenge", "/api/auth/verify", "/api/auth/second-step", "/api/auth/logout").permitAll()
				.requestMatchers("/api/users/**").hasAnyRole("USER", "ADMIN")
				// Read-only endpoints an API key may reach, each with its own scope. Keys hold no role, so
				// every other endpoint stays closed to them.
				.requestMatchers(HttpMethod.GET, "/api/admin/users")
					.hasAnyAuthority("ROLE_ADMIN", ApiScope.USERS_READ.authority())
				.requestMatchers(HttpMethod.GET, "/api/admin/authentication-events", "/api/admin/security-events",
						"/api/admin/statistics", "/api/admin/login-assessments")
					.hasAnyAuthority("ROLE_ADMIN", ApiScope.AUDIT_READ.authority())
				.requestMatchers(HttpMethod.GET, "/api/blockchain/wallet/*", "/api/blockchain/verify/*")
					.hasAnyAuthority("ROLE_ADMIN", ApiScope.WALLET_STATUS_READ.authority())
				.requestMatchers("/api/blockchain/**", "/api/admin/**").hasRole("ADMIN")
				.anyRequest().denyAll())
			.securityContext(context -> context.securityContextRepository(securityContextRepository))
			.csrf(csrf -> csrf.csrfTokenRepository(csrfTokenRepository)
				.csrfTokenRequestHandler(headerOnlyCsrfTokenHandler()))
			.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
				.sessionFixation(fixation -> fixation.changeSessionId()))
			// No saved requests: a 401 must never create a session for an anonymous caller.
			.requestCache(cache -> cache.disable())
			.formLogin(form -> form.disable())
			.httpBasic(basic -> basic.disable())
			.logout(logout -> logout.disable())
			.exceptionHandling(handling -> handling
				.authenticationEntryPoint(authenticationEntryPoint)
				.accessDeniedHandler(accessDeniedHandler))
			.headers(headers -> headers
				.frameOptions(frame -> frame.deny())
				.referrerPolicy(referrer -> referrer.policy(ReferrerPolicy.NO_REFERRER))
				.contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'none'; frame-ancestors 'none'")))
			.addFilterBefore(new RateLimitFilter(rateLimiter, audit, errors), CsrfFilter.class)
			.addFilterBefore(new OriginCheckFilter(properties.appOrigin(), audit, errors), CsrfFilter.class)
			.addFilterAfter(new ApiKeyFilter(apiKeys, audit, rateLimiter, errors), CsrfFilter.class)
			.addFilterBefore(new ActiveUserFilter(sessions, audit, errors, clock), AuthorizationFilter.class);
		return http.build();
	}

	/**
	 * Plain (non-XOR) token comparison, as the SPA echoes the cookie value. The token is read from the
	 * X-XSRF-TOKEN header only: the default also accepts a "_csrf" request parameter, which would let
	 * the token travel in URLs and make the server parse form bodies.
	 */
	private static CsrfTokenRequestHandler headerOnlyCsrfTokenHandler() {
		return new CsrfTokenRequestAttributeHandler() {
			@Override
			public String resolveCsrfTokenValue(HttpServletRequest request, CsrfToken csrfToken) {
				return request.getHeader(csrfToken.getHeaderName());
			}
		};
	}

}
