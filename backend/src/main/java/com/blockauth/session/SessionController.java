package com.blockauth.session;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.blockauth.security.BlockAuthPrincipal;
import com.blockauth.security.ClientInfoResolver;
import com.blockauth.session.SessionManagement.AlertView;
import com.blockauth.session.SessionManagement.DeviceView;
import com.blockauth.session.SessionManagement.SessionView;

import jakarta.servlet.http.HttpServletRequest;

/** The caller's own sessions, devices and sign-in alerts. No endpoint accepts another user's identifier. */
@RestController
@RequestMapping("/api/users")
public class SessionController {

	private final SessionManagement management;

	public SessionController(SessionManagement management) {
		this.management = management;
	}

	@GetMapping("/sessions")
	List<SessionView> sessions(@AuthenticationPrincipal BlockAuthPrincipal principal) {
		return management.sessions(principal);
	}

	@PostMapping("/sessions/{id}/end")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void endSession(@PathVariable UUID id, @AuthenticationPrincipal BlockAuthPrincipal principal,
			HttpServletRequest request) {
		management.endSession(principal, id, ClientInfoResolver.resolve(request));
	}

	@PostMapping("/sessions/end-others")
	Map<String, Integer> endOthers(@AuthenticationPrincipal BlockAuthPrincipal principal, HttpServletRequest request) {
		return Map.of("ended", management.endOtherSessions(principal, ClientInfoResolver.resolve(request)));
	}

	@GetMapping("/devices")
	List<DeviceView> devices(@AuthenticationPrincipal BlockAuthPrincipal principal) {
		return management.devices(principal);
	}

	@PostMapping("/devices/{id}/remove")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void removeDevice(@PathVariable UUID id, @AuthenticationPrincipal BlockAuthPrincipal principal,
			HttpServletRequest request) {
		management.removeDevice(principal, id, ClientInfoResolver.resolve(request));
	}

	@GetMapping("/alerts")
	List<AlertView> alerts(@AuthenticationPrincipal BlockAuthPrincipal principal) {
		return management.alerts(principal);
	}

	@PostMapping("/alerts/{id}/confirm")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void confirmAlert(@PathVariable Long id, @AuthenticationPrincipal BlockAuthPrincipal principal) {
		management.confirmAlert(principal, id);
	}

	@PostMapping("/alerts/{id}/sign-out")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void rejectAlert(@PathVariable Long id, @AuthenticationPrincipal BlockAuthPrincipal principal,
			HttpServletRequest request) {
		management.rejectAlert(principal, id, ClientInfoResolver.resolve(request));
	}

}
