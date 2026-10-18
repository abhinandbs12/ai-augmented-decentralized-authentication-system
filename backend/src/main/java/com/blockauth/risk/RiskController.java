package com.blockauth.risk;

import java.time.Instant;
import java.util.UUID;

import org.springframework.data.domain.Sort;
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

import com.blockauth.admin.AdminController.ProofBody;
import com.blockauth.auth.StepUpProof;
import com.blockauth.common.PageResponse;
import com.blockauth.common.Specs;
import com.blockauth.common.WalletAddresses;
import com.blockauth.security.BlockAuthPrincipal;
import com.blockauth.security.ClientInfoResolver;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

/** ADMIN-only (assessments also with the audit:read key scope): sign-in trust scores and wallet flags. */
@RestController
@RequestMapping("/api/admin")
public class RiskController {

	public record AssessmentView(Long id, String walletAddress, String ipAddress, int score, String rules,
			TrustPolicy.Decision decision, Instant assessedAt) {
	}

	public record FlagView(String walletAddress, String reason, UUID flaggedBy, Instant flaggedAt) {
	}

	public record FlagRequest(String walletAddress, String reason,
			@NotNull(message = "is required") @Valid StepUpProof proof) {
	}

	private final LoginAssessmentRepository assessments;
	private final WalletFlagService flags;

	public RiskController(LoginAssessmentRepository assessments, WalletFlagService flags) {
		this.assessments = assessments;
		this.flags = flags;
	}

	@GetMapping("/login-assessments")
	PageResponse<AssessmentView> assessments(@RequestParam(required = false) String walletAddress,
			@RequestParam(required = false) TrustPolicy.Decision decision, @RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "20") int size) {
		String wallet = WalletAddresses.normalizeOptional(walletAddress, "walletAddress");
		return PageResponse.of(assessments.findAll(Specs.<LoginAssessment>eq("walletAddress", wallet)
			.and(Specs.eq("decision", decision)), PageResponse.request(page, size, "assessedAt")), a -> new AssessmentView(
					a.getId(), WalletAddresses.checksum(a.getWalletAddress()), a.getIpAddress(), a.getScore(),
					a.getRules(), a.getDecision(), a.getAssessedAt()));
	}

	@GetMapping("/wallet-flags")
	PageResponse<FlagView> flags(@RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "20") int size) {
		return PageResponse.of(flags.list(PageResponse.request(page, size,
				Sort.by(Sort.Direction.DESC, "flaggedAt", "walletAddress"))), RiskController::view);
	}

	@PostMapping("/wallet-flags")
	@ResponseStatus(HttpStatus.CREATED)
	FlagView flag(@Valid @RequestBody FlagRequest body, @AuthenticationPrincipal BlockAuthPrincipal admin,
			HttpServletRequest request) {
		return view(flags.flag(admin, body.walletAddress(), body.reason(), body.proof(),
				ClientInfoResolver.resolve(request)));
	}

	@PostMapping("/wallet-flags/{address}/remove")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void unflag(@PathVariable String address, @Valid @RequestBody ProofBody body,
			@AuthenticationPrincipal BlockAuthPrincipal admin, HttpServletRequest request) {
		flags.unflag(admin, address, body.proof(), ClientInfoResolver.resolve(request));
	}

	private static FlagView view(WalletFlag flag) {
		return new FlagView(WalletAddresses.checksum(flag.getWalletAddress()), flag.getReason(), flag.getFlaggedBy(),
				flag.getFlaggedAt());
	}

}
