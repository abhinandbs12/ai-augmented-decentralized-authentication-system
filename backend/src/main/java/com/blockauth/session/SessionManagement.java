package com.blockauth.session;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.blockauth.audit.AuditService;
import com.blockauth.audit.AuthEventStatus;
import com.blockauth.audit.AuthEventType;
import com.blockauth.audit.ClientInfo;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;
import com.blockauth.security.BlockAuthPrincipal;

/**
 * What a signed-in user can see and do about their own sessions, devices and sign-in alerts. Every
 * method is scoped to the caller: an id belonging to someone else is reported as not found.
 */
@Service
public class SessionManagement {

	public record SessionView(UUID id, String device, String ipAddress, Instant createdAt, Instant lastSeenAt,
			boolean secondStep, boolean current) {
	}

	public record DeviceView(UUID id, String label, Instant firstSeenAt, Instant lastSeenAt, Instant trustedUntil,
			boolean current) {
	}

	public record AlertView(Long id, Instant createdAt, String device, String ipAddress, boolean sessionOpen) {
	}

	// Activity is recorded at most once a minute, so a session counts as open for one minute longer.
	private static final Duration TOUCH_GRANULARITY = Duration.ofMinutes(1);

	private final UserSessionRepository sessions;
	private final UserDeviceRepository links;
	private final DeviceRepository devices;
	private final SignInAlertRepository alerts;
	private final AuditService audit;
	private final Clock clock;
	private final Duration sessionTimeout;

	public SessionManagement(UserSessionRepository sessions, UserDeviceRepository links, DeviceRepository devices,
			SignInAlertRepository alerts, AuditService audit, Clock clock,
			@Value("${server.servlet.session.timeout:30m}") Duration sessionTimeout) {
		this.sessions = sessions;
		this.links = links;
		this.devices = devices;
		this.alerts = alerts;
		this.audit = audit;
		this.clock = clock;
		this.sessionTimeout = sessionTimeout;
	}

	@Transactional(readOnly = true)
	public List<SessionView> sessions(BlockAuthPrincipal principal) {
		List<UserSession> open = sessions.findOpen(principal.userId(),
				clock.instant().minus(sessionTimeout).minus(TOUCH_GRANULARITY));
		Map<UUID, String> labels = labels(open.stream().map(UserSession::getDeviceId).toList());
		return open.stream()
			.map(s -> new SessionView(s.getId(), labels.get(s.getDeviceId()), s.getIpAddress(), s.getCreatedAt(),
					s.getLastSeenAt(), s.isSecondStep(), s.getId().equals(principal.sessionId())))
			.toList();
	}

	@Transactional(readOnly = true)
	public List<DeviceView> devices(BlockAuthPrincipal principal) {
		UUID current = currentDevice(principal);
		List<UserDevice> mine = links.findByUserIdAndRemovedAtIsNullOrderByLastSeenAtDesc(principal.userId());
		Map<UUID, String> labels = labels(mine.stream().map(UserDevice::getDeviceId).toList());
		Instant now = clock.instant();
		return mine.stream()
			.map(d -> new DeviceView(d.getDeviceId(), labels.get(d.getDeviceId()), d.getFirstSeenAt(),
					d.getLastSeenAt(),
					d.getTrustedUntil() != null && d.getTrustedUntil().isAfter(now) ? d.getTrustedUntil() : null,
					d.getDeviceId().equals(current)))
			.toList();
	}

	@Transactional(readOnly = true)
	public List<AlertView> alerts(BlockAuthPrincipal principal) {
		List<SignInAlert> open = alerts.findOpen(principal.userId(), principal.sessionId());
		Map<UUID, UserSession> byId = sessions.findAllById(open.stream().map(SignInAlert::getSessionId).toList())
			.stream()
			.collect(Collectors.toMap(UserSession::getId, Function.identity()));
		Map<UUID, String> labels = labels(byId.values().stream().map(UserSession::getDeviceId).toList());
		return open.stream().map(a -> {
			UserSession s = byId.get(a.getSessionId());
			return new AlertView(a.getId(), a.getCreatedAt(), labels.get(s.getDeviceId()), s.getIpAddress(),
					!s.isEnded());
		}).toList();
	}

	/** Ends one of the caller's other sessions; it is refused on its very next request. */
	public void endSession(BlockAuthPrincipal principal, UUID sessionId, ClientInfo client) {
		UserSession session = sessions.findById(sessionId)
			.filter(s -> s.getUserId().equals(principal.userId()))
			.orElseThrow(() -> new BlockAuthException(ErrorCode.RESOURCE_NOT_FOUND));
		if (session.getId().equals(principal.sessionId())) {
			throw new BlockAuthException(ErrorCode.CURRENT_DEVICE);
		}
		if (sessions.end(sessionId, SessionEndReason.REMOTE_LOGOUT, clock.instant()) > 0) {
			audit.recordAuthEvent(AuthEventType.REMOTE_LOGOUT, AuthEventStatus.SUCCESS, principal.walletAddress(),
					principal.userId(), null, null, client);
		}
	}

	/** Ends every session of the caller except the one making the request. @return how many were ended */
	public int endOtherSessions(BlockAuthPrincipal principal, ClientInfo client) {
		int ended = sessions.endAllForUserExcept(principal.userId(), principal.sessionId(),
				SessionEndReason.REMOTE_LOGOUT, clock.instant());
		if (ended > 0) {
			audit.recordAuthEvent(AuthEventType.REMOTE_LOGOUT, AuthEventStatus.SUCCESS, principal.walletAddress(),
					principal.userId(), null, null, client);
		}
		return ended;
	}

	/** Forgets a device: its sessions end, its trust ends, and the next sign-in on it counts as new. */
	@Transactional
	public void removeDevice(BlockAuthPrincipal principal, UUID deviceId, ClientInfo client) {
		if (deviceId.equals(currentDevice(principal))) {
			throw new BlockAuthException(ErrorCode.CURRENT_DEVICE);
		}
		UserDevice link = links.findByUserIdAndDeviceId(principal.userId(), deviceId)
			.filter(d -> !d.isRemoved())
			.orElseThrow(() -> new BlockAuthException(ErrorCode.RESOURCE_NOT_FOUND));
		forget(principal.userId(), link);
		audit.recordAuthEvent(AuthEventType.DEVICE_REMOVED, AuthEventStatus.SUCCESS, principal.walletAddress(),
				principal.userId(), null, null, client);
	}

	@Transactional
	public void confirmAlert(BlockAuthPrincipal principal, Long alertId) {
		SignInAlert alert = openAlert(principal, alertId);
		alert.resolve(SignInAlert.Resolution.CONFIRMED, clock.instant());
		alerts.save(alert);
	}

	/** "This was not me": ends that session and forgets its device. */
	@Transactional
	public void rejectAlert(BlockAuthPrincipal principal, Long alertId, ClientInfo client) {
		SignInAlert alert = openAlert(principal, alertId);
		UserSession session = sessions.findById(alert.getSessionId()).orElseThrow();
		if (session.getId().equals(principal.sessionId())) {
			throw new BlockAuthException(ErrorCode.CURRENT_DEVICE);
		}
		sessions.end(session.getId(), SessionEndReason.REMOTE_LOGOUT, clock.instant());
		links.findByUserIdAndDeviceId(principal.userId(), session.getDeviceId())
			.filter(d -> !d.isRemoved())
			.ifPresent(link -> forget(principal.userId(), link));
		alert.resolve(SignInAlert.Resolution.SIGNED_OUT, clock.instant());
		alerts.save(alert);
		audit.recordAuthEvent(AuthEventType.REMOTE_LOGOUT, AuthEventStatus.SUCCESS, principal.walletAddress(),
				principal.userId(), null, null, client);
	}

	private void forget(UUID userId, UserDevice link) {
		Instant now = clock.instant();
		link.remove(now);
		links.save(link);
		sessions.endAllForUserDevice(userId, link.getDeviceId(), SessionEndReason.DEVICE_REMOVED, now);
	}

	private SignInAlert openAlert(BlockAuthPrincipal principal, Long alertId) {
		return alerts.findByIdAndUserId(alertId, principal.userId())
			.filter(a -> !a.isResolved())
			.orElseThrow(() -> new BlockAuthException(ErrorCode.RESOURCE_NOT_FOUND));
	}

	private UUID currentDevice(BlockAuthPrincipal principal) {
		return sessions.findById(principal.sessionId()).map(UserSession::getDeviceId).orElse(null);
	}

	private Map<UUID, String> labels(List<UUID> deviceIds) {
		return devices.findAllById(deviceIds).stream().collect(Collectors.toMap(Device::getId, Device::getLabel));
	}

}
