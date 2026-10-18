package com.blockauth.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.blockauth.admin.EmergencyStopService;
import com.blockauth.audit.AuditService;
import com.blockauth.audit.AuthEventStatus;
import com.blockauth.audit.AuthEventType;
import com.blockauth.audit.ClientInfo;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;
import com.blockauth.common.WalletAddresses;
import com.blockauth.risk.TrustService;
import com.blockauth.secondstep.SecondStepService;
import com.blockauth.security.ClientInfoResolver;
import com.blockauth.session.Device;
import com.blockauth.session.SessionRegistry;
import com.blockauth.user.User;
import com.blockauth.user.UserRepository;
import com.blockauth.user.UserService;
import com.blockauth.user.UserService.WalletState;
import com.blockauth.user.UserStatus;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Service
public class LoginService {

	/** Either a session was started, or the second step is still owed (then {@code user} is null). */
	public record Result(User user, Instant secondStepExpiresAt) {

		public boolean secondStepRequired() {
			return user == null;
		}

	}

	private static final Logger log = LoggerFactory.getLogger(LoginService.class);
	private static final Duration SECOND_STEP_WINDOW = Duration.ofMinutes(5);

	private final ChallengeService challenges;
	private final SignatureVerifier signatures;
	private final UserService users;
	private final UserRepository userRows;
	private final SessionService sessions;
	private final SessionRegistry devices;
	private final TrustService trust;
	private final SecondStepService secondStep;
	private final EmergencyStopService stop;
	private final AuditService audit;
	private final AuthFailureRecorder failures;
	private final Clock clock;

	public LoginService(ChallengeService challenges, SignatureVerifier signatures, UserService users,
			UserRepository userRows, SessionService sessions, SessionRegistry devices, TrustService trust,
			SecondStepService secondStep, EmergencyStopService stop, AuditService audit, AuthFailureRecorder failures,
			Clock clock) {
		this.challenges = challenges;
		this.signatures = signatures;
		this.users = users;
		this.userRows = userRows;
		this.sessions = sessions;
		this.devices = devices;
		this.trust = trust;
		this.secondStep = secondStep;
		this.stop = stop;
		this.audit = audit;
		this.failures = failures;
		this.clock = clock;
	}

	/**
	 * Challenge, then signature, then on-chain status, then the trust score, and only then a session
	 * (or, when the score asks for it, the second step). Why a wallet was refused is disclosed only
	 * after the caller proved control of its key. Any step that cannot give a positive answer ends the
	 * attempt: there is no fallback path.
	 */
	public Result login(AuthController.SignedChallenge request, HttpServletRequest http, HttpServletResponse response) {
		String wallet = WalletAddresses.normalize(request.walletAddress(), "walletAddress");
		ClientInfo client = ClientInfoResolver.resolve(http);
		try {
			AuthenticationChallenge challenge = challenges.consume(request.challenge(), wallet,
					ChallengePurpose.LOGIN);
			// Verified against the stored text, never against anything the client sent back.
			signatures.verify(challenge.getChallenge(), request.signature(), wallet);
			WalletState state = users.walletState(wallet);
			if (!state.chain().registered()) {
				throw new BlockAuthException(ErrorCode.WALLET_NOT_REGISTERED);
			}
			if (!state.chain().active()) {
				throw new BlockAuthException(ErrorCode.WALLET_REVOKED);
			}
			User user = state.user().orElseThrow(() -> new BlockAuthException(ErrorCode.REGISTRATION_INCOMPLETE));
			stop.checkSignIn(user);

			Optional<Device> device = devices.recognise(http);
			boolean enrolled = secondStep.isEnabled(user.getId());
			TrustService.Assessment assessment = trust.assess(user.getId(), wallet,
					device.map(Device::getId).orElse(null), client.ip(), enrolled);
			switch (assessment.decision()) {
				case REFUSE -> throw new BlockAuthException(assessment.failure());
				case SECOND_STEP -> {
					Instant expiresAt = clock.instant().plus(SECOND_STEP_WINDOW);
					PendingSecondStep.begin(http.getSession(true), user.getId(), wallet, expiresAt);
					log.info("Second step requested for wallet {} (trust score {})", wallet, assessment.score());
					return new Result(null, expiresAt);
				}
				case ALLOW -> {
					return signIn(user, device, false, http, response, client);
				}
				default -> throw new IllegalStateException();
			}
		}
		catch (BlockAuthException e) {
			failures.record(AuthEventType.LOGIN, wallet, e, client);
			throw e;
		}
	}

	/**
	 * Completes a sign-in that is waiting for its second step, from the same browser. Five wrong codes
	 * or five minutes end the attempt; the wallet must then sign again.
	 */
	public User completeSecondStep(String code, HttpServletRequest http, HttpServletResponse response) {
		ClientInfo client = ClientInfoResolver.resolve(http);
		PendingSecondStep pending = PendingSecondStep.of(http.getSession(false));
		String wallet = pending == null ? null : pending.wallet();
		try {
			if (pending == null || pending.expired(clock.instant()) || !pending.tryAttempt()) {
				PendingSecondStep.clear(http.getSession(false));
				throw new BlockAuthException(ErrorCode.SECOND_STEP_EXPIRED);
			}
			if (!secondStep.verifyCode(pending.userId(), code)) {
				throw new BlockAuthException(ErrorCode.SECOND_STEP_INVALID);
			}
			PendingSecondStep.clear(http.getSession(false));
			// The wallet may have been revoked, or the stop switched on, since it signed.
			User user = userRows.findById(pending.userId())
				.filter(u -> u.getStatus() == UserStatus.ACTIVE)
				.orElseThrow(() -> new BlockAuthException(ErrorCode.WALLET_REVOKED));
			stop.checkSignIn(user);
			audit.recordAuthEvent(AuthEventType.SECOND_STEP, AuthEventStatus.SUCCESS, wallet, user.getId(), null, null,
					client);
			return signIn(user, devices.recognise(http), true, http, response, client).user();
		}
		catch (BlockAuthException e) {
			failures.record(AuthEventType.SECOND_STEP, wallet, e, client);
			throw e;
		}
	}

	private Result signIn(User user, Optional<Device> device, boolean secondStepPassed, HttpServletRequest http,
			HttpServletResponse response, ClientInfo client) {
		sessions.establish(user, device, secondStepPassed, http, response);
		audit.recordAuthEvent(AuthEventType.LOGIN, AuthEventStatus.SUCCESS, user.getWalletAddress(), user.getId(), null,
				null, client);
		log.info("Login succeeded for wallet {}", user.getWalletAddress());
		return new Result(user, null);
	}

}
