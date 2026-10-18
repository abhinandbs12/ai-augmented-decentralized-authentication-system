package com.blockauth.security;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import org.springframework.dao.DataAccessException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.TransactionException;
import org.springframework.web.filter.OncePerRequestFilter;

import com.blockauth.audit.AuditService;
import com.blockauth.audit.AuthEventStatus;
import com.blockauth.audit.AuthEventType;
import com.blockauth.common.ApiErrorWriter;
import com.blockauth.common.ErrorCode;
import com.blockauth.session.SessionAndUser;
import com.blockauth.session.SessionEndReason;
import com.blockauth.session.UserSessionRepository;
import com.blockauth.user.User;
import com.blockauth.user.UserStatus;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

/**
 * Re-validates the session on every request, against its server-side record and the user row (one
 * query): a session ended from another device, an emergency stop or a revoked wallet stops working at
 * once, and the role is refreshed from the database. The blockchain is deliberately not queried here;
 * admin revocation updates the database mirror.
 */
public class ActiveUserFilter extends OncePerRequestFilter {

	private static final Duration TOUCH_INTERVAL = Duration.ofMinutes(1);

	private final UserSessionRepository sessions;
	private final AuditService audit;
	private final ApiErrorWriter errors;
	private final Clock clock;

	public ActiveUserFilter(UserSessionRepository sessions, AuditService audit, ApiErrorWriter errors, Clock clock) {
		this.sessions = sessions;
		this.audit = audit;
		this.errors = errors;
		this.clock = clock;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		if (authentication != null && authentication.getPrincipal() instanceof BlockAuthPrincipal principal) {
			Optional<SessionAndUser> found;
			try {
				found = principal.sessionId() == null ? Optional.empty() : sessions.findWithUser(principal.sessionId());
			}
			catch (DataAccessException | TransactionException e) {
				// Fail closed: without the records neither the session nor the role can be confirmed.
				errors.write(request, response, ErrorCode.DATABASE_UNAVAILABLE);
				return;
			}
			User user = found.map(SessionAndUser::user).orElse(null);
			boolean revoked = user != null && user.getStatus() == UserStatus.REVOKED;
			if (found.isEmpty() || found.get().session().isEnded() || revoked) {
				if (revoked) {
					sessions.end(principal.sessionId(), SessionEndReason.WALLET_REVOKED, clock.instant());
				}
				HttpSession session = request.getSession(false);
				if (session != null) {
					session.invalidate();
				}
				SecurityContextHolder.clearContext();
				if (revoked || found.isEmpty()) {
					audit.recordAuthEvent(AuthEventType.SESSION_TERMINATED, AuthEventStatus.SUCCESS,
							principal.walletAddress(), user == null ? null : user.getId(), null, null,
							ClientInfoResolver.resolve(request));
				}
				errors.write(request, response, ErrorCode.SESSION_REVOKED);
				return;
			}
			touch(found.get(), principal);
			SecurityContextHolder.getContext().setAuthentication(BlockAuthPrincipal.authentication(user,
					principal.sessionId()));
		}
		chain.doFilter(request, response);
	}

	private void touch(SessionAndUser found, BlockAuthPrincipal principal) {
		Instant now = clock.instant();
		if (found.session().getLastSeenAt().isBefore(now.minus(TOUCH_INTERVAL))) {
			try {
				sessions.touch(principal.sessionId(), now, now.minus(TOUCH_INTERVAL));
			}
			catch (DataAccessException | TransactionException e) {
				// Only the "last active" time is lost; the request itself is fine.
			}
		}
	}

}
