package com.blockauth.session;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.blockauth.audit.ClientInfo;
import com.blockauth.common.Tokens;
import com.blockauth.config.SecuritySettings;
import com.blockauth.user.User;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** Devices and session records: recognising a browser, opening a record at sign-in, ending records. */
@Service
public class SessionRegistry {

	/** Servlet-session attribute holding the id of the session record. */
	public static final String SESSION_ID_ATTRIBUTE = "BLOCKAUTH_SESSION_ID";

	/** @param newDevice whether this user had not signed in on this device before (or had removed it) */
	public record Started(UUID sessionId, UUID deviceId, boolean newDevice) {
	}

	private final DeviceRepository devices;
	private final UserDeviceRepository links;
	private final UserSessionRepository sessions;
	private final SignInAlertRepository alerts;
	private final DeviceCookie cookie;
	private final SecuritySettings settings;
	private final Clock clock;
	private final TransactionTemplate transaction;

	public SessionRegistry(DeviceRepository devices, UserDeviceRepository links, UserSessionRepository sessions,
			SignInAlertRepository alerts, DeviceCookie cookie, SecuritySettings settings, Clock clock,
			PlatformTransactionManager transactionManager) {
		this.devices = devices;
		this.links = links;
		this.sessions = sessions;
		this.alerts = alerts;
		this.cookie = cookie;
		this.settings = settings;
		this.clock = clock;
		this.transaction = new TransactionTemplate(transactionManager);
	}

	/** The device this request comes from, if its browser holds a device cookie this server issued. */
	public Optional<Device> recognise(HttpServletRequest request) {
		return cookie.read(request).flatMap(token -> devices.findByTokenHash(Tokens.sha256Hex(token)));
	}

	/**
	 * Opens the session record of a successful sign-in, in one transaction: the device (issuing a device
	 * cookie to a browser that has none), the user's link to it, the record, and a sign-in alert when the
	 * device is new for a user who already has other devices. A passed second step makes the device
	 * trusted for the configured period.
	 */
	public Started start(User user, Optional<Device> recognised, boolean secondStepPassed, ClientInfo client,
			HttpServletResponse response) {
		String[] issuedToken = new String[1];
		Started started = transaction.execute(status -> {
			Instant now = clock.instant();
			Device device = recognised.orElseGet(() -> {
				String token = Tokens.random(32);
				issuedToken[0] = token;
				return devices.save(new Device(Tokens.sha256Hex(token), DeviceLabels.of(client.userAgent()), now));
			});
			UserDevice link = links.findByUserIdAndDeviceId(user.getId(), device.getId()).orElse(null);
			boolean newDevice = link == null || link.isRemoved();
			boolean alert = newDevice && links.existsByUserIdAndRemovedAtIsNullAndDeviceIdNot(user.getId(), device.getId());
			if (link == null) {
				link = new UserDevice(user.getId(), device.getId(), now);
			}
			else {
				link.signedIn(now);
			}
			if (secondStepPassed) {
				link.trustUntil(now.plus(settings.trustedDevicePeriod()));
			}
			links.save(link);
			UserSession session = sessions
				.save(new UserSession(user.getId(), device.getId(), client.ip(), secondStepPassed, now));
			if (alert) {
				alerts.save(new SignInAlert(user.getId(), session.getId(), now));
			}
			return new Started(session.getId(), device.getId(), newDevice);
		});
		if (issuedToken[0] != null) {
			cookie.write(response, issuedToken[0]);
		}
		return started;
	}

	/** Marks the device of this session trusted, e.g. after the second step was confirmed on it. */
	public void trustDeviceOf(UUID userId, UUID sessionId) {
		transaction.executeWithoutResult(status -> sessions.findById(sessionId)
			.flatMap(s -> links.findByUserIdAndDeviceId(userId, s.getDeviceId()))
			.ifPresent(link -> {
				link.trustUntil(clock.instant().plus(settings.trustedDevicePeriod()));
				links.save(link);
			}));
	}

	public void end(UUID sessionId, SessionEndReason reason) {
		sessions.end(sessionId, reason, clock.instant());
	}

	public void endAllForUser(UUID userId, SessionEndReason reason) {
		sessions.endAllForUser(userId, reason, clock.instant());
	}

}
