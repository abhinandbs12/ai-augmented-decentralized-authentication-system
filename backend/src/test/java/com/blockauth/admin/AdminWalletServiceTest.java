package com.blockauth.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.test.util.ReflectionTestUtils;

import com.blockauth.admin.AdminWalletService.WalletChangeResponse;
import com.blockauth.audit.AuditService;
import com.blockauth.audit.AuthEventStatus;
import com.blockauth.audit.AuthEventType;
import com.blockauth.audit.ClientInfo;
import com.blockauth.auth.StepUpAction;
import com.blockauth.auth.StepUpProof;
import com.blockauth.auth.StepUpService;
import com.blockauth.blockchain.OnChainWalletStatus;
import com.blockauth.blockchain.WalletRegistryClient;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;
import com.blockauth.security.BlockAuthPrincipal;
import com.blockauth.session.SessionEndReason;
import com.blockauth.session.SessionRegistry;
import com.blockauth.user.User;
import com.blockauth.user.UserRole;
import com.blockauth.user.UserService;
import com.blockauth.user.UserStatus;

class AdminWalletServiceTest {

	private static final String ADMIN_WALLET = "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed";
	private static final String TARGET = "0x1234567890abcdef1234567890abcdef12345678";
	private static final String TARGET_CHECKSUM = "0x1234567890AbcdEF1234567890aBcdef12345678";
	private static final OnChainWalletStatus NOT_REGISTERED = new OnChainWalletStatus(false, false, null);
	private static final OnChainWalletStatus ACTIVE = new OnChainWalletStatus(true, true, Instant.EPOCH);
	private static final OnChainWalletStatus REVOKED = new OnChainWalletStatus(true, false, Instant.EPOCH);
	private static final ClientInfo CLIENT = new ClientInfo("127.0.0.1", "JUnit");
	private static final StepUpProof PROOF = new StepUpProof("challenge", "0x" + "00".repeat(65));

	private final BlockAuthPrincipal admin = new BlockAuthPrincipal(UUID.randomUUID(), ADMIN_WALLET, UUID.randomUUID());
	private final WalletRegistryClient registry = mock(WalletRegistryClient.class);
	private final UserService users = mock(UserService.class);
	private final AuditService audit = mock(AuditService.class);
	private final StepUpService stepUp = mock(StepUpService.class);
	private final SessionRegistry sessions = mock(SessionRegistry.class);
	private final AdminWalletService service = new AdminWalletService(registry, users, audit, stepUp, sessions);

	@Test
	void revokeChecksTheFreshSignatureThenWritesChainMirrorSessionsAndAuditsTheActor() {
		User target = user();
		when(users.chainStatus(TARGET)).thenReturn(ACTIVE);
		when(registry.revokeWallet(TARGET)).thenReturn("0xtx");
		when(users.setStatus(TARGET, UserStatus.REVOKED)).thenReturn(Optional.of(target));

		WalletChangeResponse response = service.revoke(admin, TARGET, PROOF, CLIENT);

		assertThat(response.status()).isEqualTo(UserStatus.REVOKED);
		assertThat(response.transactionHash()).isEqualTo("0xtx");
		InOrder order = inOrder(stepUp, registry, users, sessions, audit);
		order.verify(stepUp).verify(admin, StepUpAction.REVOKE_WALLET, TARGET_CHECKSUM, PROOF, CLIENT);
		order.verify(registry).revokeWallet(TARGET);
		order.verify(users).setStatus(TARGET, UserStatus.REVOKED);
		order.verify(sessions).endAllForUser(target.getId(), SessionEndReason.WALLET_REVOKED);
		order.verify(audit).recordAuthEvent(AuthEventType.WALLET_REVOKED, AuthEventStatus.SUCCESS, TARGET,
				target.getId(), admin.userId(), null, CLIENT);
	}

	@Test
	void aFailedFreshSignatureSendsNoTransaction() {
		when(users.chainStatus(TARGET)).thenReturn(ACTIVE);
		doThrow(new BlockAuthException(ErrorCode.STEP_UP_FAILED)).when(stepUp)
			.verify(admin, StepUpAction.REVOKE_WALLET, TARGET_CHECKSUM, PROOF, CLIENT);

		assertFails(() -> service.revoke(admin, TARGET, PROOF, CLIENT), ErrorCode.STEP_UP_FAILED);
		verifyNoInteractions(registry, sessions);
	}

	@Test
	void adminCannotChangeOwnWallet() {
		assertFails(() -> service.revoke(admin, ADMIN_WALLET, PROOF, CLIENT), ErrorCode.CANNOT_MODIFY_OWN_WALLET);
		assertFails(() -> service.revoke(admin, "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", PROOF, CLIENT),
				ErrorCode.CANNOT_MODIFY_OWN_WALLET);
		assertFails(() -> service.checkCanActivate(admin, ADMIN_WALLET), ErrorCode.CANNOT_MODIFY_OWN_WALLET);
		verifyNoInteractions(registry, users, audit, stepUp);
	}

	@Test
	void unregisteredWalletIsNotFound() {
		when(users.chainStatus(TARGET)).thenReturn(NOT_REGISTERED);

		assertFails(() -> service.revoke(admin, TARGET, PROOF, CLIENT), ErrorCode.WALLET_NOT_FOUND);
		assertFails(() -> service.checkCanActivate(admin, TARGET), ErrorCode.WALLET_NOT_FOUND);
		verifyNoInteractions(registry, audit, stepUp);
	}

	@Test
	void walletAlreadyInTargetStateSendsNoTransaction() {
		when(users.chainStatus(TARGET)).thenReturn(REVOKED);
		assertFails(() -> service.revoke(admin, TARGET, PROOF, CLIENT), ErrorCode.WALLET_ALREADY_REVOKED);

		when(users.chainStatus(TARGET)).thenReturn(ACTIVE);
		assertFails(() -> service.checkCanActivate(admin, TARGET), ErrorCode.WALLET_ALREADY_ACTIVE);
		verifyNoInteractions(registry, audit, stepUp);
	}

	@Test
	void revertAfterAConcurrentRevokeIsReportedAsAlreadyRevoked() {
		when(users.chainStatus(TARGET)).thenReturn(ACTIVE, REVOKED);
		when(registry.revokeWallet(TARGET)).thenThrow(new BlockAuthException(ErrorCode.BLOCKCHAIN_TX_FAILED));

		assertFails(() -> service.revoke(admin, TARGET, PROOF, CLIENT), ErrorCode.WALLET_ALREADY_REVOKED);
		verifyNoInteractions(audit, sessions);
	}

	@Test
	void unexplainedRevertAndTimeoutLeaveTheMirrorAloneAndAreAuditedWithTheActor() {
		when(users.chainStatus(TARGET)).thenReturn(ACTIVE);
		when(registry.revokeWallet(TARGET)).thenThrow(new BlockAuthException(ErrorCode.BLOCKCHAIN_TX_FAILED),
				new BlockAuthException(ErrorCode.BLOCKCHAIN_TIMEOUT));

		assertFails(() -> service.revoke(admin, TARGET, PROOF, CLIENT), ErrorCode.BLOCKCHAIN_TX_FAILED);
		assertFails(() -> service.revoke(admin, TARGET, PROOF, CLIENT), ErrorCode.BLOCKCHAIN_TIMEOUT);
		verify(users, never()).setStatus(any(), any());
		// The timed-out transaction may still be mined: the log must be able to say who sent it.
		verify(audit).recordAuthEvent(AuthEventType.WALLET_REVOKED, AuthEventStatus.FAILURE, TARGET, null,
				admin.userId(), ErrorCode.BLOCKCHAIN_TX_FAILED, CLIENT);
		verify(audit).recordAuthEvent(AuthEventType.WALLET_REVOKED, AuthEventStatus.FAILURE, TARGET, null,
				admin.userId(), ErrorCode.BLOCKCHAIN_TIMEOUT, CLIENT);
	}

	@Test
	void delayedActivationIsSafeToRunTwice() {
		UUID requester = UUID.randomUUID();
		when(users.chainStatus(TARGET)).thenReturn(REVOKED, ACTIVE);
		when(registry.activateWallet(TARGET)).thenReturn("0xtx");
		when(users.setStatus(TARGET, UserStatus.ACTIVE)).thenReturn(Optional.empty());

		service.executeActivation(TARGET, requester, ADMIN_WALLET);
		service.executeActivation(TARGET, requester, ADMIN_WALLET);

		// One transaction: the second run finds the wallet already active.
		verify(registry).activateWallet(TARGET);
		verify(audit).recordAuthEvent(AuthEventType.WALLET_ACTIVATED, AuthEventStatus.SUCCESS, TARGET, null, requester,
				null, new ClientInfo(null, null));
	}

	@Test
	void malformedAddressIsRejectedBeforeAnything() {
		assertFails(() -> service.revoke(admin, "0x123;DROP TABLE users;--", PROOF, CLIENT), ErrorCode.VALIDATION_FAILED);
		verifyNoInteractions(registry, users, audit, stepUp);
	}

	private static User user() {
		User target = new User(TARGET, UserRole.USER);
		ReflectionTestUtils.setField(target, "id", UUID.randomUUID());
		return target;
	}

	private static void assertFails(Runnable action, ErrorCode expected) {
		assertThatThrownBy(action::run).isInstanceOf(BlockAuthException.class)
			.extracting(e -> ((BlockAuthException) e).code())
			.isEqualTo(expected);
	}

}
