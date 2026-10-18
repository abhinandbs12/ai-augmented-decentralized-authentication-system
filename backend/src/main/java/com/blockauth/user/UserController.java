package com.blockauth.user;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.blockauth.audit.AuditService;
import com.blockauth.audit.AuthEventResponse.HistoryEntry;
import com.blockauth.audit.AuthEventType;
import com.blockauth.blockchain.WalletStatusResponse;
import com.blockauth.common.PageResponse;
import com.blockauth.security.BlockAuthPrincipal;

/**
 * Every endpoint here is scoped to the session principal. None accepts a user or wallet identifier, so
 * there is no parameter a caller could change to reach another user's data.
 */
@RestController
@RequestMapping("/api/users")
public class UserController {

	private final UserService users;
	private final AuditService audit;

	public UserController(UserService users, AuditService audit) {
		this.users = users;
		this.audit = audit;
	}

	@GetMapping("/me")
	UserProfileResponse me(@AuthenticationPrincipal BlockAuthPrincipal principal) {
		return UserProfileResponse.of(users.require(principal.userId()));
	}

	@GetMapping("/authentication-history")
	PageResponse<HistoryEntry> history(@AuthenticationPrincipal BlockAuthPrincipal principal,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
			@RequestParam(required = false) AuthEventType eventType) {
		return PageResponse.of(
				audit.historyOf(principal.userId(), eventType, PageResponse.request(page, size, "occurredAt")),
				HistoryEntry::of);
	}

	@GetMapping("/wallet-status")
	WalletStatusResponse walletStatus(@AuthenticationPrincipal BlockAuthPrincipal principal) {
		return WalletStatusResponse.of(principal.walletAddress(), users.chainStatus(principal.walletAddress()));
	}

}
