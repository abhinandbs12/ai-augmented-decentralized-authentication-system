package com.blockauth.auth;

import java.time.Instant;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.blockauth.apikey.ApiKeySpec;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.WalletAddresses;
import com.blockauth.config.SecuritySettings;
import com.blockauth.security.BlockAuthPrincipal;
import com.blockauth.security.ClientInfoResolver;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

/** Issues the one-time challenge that a dangerous action must carry, signed, to be carried out. */
@RestController
@RequestMapping("/api/auth/step-up")
public class StepUpController {

	/**
	 * The action and the parameters it will be carried out with; which parameters are required depends
	 * on the action. They must be sent again, unchanged, with the action itself.
	 */
	public record StepUpRequest(@NotNull(message = "is required") StepUpAction action, String walletAddress,
			Boolean blockLogins, Boolean endUserSessions, String name, List<String> scopes, Integer days) {
	}

	public record StepUpChallenge(String challenge, Instant expiresAt) {
	}

	private final StepUpService stepUp;
	private final SecuritySettings settings;

	public StepUpController(StepUpService stepUp, SecuritySettings settings) {
		this.stepUp = stepUp;
		this.settings = settings;
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	StepUpChallenge challenge(@Valid @RequestBody StepUpRequest body, @AuthenticationPrincipal BlockAuthPrincipal principal,
			Authentication authentication, HttpServletRequest request) {
		boolean admin = authentication.getAuthorities().stream().anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
		AuthenticationChallenge challenge = stepUp.issue(principal, admin, body.action(), details(body),
				ClientInfoResolver.resolve(request));
		return new StepUpChallenge(challenge.getChallenge(), challenge.getExpiresAt());
	}

	private String details(StepUpRequest body) {
		return switch (body.action()) {
			case REVOKE_WALLET, ACTIVATE_WALLET, RESET_SECOND_STEP, FLAG_WALLET, UNFLAG_WALLET ->
				StepUpDetails.wallet(WalletAddresses.normalize(body.walletAddress(), "walletAddress"));
			case START_EMERGENCY_STOP -> StepUpDetails.emergencyStop(required(body.blockLogins(), "blockLogins"),
					required(body.endUserSessions(), "endUserSessions"));
			case CREATE_API_KEY -> ApiKeySpec.of(body.name(), body.scopes(), body.days(), settings.apiKeyMaxDays())
				.details();
			case LIFT_EMERGENCY_STOP, ENABLE_SECOND_STEP, DISABLE_SECOND_STEP, RENEW_BACKUP_CODES ->
				StepUpDetails.none();
		};
	}

	private static boolean required(Boolean value, String field) {
		if (value == null) {
			throw BlockAuthException.invalid(field, "is required");
		}
		return value;
	}

}
