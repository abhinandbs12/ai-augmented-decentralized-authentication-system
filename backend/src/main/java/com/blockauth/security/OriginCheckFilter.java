package com.blockauth.security;

import java.io.IOException;

import org.springframework.http.HttpHeaders;
import org.springframework.web.filter.OncePerRequestFilter;

import com.blockauth.audit.AttackType;
import com.blockauth.audit.AuditService;
import com.blockauth.common.ApiErrorWriter;
import com.blockauth.common.ErrorCode;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** Rejects state-changing requests whose Origin header names any site other than the SPA. */
public class OriginCheckFilter extends OncePerRequestFilter {

	private final String appOrigin;
	private final AuditService audit;
	private final ApiErrorWriter errors;

	public OriginCheckFilter(String appOrigin, AuditService audit, ApiErrorWriter errors) {
		this.appOrigin = appOrigin;
		this.audit = audit;
		this.errors = errors;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		// Browsers always send Origin on cross-site POSTs. An absent header means a non-browser client,
		// which the CSRF token check still covers.
		String origin = request.getHeader(HttpHeaders.ORIGIN);
		if ("POST".equals(request.getMethod()) && origin != null && !origin.equals(appOrigin)) {
			audit.recordSecurityEvent(AttackType.CSRF_REJECTED, null, null,
					ClientInfoResolver.resolve(request).ip());
			errors.write(request, response, ErrorCode.CSRF_INVALID);
			return;
		}
		chain.doFilter(request, response);
	}

}
