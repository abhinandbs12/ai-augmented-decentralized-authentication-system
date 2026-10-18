package com.blockauth.auth;

import org.springframework.stereotype.Component;

import com.blockauth.audit.AuditService;
import com.blockauth.audit.AuthEventType;
import com.blockauth.audit.ClientInfo;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;
import com.blockauth.security.InMemoryRateLimiter;

/** Audits a failed registration or login and counts it toward the per-IP temporary block. */
@Component
class AuthFailureRecorder {

	private final AuditService audit;
	private final InMemoryRateLimiter limiter;

	AuthFailureRecorder(AuditService audit, InMemoryRateLimiter limiter) {
		this.audit = audit;
		this.limiter = limiter;
	}

	void record(AuthEventType type, String wallet, BlockAuthException failure, ClientInfo client) {
		audit.recordFailure(type, wallet, failure.code(), client);
		int status = failure.code().status();
		// Only rejected credentials (401/403) count, and the IP is blocked, never the wallet: otherwise
		// anyone could lock a wallet's owner out by failing on purpose.
		if ((status == 401 || status == 403) && limiter.recordAuthFailure(client.ip())) {
			audit.recordFailure(type, wallet, ErrorCode.IP_TEMPORARILY_BLOCKED, client);
		}
	}

}
