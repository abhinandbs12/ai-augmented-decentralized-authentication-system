package com.blockauth.admin;

import java.time.Instant;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.blockauth.admin.AdminActionService.ActionView;
import com.blockauth.admin.AdminWalletService.WalletChangeResponse;
import com.blockauth.admin.StatisticsService.Statistics;
import com.blockauth.audit.AttackType;
import com.blockauth.audit.AuditService;
import com.blockauth.audit.AuthEventResponse;
import com.blockauth.audit.AuthEventStatus;
import com.blockauth.audit.AuthEventType;
import com.blockauth.audit.SecurityEventResponse;
import com.blockauth.auth.StepUpProof;
import com.blockauth.common.PageResponse;
import com.blockauth.common.WalletAddresses;
import com.blockauth.security.BlockAuthPrincipal;
import com.blockauth.security.ClientInfoResolver;
import com.blockauth.user.UserResponse;
import com.blockauth.user.UserRole;
import com.blockauth.user.UserService;
import com.blockauth.user.UserStatus;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

/** ADMIN-only; the role is enforced by the security filter chain, not here. */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

	private final UserService users;
	private final AuditService audit;
	private final AdminWalletService wallets;
	private final StatisticsService statistics;
	private final AdminActionService actions;

	/** A dangerous action's fresh signature. */
	public record ProofBody(@NotNull(message = "is required") @Valid StepUpProof proof) {
	}

	public AdminController(UserService users, AuditService audit, AdminWalletService wallets,
			StatisticsService statistics, AdminActionService actions) {
		this.users = users;
		this.audit = audit;
		this.wallets = wallets;
		this.statistics = statistics;
		this.actions = actions;
	}

	@GetMapping("/users")
	PageResponse<UserResponse> users(@RequestParam(required = false) UserStatus status,
			@RequestParam(required = false) UserRole role, @RequestParam(required = false) String walletAddress,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
		String wallet = WalletAddresses.normalizeOptional(walletAddress, "walletAddress");
		return PageResponse.of(users.list(status, role, wallet, PageResponse.request(page, size, "createdAt")),
				UserResponse::of);
	}

	@GetMapping("/authentication-events")
	PageResponse<AuthEventResponse> authenticationEvents(@RequestParam(required = false) AuthEventType eventType,
			@RequestParam(required = false) AuthEventStatus eventStatus,
			@RequestParam(required = false) String walletAddress, @RequestParam(required = false) Instant from,
			@RequestParam(required = false) Instant to, @RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "20") int size) {
		String wallet = WalletAddresses.normalizeOptional(walletAddress, "walletAddress");
		return PageResponse.of(audit.authenticationEvents(eventType, eventStatus, wallet, from, to,
				PageResponse.request(page, size, "occurredAt")), AuthEventResponse::of);
	}

	@GetMapping("/security-events")
	PageResponse<SecurityEventResponse> securityEvents(@RequestParam(required = false) AttackType attackType,
			@RequestParam(required = false) String walletAddress, @RequestParam(required = false) Instant from,
			@RequestParam(required = false) Instant to, @RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "20") int size) {
		String wallet = WalletAddresses.normalizeOptional(walletAddress, "walletAddress");
		return PageResponse.of(
				audit.securityEvents(attackType, wallet, from, to, PageResponse.request(page, size, "occurredAt")),
				SecurityEventResponse::of);
	}

	@GetMapping("/statistics")
	Statistics statistics() {
		return statistics.statistics();
	}

	@PostMapping("/wallet/{address}/revoke")
	WalletChangeResponse revoke(@PathVariable String address, @Valid @RequestBody ProofBody body,
			@AuthenticationPrincipal BlockAuthPrincipal admin, HttpServletRequest request) {
		return wallets.revoke(admin, address, body.proof(), ClientInfoResolver.resolve(request));
	}

	/** Takes effect only after the waiting period; answers with the scheduled action. */
	@PostMapping("/wallet/{address}/activate")
	@ResponseStatus(HttpStatus.ACCEPTED)
	ActionView activate(@PathVariable String address, @Valid @RequestBody ProofBody body,
			@AuthenticationPrincipal BlockAuthPrincipal admin, HttpServletRequest request) {
		return actions.requestActivation(admin, address, body.proof(), ClientInfoResolver.resolve(request));
	}

	/** For a user who lost their authenticator and backup codes; takes effect after the waiting period. */
	@PostMapping("/wallet/{address}/second-step/reset")
	@ResponseStatus(HttpStatus.ACCEPTED)
	ActionView resetSecondStep(@PathVariable String address, @Valid @RequestBody ProofBody body,
			@AuthenticationPrincipal BlockAuthPrincipal admin, HttpServletRequest request) {
		return actions.requestSecondStepReset(admin, address, body.proof(), ClientInfoResolver.resolve(request));
	}

}
