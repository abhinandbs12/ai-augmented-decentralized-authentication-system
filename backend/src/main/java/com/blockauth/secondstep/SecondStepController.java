package com.blockauth.secondstep;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.blockauth.auth.StepUpProof;
import com.blockauth.security.BlockAuthPrincipal;
import com.blockauth.security.ClientInfoResolver;
import com.blockauth.secondstep.SecondStepService.Setup;
import com.blockauth.secondstep.SecondStepService.Status;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** The caller's own second step. */
@RestController
@RequestMapping("/api/users/second-step")
public class SecondStepController {

	public record CodeAndProof(@NotNull(message = "is required") @Size(max = 20, message = "is too long") String code,
			@NotNull(message = "is required") @Valid StepUpProof proof) {
	}

	public record BackupCodes(List<String> backupCodes) {
	}

	private final SecondStepService secondStep;

	public SecondStepController(SecondStepService secondStep) {
		this.secondStep = secondStep;
	}

	@GetMapping
	Status status(@AuthenticationPrincipal BlockAuthPrincipal principal) {
		return secondStep.status(principal.userId());
	}

	@PostMapping("/setup")
	Setup setup(@AuthenticationPrincipal BlockAuthPrincipal principal) {
		return secondStep.beginSetup(principal);
	}

	@PostMapping("/enable")
	BackupCodes enable(@Valid @RequestBody CodeAndProof body, @AuthenticationPrincipal BlockAuthPrincipal principal,
			HttpServletRequest request) {
		return new BackupCodes(
				secondStep.enable(principal, body.code(), body.proof(), ClientInfoResolver.resolve(request)));
	}

	@PostMapping("/disable")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void disable(@Valid @RequestBody CodeAndProof body, @AuthenticationPrincipal BlockAuthPrincipal principal,
			HttpServletRequest request) {
		secondStep.disable(principal, body.code(), body.proof(), ClientInfoResolver.resolve(request));
	}

	@PostMapping("/backup-codes")
	BackupCodes renewBackupCodes(@Valid @RequestBody CodeAndProof body,
			@AuthenticationPrincipal BlockAuthPrincipal principal, HttpServletRequest request) {
		return new BackupCodes(
				secondStep.renewBackupCodes(principal, body.code(), body.proof(), ClientInfoResolver.resolve(request)));
	}

}
