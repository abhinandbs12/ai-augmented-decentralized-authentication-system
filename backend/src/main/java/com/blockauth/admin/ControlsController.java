package com.blockauth.admin;

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
import com.blockauth.admin.AdminController.ProofBody;
import com.blockauth.admin.EmergencyStopService.State;
import com.blockauth.auth.StepUpProof;
import com.blockauth.common.PageResponse;
import com.blockauth.security.BlockAuthPrincipal;
import com.blockauth.security.ClientInfoResolver;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

/** ADMIN-only: the emergency stop and the queue of delayed administrator actions. */
@RestController
@RequestMapping("/api/admin")
public class ControlsController {

	public record StopRequest(String reason, @NotNull(message = "is required") Boolean blockLogins,
			@NotNull(message = "is required") Boolean endUserSessions,
			@NotNull(message = "is required") @Valid StepUpProof proof) {
	}

	private final EmergencyStopService stop;
	private final AdminActionService actions;

	public ControlsController(EmergencyStopService stop, AdminActionService actions) {
		this.stop = stop;
		this.actions = actions;
	}

	@GetMapping("/emergency-stop")
	State emergencyStop() {
		return stop.state();
	}

	@PostMapping("/emergency-stop/activate")
	State activate(@Valid @RequestBody StopRequest body, @AuthenticationPrincipal BlockAuthPrincipal admin,
			HttpServletRequest request) {
		stop.activate(admin, body.reason(), body.blockLogins(), body.endUserSessions(), body.proof(),
				ClientInfoResolver.resolve(request));
		return stop.state();
	}

	/** Lifting the stop takes effect only after the waiting period. */
	@PostMapping("/emergency-stop/lift")
	@ResponseStatus(HttpStatus.ACCEPTED)
	ActionView lift(@Valid @RequestBody ProofBody body, @AuthenticationPrincipal BlockAuthPrincipal admin,
			HttpServletRequest request) {
		return actions.requestLift(admin, body.proof(), ClientInfoResolver.resolve(request));
	}

	@GetMapping("/actions")
	PageResponse<ActionView> actions(@RequestParam(required = false) AdminAction.Status status,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
		return actions.list(status, PageResponse.request(page, size, "requestedAt"));
	}

	@PostMapping("/actions/{id}/cancel")
	ActionView cancel(@PathVariable Long id, @AuthenticationPrincipal BlockAuthPrincipal admin,
			HttpServletRequest request) {
		return actions.cancel(admin, id, ClientInfoResolver.resolve(request));
	}

}
