package com.blockauth.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import com.blockauth.apikey.ApiKeyFilter;
import com.blockauth.apikey.ApiKeyService;
import com.blockauth.audit.AuditService;
import com.blockauth.common.ApiErrorWriter;
import com.blockauth.session.UserSessionRepository;

import jakarta.servlet.FilterChain;
import tools.jackson.databind.ObjectMapper;

/**
 * When the database cannot answer, the per-request checks refuse the request (503) rather than let it
 * through: neither an ended session nor a revoked API key may slip past during an outage.
 */
class FailClosedFiltersTest {

	private final ApiErrorWriter errors = new ApiErrorWriter(new ObjectMapper());
	private final AuditService audit = mock(AuditService.class);
	private final FilterChain chain = mock(FilterChain.class);
	private final MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/users/me");
	private final MockHttpServletResponse response = new MockHttpServletResponse();

	@AfterEach
	void clearContext() {
		SecurityContextHolder.clearContext();
	}

	@Test
	void theSessionCheckRefusesWhenTheDatabaseIsDown() throws Exception {
		UserSessionRepository sessions = mock(UserSessionRepository.class);
		when(sessions.findWithUser(any())).thenThrow(new DataAccessResourceFailureException("down"));
		SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
				new BlockAuthPrincipal(UUID.randomUUID(), "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed",
						UUID.randomUUID()),
				null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));

		new ActiveUserFilter(sessions, audit, errors, Clock.systemUTC()).doFilter(request, response, chain);

		assertThat(response.getStatus()).isEqualTo(503);
		assertThat(response.getContentAsString()).contains("DATABASE_UNAVAILABLE").doesNotContain("down");
		verifyNoInteractions(chain);
	}

	@Test
	void theApiKeyCheckRefusesWhenTheDatabaseIsDown() throws Exception {
		ApiKeyService keys = mock(ApiKeyService.class);
		when(keys.authenticate(anyString())).thenThrow(new DataAccessResourceFailureException("down"));
		request.addHeader(ApiKeyFilter.HEADER, "bak.00000000-0000-0000-0000-000000000000." + "A".repeat(43));

		new ApiKeyFilter(keys, audit, new InMemoryRateLimiter(Clock.systemUTC()), errors)
			.doFilter(request, response, chain);

		assertThat(response.getStatus()).isEqualTo(503);
		assertThat(response.getContentAsString()).contains("DATABASE_UNAVAILABLE");
		assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
		verifyNoInteractions(chain);
	}

}
