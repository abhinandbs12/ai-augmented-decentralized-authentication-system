package com.blockauth.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import com.blockauth.MutableClock;
import com.blockauth.admin.EmergencyStopService;
import com.blockauth.audit.AuditService;
import com.blockauth.audit.AuthEventStatus;
import com.blockauth.audit.AuthEventType;
import com.blockauth.auth.AuthController.SignedChallenge;
import com.blockauth.blockchain.OnChainWalletStatus;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;
import com.blockauth.risk.TrustPolicy.Decision;
import com.blockauth.risk.TrustService;
import com.blockauth.secondstep.SecondStepService;
import com.blockauth.session.SessionRegistry;
import com.blockauth.user.User;
import com.blockauth.user.UserRepository;
import com.blockauth.user.UserRole;
import com.blockauth.user.UserService;
import com.blockauth.user.UserService.WalletState;

class LoginServiceTest {

	private static final String WALLET = "0x1234567890abcdef1234567890abcdef12345678";
	private static final Instant NOW = Instant.parse("2026-10-06T16:30:00Z");
	private static final SignedChallenge REQUEST = new SignedChallenge(WALLET, "challenge text", "0xsig");
	private static final OnChainWalletStatus ACTIVE = new OnChainWalletStatus(true, true, NOW);

	private final ChallengeService challenges = mock(ChallengeService.class);
	private final SignatureVerifier signatures = mock(SignatureVerifier.class);
	private final UserService users = mock(UserService.class);
	private final UserRepository userRows = mock(UserRepository.class);
	private final SessionService sessions = mock(SessionService.class);
	private final SessionRegistry devices = mock(SessionRegistry.class);
	private final TrustService trust = mock(TrustService.class);
	private final SecondStepService secondStep = mock(SecondStepService.class);
	private final EmergencyStopService stop = mock(EmergencyStopService.class);
	private final AuditService audit = mock(AuditService.class);
	private final AuthFailureRecorder failures = mock(AuthFailureRecorder.class);
	private final LoginService service = new LoginService(challenges, signatures, users, userRows, sessions, devices,
			trust, secondStep, stop, audit, failures, new MutableClock(NOW));

	private final MockHttpServletRequest http = new MockHttpServletRequest();
	private final MockHttpServletResponse response = new MockHttpServletResponse();
	private final User user = new User(WALLET, UserRole.USER);

	@BeforeEach
	void challengeIsValidAndTrustIsHigh() {
		when(challenges.consume("challenge text", WALLET, ChallengePurpose.LOGIN)).thenReturn(
				new AuthenticationChallenge(WALLET, ChallengePurpose.LOGIN, "nonce", "challenge text", NOW,
						NOW.plusSeconds(120)));
		when(devices.recognise(http)).thenReturn(Optional.empty());
		trustSays(Decision.ALLOW);
	}

	private void trustSays(Decision decision) {
		when(trust.assess(any(), eq(WALLET), any(), any(), anyBoolean()))
			.thenReturn(new TrustService.Assessment(decision == Decision.ALLOW ? 100 : 40, List.of(), decision,
					ErrorCode.LOGIN_RISK_TOO_HIGH));
	}

	@Test
	void registeredActiveWalletGetsASession() {
		when(users.walletState(WALLET)).thenReturn(new WalletState(ACTIVE, Optional.of(user)));

		assertThat(service.login(REQUEST, http, response).user()).isSameAs(user);

		verify(sessions).establish(user, Optional.empty(), false, http, response);
		verify(audit).recordAuthEvent(eq(AuthEventType.LOGIN), eq(AuthEventStatus.SUCCESS), eq(WALLET), any(),
				isNull(), isNull(), any());
		verifyNoInteractions(failures);
	}

	@Test
	void theSignatureIsCheckedAgainstTheStoredChallengeText() {
		when(challenges.consume("challenge text", WALLET, ChallengePurpose.LOGIN)).thenReturn(
				new AuthenticationChallenge(WALLET, ChallengePurpose.LOGIN, "nonce", "text as stored by the server",
						NOW, NOW.plusSeconds(120)));
		when(users.walletState(WALLET)).thenReturn(new WalletState(ACTIVE, Optional.of(user)));

		service.login(REQUEST, http, response);

		verify(signatures).verify("text as stored by the server", "0xsig", WALLET);
	}

	@Test
	void lowTrustWithASecondStepSetUpAsksForItInsteadOfStartingASession() {
		when(users.walletState(WALLET)).thenReturn(new WalletState(ACTIVE, Optional.of(user)));
		trustSays(Decision.SECOND_STEP);

		LoginService.Result result = service.login(REQUEST, http, response);

		assertThat(result.secondStepRequired()).isTrue();
		assertThat(result.secondStepExpiresAt()).isEqualTo(NOW.plusSeconds(300));
		verifyNoInteractions(sessions);
		verify(audit, never()).recordAuthEvent(any(), eq(AuthEventStatus.SUCCESS), any(), any(), any(), any(), any());
	}

	@Test
	void lowTrustWithoutASecondStepIsRefused() {
		when(users.walletState(WALLET)).thenReturn(new WalletState(ACTIVE, Optional.of(user)));
		trustSays(Decision.REFUSE);

		assertRefused(ErrorCode.LOGIN_RISK_TOO_HIGH);
	}

	@Test
	void anEmergencyStopThatBlocksSignInsRefusesUsers() {
		when(users.walletState(WALLET)).thenReturn(new WalletState(ACTIVE, Optional.of(user)));
		doThrow(new BlockAuthException(ErrorCode.EMERGENCY_STOP_ACTIVE)).when(stop).checkSignIn(user);

		assertRefused(ErrorCode.EMERGENCY_STOP_ACTIVE);
		verifyNoInteractions(trust);
	}

	@Test
	void theSecondStepCompletesTheSignInFromTheSameBrowserOnly() {
		when(users.walletState(WALLET)).thenReturn(new WalletState(ACTIVE, Optional.of(user)));
		trustSays(Decision.SECOND_STEP);
		service.login(REQUEST, http, response);
		when(userRows.findById(any())).thenReturn(Optional.of(user));
		when(secondStep.verifyCode(any(), eq("123456"))).thenReturn(true);

		assertThatThrownBy(() -> service.completeSecondStep("123456", new MockHttpServletRequest(), response))
			.extracting(e -> ((BlockAuthException) e).code()).isEqualTo(ErrorCode.SECOND_STEP_EXPIRED);
		assertThatThrownBy(() -> service.completeSecondStep("000000", http, response))
			.extracting(e -> ((BlockAuthException) e).code()).isEqualTo(ErrorCode.SECOND_STEP_INVALID);
		assertThat(service.completeSecondStep("123456", http, response)).isSameAs(user);

		verify(sessions).establish(user, Optional.empty(), true, http, response);
		// The pending sign-in is used up.
		assertThatThrownBy(() -> service.completeSecondStep("123456", http, response))
			.extracting(e -> ((BlockAuthException) e).code()).isEqualTo(ErrorCode.SECOND_STEP_EXPIRED);
	}

	@Test
	void fiveWrongCodesEndThePendingSignIn() {
		when(users.walletState(WALLET)).thenReturn(new WalletState(ACTIVE, Optional.of(user)));
		trustSays(Decision.SECOND_STEP);
		service.login(REQUEST, http, response);
		for (int i = 0; i < 5; i++) {
			assertThatThrownBy(() -> service.completeSecondStep("000000", http, response))
				.extracting(e -> ((BlockAuthException) e).code()).isEqualTo(ErrorCode.SECOND_STEP_INVALID);
		}
		when(secondStep.verifyCode(any(), eq("123456"))).thenReturn(true);

		assertThatThrownBy(() -> service.completeSecondStep("123456", http, response))
			.extracting(e -> ((BlockAuthException) e).code()).isEqualTo(ErrorCode.SECOND_STEP_EXPIRED);
		verifyNoInteractions(sessions);
	}

	@Test
	void unregisteredWalletIsRefused() {
		when(users.walletState(WALLET))
				.thenReturn(new WalletState(new OnChainWalletStatus(false, false, null), Optional.empty()));

		assertRefused(ErrorCode.WALLET_NOT_REGISTERED);
	}

	@Test
	void revokedWalletIsRefused() {
		when(users.walletState(WALLET))
				.thenReturn(new WalletState(new OnChainWalletStatus(true, false, NOW), Optional.of(user)));

		assertRefused(ErrorCode.WALLET_REVOKED);
	}

	@Test
	void unreachableChainFailsClosed() {
		when(users.walletState(WALLET)).thenThrow(new BlockAuthException(ErrorCode.BLOCKCHAIN_UNAVAILABLE));

		assertRefused(ErrorCode.BLOCKCHAIN_UNAVAILABLE);
	}

	@Test
	void walletRegisteredOnChainWithoutUserRowMustFinishRegistration() {
		when(users.walletState(WALLET)).thenReturn(new WalletState(ACTIVE, Optional.empty()));

		assertRefused(ErrorCode.REGISTRATION_INCOMPLETE);
	}

	@Test
	void forgedSignatureNeverReachesTheChain() {
		doThrow(new BlockAuthException(ErrorCode.SIGNATURE_MISMATCH)).when(signatures).verify("challenge text",
				"0xsig", WALLET);

		assertRefused(ErrorCode.SIGNATURE_MISMATCH);
		verifyNoInteractions(users);
	}

	@Test
	void rejectedChallengeSkipsSignatureAndChain() {
		when(challenges.consume("challenge text", WALLET, ChallengePurpose.LOGIN))
				.thenThrow(new BlockAuthException(ErrorCode.CHALLENGE_ALREADY_USED));

		assertRefused(ErrorCode.CHALLENGE_ALREADY_USED);
		verifyNoInteractions(signatures, users);
	}

	@Test
	void malformedAddressIsRejectedBeforeTheChallengeIsTouched() {
		SignedChallenge malformed = new SignedChallenge("0x123", "challenge text", "0xsig");

		assertThatThrownBy(() -> service.login(malformed, http, response)).isInstanceOf(BlockAuthException.class)
				.extracting(e -> ((BlockAuthException) e).code()).isEqualTo(ErrorCode.VALIDATION_FAILED);
		verifyNoInteractions(challenges, sessions, failures);
	}

	private void assertRefused(ErrorCode expected) {
		assertThatThrownBy(() -> service.login(REQUEST, http, response)).isInstanceOf(BlockAuthException.class)
				.extracting(e -> ((BlockAuthException) e).code()).isEqualTo(expected);
		verifyNoInteractions(sessions);
		verify(failures).record(eq(AuthEventType.LOGIN), eq(WALLET), any(), any());
		verify(audit, never()).recordAuthEvent(any(), eq(AuthEventStatus.SUCCESS), any(), any(), any(), any(), any());
	}

}
