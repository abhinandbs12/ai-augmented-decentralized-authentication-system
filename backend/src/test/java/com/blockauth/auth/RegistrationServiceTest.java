package com.blockauth.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

import com.blockauth.admin.EmergencyStopService;
import com.blockauth.audit.AuditService;
import com.blockauth.audit.AuthEventStatus;
import com.blockauth.audit.AuthEventType;
import com.blockauth.audit.ClientInfo;
import com.blockauth.auth.AuthController.RegistrationResponse;
import com.blockauth.auth.AuthController.SignedChallenge;
import com.blockauth.blockchain.OnChainWalletStatus;
import com.blockauth.blockchain.WalletRegistryClient;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;
import com.blockauth.user.User;
import com.blockauth.user.UserRole;
import com.blockauth.user.UserService;
import com.blockauth.user.UserService.WalletState;
import com.blockauth.user.UserStatus;

/** Every row of the registration decision table, plus revert-then-re-read and partial failures. */
class RegistrationServiceTest {

	private static final String WALLET = "0x1234567890abcdef1234567890abcdef12345678";
	private static final Instant REGISTERED_AT = Instant.parse("2026-10-06T16:30:00Z");
	private static final OnChainWalletStatus NOT_REGISTERED = new OnChainWalletStatus(false, false, null);
	private static final OnChainWalletStatus ACTIVE = new OnChainWalletStatus(true, true, REGISTERED_AT);
	private static final OnChainWalletStatus REVOKED = new OnChainWalletStatus(true, false, REGISTERED_AT);
	private static final ClientInfo CLIENT = new ClientInfo("127.0.0.1", "JUnit");
	private static final SignedChallenge REQUEST = new SignedChallenge(WALLET, "challenge text", "0xsig");

	private final ChallengeService challenges = mock(ChallengeService.class);
	private final SignatureVerifier signatures = mock(SignatureVerifier.class);
	private final WalletRegistryClient registry = mock(WalletRegistryClient.class);
	private final UserService users = mock(UserService.class);
	private final AuditService audit = mock(AuditService.class);
	private final AuthFailureRecorder failures = mock(AuthFailureRecorder.class);
	private final RegistrationService service = new RegistrationService(challenges, signatures, registry, users,
			audit, failures, mock(EmergencyStopService.class));

	@BeforeEach
	void challengeAndSignatureAreValid() {
		when(challenges.consume("challenge text", WALLET, ChallengePurpose.REGISTRATION)).thenReturn(
				new AuthenticationChallenge(WALLET, ChallengePurpose.REGISTRATION, "nonce", "challenge text",
						REGISTERED_AT, REGISTERED_AT.plusSeconds(120)));
		when(users.create(WALLET)).thenAnswer(call -> new User(WALLET, UserRole.USER));
	}

	@Test
	void newWalletIsRegisteredOnChainThenStored() {
		given(NOT_REGISTERED, null);
		when(registry.registerWallet(WALLET)).thenReturn("0xtx");
		when(registry.getWalletStatus(WALLET)).thenReturn(ACTIVE);

		RegistrationResponse response = service.register(REQUEST, CLIENT);

		assertThat(response.transactionHash()).isEqualTo("0xtx");
		assertThat(response.status()).isEqualTo(UserStatus.ACTIVE);
		assertThat(response.role()).isEqualTo(UserRole.USER);
		assertThat(response.registeredAt()).isEqualTo(REGISTERED_AT);
		verify(users).create(WALLET);
		verify(audit).recordAuthEvent(eq(AuthEventType.REGISTRATION), eq(AuthEventStatus.SUCCESS), eq(WALLET), any(),
				isNull(), isNull(), eq(CLIENT));
	}

	@Test
	void chainResetWithActiveRowReRegistersAndKeepsTheRow() {
		given(NOT_REGISTERED, new User(WALLET, UserRole.USER));
		when(registry.registerWallet(WALLET)).thenReturn("0xtx");
		when(registry.getWalletStatus(WALLET)).thenReturn(ACTIVE);

		assertThat(service.register(REQUEST, CLIENT).transactionHash()).isEqualTo("0xtx");
		verify(users, never()).create(any());
	}

	@Test
	void chainResetNeverReactivatesARevokedRow() {
		User revoked = new User(WALLET, UserRole.USER);
		revoked.setStatus(UserStatus.REVOKED);
		given(NOT_REGISTERED, revoked);

		assertFails(ErrorCode.STATE_CONFLICT);
		verify(registry, never()).registerWallet(any());
	}

	@Test
	void registeredOnChainWithoutRowCompletesAnEarlierPartialFailure() {
		given(ACTIVE, null);

		RegistrationResponse response = service.register(REQUEST, CLIENT);

		assertThat(response.transactionHash()).isNull();
		verify(registry, never()).registerWallet(any());
		verify(users).create(WALLET);
	}

	@Test
	void alreadyRegisteredWalletSendsNoTransaction() {
		given(ACTIVE, new User(WALLET, UserRole.USER));

		assertFails(ErrorCode.WALLET_ALREADY_REGISTERED);
		verify(registry, never()).registerWallet(any());
		verify(users, never()).create(any());
	}

	@Test
	void revokedWalletCannotRegisterAgain() {
		given(REVOKED, null);

		assertFails(ErrorCode.WALLET_REVOKED);
		verify(registry, never()).registerWallet(any());
		verify(users, never()).create(any());
	}

	@Test
	void revertBecauseAConcurrentRequestRegisteredFirstStillSucceeds() {
		when(users.walletState(WALLET)).thenReturn(new WalletState(NOT_REGISTERED, Optional.empty()),
				new WalletState(ACTIVE, Optional.empty()));
		when(registry.registerWallet(WALLET)).thenThrow(new BlockAuthException(ErrorCode.BLOCKCHAIN_TX_FAILED));

		RegistrationResponse response = service.register(REQUEST, CLIENT);

		assertThat(response.transactionHash()).isNull();
		verify(users).create(WALLET);
	}

	@Test
	void revertAfterTheOtherRequestAlsoStoredTheUserIsAConflict() {
		when(users.walletState(WALLET)).thenReturn(new WalletState(NOT_REGISTERED, Optional.empty()),
				new WalletState(ACTIVE, Optional.of(new User(WALLET, UserRole.USER))));
		when(registry.registerWallet(WALLET)).thenThrow(new BlockAuthException(ErrorCode.BLOCKCHAIN_TX_FAILED));

		assertFails(ErrorCode.WALLET_ALREADY_REGISTERED);
		verify(users, never()).create(any());
	}

	@Test
	void unexplainedRevertIsReportedAsTransactionFailure() {
		given(NOT_REGISTERED, null);
		when(registry.registerWallet(WALLET)).thenThrow(new BlockAuthException(ErrorCode.BLOCKCHAIN_TX_FAILED));

		assertFails(ErrorCode.BLOCKCHAIN_TX_FAILED);
		verify(users, never()).create(any());
	}

	@Test
	void unconfirmedTransactionIsATimeoutAndStoresNothing() {
		given(NOT_REGISTERED, null);
		when(registry.registerWallet(WALLET)).thenThrow(new BlockAuthException(ErrorCode.BLOCKCHAIN_TIMEOUT));

		assertFails(ErrorCode.BLOCKCHAIN_TIMEOUT);
		verify(users, never()).create(any());
	}

	@Test
	void unavailableChainWritesNothing() {
		when(users.walletState(WALLET)).thenThrow(new BlockAuthException(ErrorCode.BLOCKCHAIN_UNAVAILABLE));

		assertFails(ErrorCode.BLOCKCHAIN_UNAVAILABLE);
		verify(registry, never()).registerWallet(any());
		verify(users, never()).create(any());
	}

	@Test
	void databaseFailureAfterTheChainWriteSurfacesSoARetryCanReconcile() {
		given(NOT_REGISTERED, null);
		when(registry.registerWallet(WALLET)).thenReturn("0xtx");
		when(registry.getWalletStatus(WALLET)).thenReturn(ACTIVE);
		when(users.create(WALLET)).thenThrow(new DataAccessResourceFailureException("connection lost"));

		// Not swallowed and not reported as success: the handler turns it into 503 DATABASE_UNAVAILABLE.
		assertThatThrownBy(() -> service.register(REQUEST, CLIENT))
				.isInstanceOf(DataAccessResourceFailureException.class);
		verify(audit, never()).recordAuthEvent(any(), any(), any(), any(), any(), any(), any());
	}

	@Test
	void forgedSignatureNeverReachesTheChain() {
		doThrow(new BlockAuthException(ErrorCode.SIGNATURE_MISMATCH)).when(signatures).verify("challenge text",
				"0xsig", WALLET);

		assertFails(ErrorCode.SIGNATURE_MISMATCH);
		verifyNoInteractions(registry, users);
	}

	private void given(OnChainWalletStatus chain, User row) {
		when(users.walletState(WALLET)).thenReturn(new WalletState(chain, Optional.ofNullable(row)));
	}

	private void assertFails(ErrorCode expected) {
		assertThatThrownBy(() -> service.register(REQUEST, CLIENT)).isInstanceOf(BlockAuthException.class)
				.extracting(e -> ((BlockAuthException) e).code()).isEqualTo(expected);
		verify(failures).record(eq(AuthEventType.REGISTRATION), eq(WALLET), any(), eq(CLIENT));
		verify(audit, never()).recordAuthEvent(any(), any(), any(), any(), any(), any(), any());
	}

}
