package com.blockauth.auth;

import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.stereotype.Service;

import com.blockauth.audit.AuditService;
import com.blockauth.audit.AuthEventStatus;
import com.blockauth.audit.AuthEventType;
import com.blockauth.security.BlockAuthPrincipal;
import com.blockauth.security.ClientInfoResolver;
import com.blockauth.session.Device;
import com.blockauth.session.SessionEndReason;
import com.blockauth.session.SessionRegistry;
import com.blockauth.user.User;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

@Service
public class SessionService {

	private final SecurityContextRepository contextRepository;
	private final CsrfTokenRepository csrfTokenRepository;
	private final SessionRegistry registry;
	private final AuditService audit;
	private final String cookieName;
	private final boolean secureCookie;

	public SessionService(SecurityContextRepository contextRepository, CsrfTokenRepository csrfTokenRepository,
			SessionRegistry registry, AuditService audit,
			@Value("${server.servlet.session.cookie.name:JSESSIONID}") String cookieName,
			@Value("${server.servlet.session.cookie.secure:true}") boolean secureCookie) {
		this.contextRepository = contextRepository;
		this.csrfTokenRepository = csrfTokenRepository;
		this.registry = registry;
		this.audit = audit;
		this.cookieName = cookieName;
		this.secureCookie = secureCookie;
	}

	/**
	 * Starts the authenticated session and opens its server-side record. Any session that existed before
	 * sign-in is destroyed and a new ID issued (session-fixation defense), and the CSRF token is rotated.
	 * @param device the device the browser was recognised as, if any; otherwise a new one is registered
	 */
	public SessionRegistry.Started establish(User user, Optional<Device> device, boolean secondStepPassed,
			HttpServletRequest request, HttpServletResponse response) {
		endRecord(request, SessionEndReason.RELOGIN);
		invalidate(request);
		HttpSession session = request.getSession(true);
		SessionRegistry.Started started = registry.start(user, device, secondStepPassed,
				ClientInfoResolver.resolve(request), response);
		session.setAttribute(SessionRegistry.SESSION_ID_ATTRIBUTE, started.sessionId());
		SecurityContext context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(BlockAuthPrincipal.authentication(user, started.sessionId()));
		SecurityContextHolder.setContext(context);
		contextRepository.saveContext(context, request, response);
		csrfTokenRepository.saveToken(null, request, response);
		return started;
	}

	/**
	 * Ends the session, closes its record and expires both cookies. Safe to call without a session.
	 * @param principal the logged-in user, or null for an anonymous caller
	 */
	public void logout(BlockAuthPrincipal principal, HttpServletRequest request, HttpServletResponse response) {
		endRecord(request, SessionEndReason.LOGOUT);
		invalidate(request);
		SecurityContextHolder.clearContext();
		csrfTokenRepository.saveToken(null, request, response);
		response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from(cookieName, "").path("/").maxAge(0)
			.httpOnly(true).secure(secureCookie).sameSite("Strict").build().toString());
		if (principal != null) {
			audit.recordAuthEvent(AuthEventType.LOGOUT, AuthEventStatus.SUCCESS, principal.walletAddress(),
					principal.userId(), null, null, ClientInfoResolver.resolve(request));
		}
	}

	// The attribute is removed first so that the session listener does not record a time-out as well.
	private void endRecord(HttpServletRequest request, SessionEndReason reason) {
		HttpSession session = request.getSession(false);
		if (session != null && session.getAttribute(SessionRegistry.SESSION_ID_ATTRIBUTE) instanceof UUID id) {
			registry.end(id, reason);
			session.removeAttribute(SessionRegistry.SESSION_ID_ATTRIBUTE);
		}
	}

	private static void invalidate(HttpServletRequest request) {
		HttpSession session = request.getSession(false);
		if (session != null) {
			session.invalidate();
		}
	}

}
