package com.blockauth.admin;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.blockauth.audit.AuditService;
import com.blockauth.audit.AuthEventStatus;
import com.blockauth.audit.AuthEventType;
import com.blockauth.audit.ClientInfo;
import com.blockauth.auth.StepUpAction;
import com.blockauth.auth.StepUpDetails;
import com.blockauth.auth.StepUpProof;
import com.blockauth.auth.StepUpService;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;
import com.blockauth.security.BlockAuthPrincipal;
import com.blockauth.session.SessionEndReason;
import com.blockauth.session.UserSessionRepository;
import com.blockauth.user.User;
import com.blockauth.user.UserRole;

/**
 * The emergency stop. While on, the server refuses new registrations, wallet reactivations,
 * second-step resets, removing a wallet's suspicious flag and creating API keys; optionally also new
 * sign-ins by users. Administrators can always sign in, revoking a wallet stays possible for
 * containment, and lifting the stop is itself a delayed action. It controls this application only:
 * the contract can still be called directly with the operator key.
 */
@Service
public class EmergencyStopService {

	public record State(boolean active, boolean blockLogins, String reason, UUID changedBy, Instant changedAt) {
	}

	private static final Pattern REASON = Pattern.compile("^[\\p{L}\\p{N} .,:;!?()'_/-]{3,200}$");

	private final EmergencyStopRepository stops;
	private final UserSessionRepository sessions;
	private final StepUpService stepUp;
	private final AuditService audit;
	private final Clock clock;
	private final TransactionTemplate transaction;

	public EmergencyStopService(EmergencyStopRepository stops, UserSessionRepository sessions, StepUpService stepUp,
			AuditService audit, Clock clock, PlatformTransactionManager transactionManager) {
		this.stops = stops;
		this.sessions = sessions;
		this.stepUp = stepUp;
		this.audit = audit;
		this.clock = clock;
		this.transaction = new TransactionTemplate(transactionManager);
	}

	public State state() {
		EmergencyStop stop = current();
		return new State(stop.isActive(), stop.isBlockLogins(), stop.isActive() ? stop.getReason() : null,
				stop.getChangedBy(), stop.getChangedAt());
	}

	public boolean isActive() {
		return current().isActive();
	}

	/** @throws BlockAuthException EMERGENCY_STOP_ACTIVE while the stop is on */
	public void requireInactive() {
		if (isActive()) {
			throw new BlockAuthException(ErrorCode.EMERGENCY_STOP_ACTIVE);
		}
	}

	/** Refuses a user's sign-in while the stop is on with sign-ins blocked. Administrators are never refused. */
	public void checkSignIn(User user) {
		EmergencyStop stop = current();
		if (stop.isActive() && stop.isBlockLogins() && user.getRole() != UserRole.ADMIN) {
			throw new BlockAuthException(ErrorCode.EMERGENCY_STOP_ACTIVE);
		}
	}

	public void activate(BlockAuthPrincipal admin, String reason, boolean blockLogins, boolean endUserSessions,
			StepUpProof proof, ClientInfo client) {
		if (reason == null || !REASON.matcher(reason).matches()) {
			throw BlockAuthException.invalid("reason", "must be 3-200 characters of text");
		}
		if (isActive()) {
			throw new BlockAuthException(ErrorCode.EMERGENCY_STOP_ALREADY_ACTIVE);
		}
		stepUp.verify(admin, StepUpAction.START_EMERGENCY_STOP, StepUpDetails.emergencyStop(blockLogins, endUserSessions),
				proof, client);
		Instant now = clock.instant();
		transaction.executeWithoutResult(status -> {
			// Checked again under the row lock: of two concurrent requests only one switches it on.
			EmergencyStop stop = stops.lockCurrent().orElseThrow();
			if (stop.isActive()) {
				throw new BlockAuthException(ErrorCode.EMERGENCY_STOP_ALREADY_ACTIVE);
			}
			stop.switchOn(blockLogins, reason, admin.userId(), now);
			stops.save(stop);
			if (endUserSessions) {
				sessions.endAllForRole(UserRole.USER, SessionEndReason.EMERGENCY_STOP, now);
			}
		});
		audit.recordAuthEvent(AuthEventType.EMERGENCY_STOP_ON, AuthEventStatus.SUCCESS, admin.walletAddress(), null,
				admin.userId(), null, client);
	}

	/** Carried out by the delayed action that an administrator requested. */
	void lift(UUID requestedBy, String requesterWallet) {
		boolean lifted = Boolean.TRUE.equals(transaction.execute(status -> {
			EmergencyStop stop = stops.lockCurrent().orElseThrow();
			if (!stop.isActive()) {
				return false;
			}
			stop.switchOff(requestedBy, clock.instant());
			stops.save(stop);
			return true;
		}));
		if (!lifted) {
			return;
		}
		audit.recordAuthEvent(AuthEventType.EMERGENCY_STOP_OFF, AuthEventStatus.SUCCESS, requesterWallet, null,
				requestedBy, null, new ClientInfo(null, null));
	}

	private EmergencyStop current() {
		return stops.findById(EmergencyStop.ID).orElseGet(EmergencyStop::inactive);
	}

}
