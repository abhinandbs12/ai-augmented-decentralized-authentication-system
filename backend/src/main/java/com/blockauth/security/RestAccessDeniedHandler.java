package com.blockauth.security;

import java.io.IOException;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.stereotype.Component;

import com.blockauth.audit.AttackType;
import com.blockauth.audit.AuditService;
import com.blockauth.common.ApiErrorWriter;
import com.blockauth.common.ErrorCode;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** 403 as JSON, recording either a CSRF rejection or a privilege-escalation attempt. */
@Component
public class RestAccessDeniedHandler implements AccessDeniedHandler {

	private final AuditService audit;
	private final ApiErrorWriter errors;

	public RestAccessDeniedHandler(AuditService audit, ApiErrorWriter errors) {
		this.audit = audit;
		this.errors = errors;
	}

	@Override
	public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException exception)
			throws IOException {
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		BlockAuthPrincipal principal = authentication != null
				&& authentication.getPrincipal() instanceof BlockAuthPrincipal p ? p : null;
		String wallet = principal == null ? null : principal.walletAddress();
		String ip = ClientInfoResolver.resolve(request).ip();

		if (exception instanceof CsrfException) {
			audit.recordSecurityEvent(AttackType.CSRF_REJECTED, wallet, principal == null ? null : principal.userId(),
					ip);
			errors.write(request, response, ErrorCode.CSRF_INVALID);
			return;
		}
		audit.recordSecurityEvent(AttackType.PRIVILEGE_ESCALATION_ATTEMPT,
				"Target: " + request.getMethod() + " " + protectedArea(RateLimitFilter.routedPath(request)) + ".",
				wallet, principal == null ? null : principal.userId(), ip);
		errors.write(request, response, ErrorCode.ACCESS_DENIED);
	}

	/**
	 * Names the protected area that was requested. The stored description must be server-generated
	 * text, so the area is one of three fixed labels rather than the caller's path.
	 */
	private static String protectedArea(String path) {
		if (path.startsWith("/api/admin/")) {
			return "/api/admin";
		}
		if (path.startsWith("/api/blockchain/")) {
			return "/api/blockchain";
		}
		return "an unmapped path";
	}

}
