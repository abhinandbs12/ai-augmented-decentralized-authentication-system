package com.blockauth.auth;

import java.time.Instant;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.blockauth.common.WalletAddresses;
import com.blockauth.security.BlockAuthPrincipal;
import com.blockauth.security.ClientInfoResolver;
import com.blockauth.user.UserProfileResponse;
import com.blockauth.user.UserRole;
import com.blockauth.user.UserStatus;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

	public record CsrfResponse(String headerName, String token) {
	}

	public record ChallengeRequest(
			@NotNull(message = "is required") @Pattern(regexp = WalletAddresses.FORMAT, message = WalletAddresses.FORMAT_MESSAGE) String walletAddress) {
	}

	public record ChallengeResponse(String challenge, String nonce, Instant expiresAt) {
	}

	public record SignedChallenge(
			@NotNull(message = "is required") @Pattern(regexp = WalletAddresses.FORMAT, message = WalletAddresses.FORMAT_MESSAGE) String walletAddress,
			@NotNull(message = "is required") @Size(min = 1, max = 1000, message = "must be 1-1000 characters") String challenge,
			@NotNull(message = "is required") @Pattern(regexp = "^0x[0-9a-fA-F]{130}$", message = "must be a 0x-prefixed 65-byte hex signature") String signature) {
	}

	public record SecondStepRequired(String status, Instant expiresAt) {
	}

	public record SecondStepCode(
			@NotNull(message = "is required") @Size(min = 6, max = 20, message = "must be 6-20 characters") String code) {
	}

	public record RegistrationResponse(String walletAddress, UserRole role, UserStatus status, Instant registeredAt,
			String transactionHash) {
	}

	private final ChallengeService challenges;
	private final RegistrationService registration;
	private final LoginService login;
	private final SessionService sessions;

	public AuthController(ChallengeService challenges, RegistrationService registration, LoginService login,
			SessionService sessions) {
		this.challenges = challenges;
		this.registration = registration;
		this.login = login;
		this.sessions = sessions;
	}

	/** Resolving the token makes Spring Security write the XSRF-TOKEN cookie. */
	@GetMapping("/csrf")
	CsrfResponse csrf(CsrfToken token) {
		return new CsrfResponse(token.getHeaderName(), token.getToken());
	}

	@PostMapping("/register/challenge")
	@ResponseStatus(HttpStatus.CREATED)
	ChallengeResponse registrationChallenge(@Valid @RequestBody ChallengeRequest body, HttpServletRequest request) {
		return issue(body, ChallengePurpose.REGISTRATION, request);
	}

	@PostMapping("/challenge")
	@ResponseStatus(HttpStatus.CREATED)
	ChallengeResponse loginChallenge(@Valid @RequestBody ChallengeRequest body, HttpServletRequest request) {
		return issue(body, ChallengePurpose.LOGIN, request);
	}

	@PostMapping("/register")
	@ResponseStatus(HttpStatus.CREATED)
	RegistrationResponse register(@Valid @RequestBody SignedChallenge body, HttpServletRequest request) {
		return registration.register(body, ClientInfoResolver.resolve(request));
	}

	/** 200 with the profile when signed in; 202 when the trust score asks for the second step as well. */
	@PostMapping("/verify")
	ResponseEntity<Object> verify(@Valid @RequestBody SignedChallenge body, HttpServletRequest request,
			HttpServletResponse response) {
		LoginService.Result result = login.login(body, request, response);
		if (result.secondStepRequired()) {
			return ResponseEntity.status(HttpStatus.ACCEPTED)
				.body(new SecondStepRequired("SECOND_STEP_REQUIRED", result.secondStepExpiresAt()));
		}
		return ResponseEntity.ok(UserProfileResponse.of(result.user()));
	}

	@PostMapping("/second-step")
	UserProfileResponse secondStep(@Valid @RequestBody SecondStepCode body, HttpServletRequest request,
			HttpServletResponse response) {
		return UserProfileResponse.of(login.completeSecondStep(body.code(), request, response));
	}

	@PostMapping("/logout")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void logout(@AuthenticationPrincipal BlockAuthPrincipal principal, HttpServletRequest request,
			HttpServletResponse response) {
		sessions.logout(principal, request, response);
	}

	private ChallengeResponse issue(ChallengeRequest body, ChallengePurpose purpose, HttpServletRequest request) {
		String wallet = WalletAddresses.normalize(body.walletAddress(), "walletAddress");
		AuthenticationChallenge challenge = challenges.issue(wallet, purpose, ClientInfoResolver.resolve(request));
		return new ChallengeResponse(challenge.getChallenge(), challenge.getNonce(), challenge.getExpiresAt());
	}

}
