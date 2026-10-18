package com.blockauth.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

import com.blockauth.TestProperties;
import com.blockauth.blockchain.OnChainWalletStatus;
import com.blockauth.blockchain.WalletRegistryClient;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;

class UserServiceTest {

	private static final String ADMIN_WALLET = "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed";
	private static final String USER_WALLET = "0x1234567890abcdef1234567890abcdef12345678";

	private final UserRepository repository = mock(UserRepository.class);
	private final WalletRegistryClient registry = mock(WalletRegistryClient.class);
	// Configured in checksummed (mixed) case to prove matching is case-insensitive.
	private final UserService service = new UserService(repository, registry,
			TestProperties.with("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"));

	@Test
	void listedWalletBecomesAdminAllOthersUser() {
		when(repository.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));

		assertThat(service.create(ADMIN_WALLET).getRole()).isEqualTo(UserRole.ADMIN);
		assertThat(service.create(USER_WALLET).getRole()).isEqualTo(UserRole.USER);
		assertThat(service.create(USER_WALLET).getStatus()).isEqualTo(UserStatus.ACTIVE);
	}

	@Test
	void losingAConcurrentInsertReportsAlreadyRegistered() {
		when(repository.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("uq_users_wallet"));

		assertThatThrownBy(() -> service.create(USER_WALLET)).isInstanceOf(BlockAuthException.class)
				.extracting(e -> ((BlockAuthException) e).code()).isEqualTo(ErrorCode.WALLET_ALREADY_REGISTERED);
	}

	@Test
	void chainReadCorrectsAStaleMirror() {
		User user = new User(USER_WALLET, UserRole.USER);
		when(repository.findByWalletAddress(USER_WALLET)).thenReturn(Optional.of(user));
		when(repository.save(user)).thenReturn(user);
		when(registry.getWalletStatus(USER_WALLET)).thenReturn(new OnChainWalletStatus(true, false, Instant.EPOCH));

		UserService.WalletState state = service.walletState(USER_WALLET);

		assertThat(state.chain().active()).isFalse();
		assertThat(state.user()).containsSame(user);
		assertThat(user.getStatus()).isEqualTo(UserStatus.REVOKED);
		verify(repository).save(user);
	}

	@Test
	void walletWithoutUserRowHasNoMirrorToCorrect() {
		when(repository.findByWalletAddress(USER_WALLET)).thenReturn(Optional.empty());
		when(registry.getWalletStatus(USER_WALLET)).thenReturn(new OnChainWalletStatus(true, true, Instant.EPOCH));

		assertThat(service.walletState(USER_WALLET).user()).isEmpty();
		assertThat(service.setStatus(USER_WALLET, UserStatus.REVOKED)).isEmpty();
		verify(repository, never()).save(any());
	}

	@Test
	void chainReadLeavesAConsistentOrUnregisteredMirrorAlone() {
		User user = new User(USER_WALLET, UserRole.USER);
		when(repository.findByWalletAddress(USER_WALLET)).thenReturn(Optional.of(user));
		when(registry.getWalletStatus(USER_WALLET)).thenReturn(new OnChainWalletStatus(true, true, Instant.EPOCH),
				new OnChainWalletStatus(false, false, null));

		service.chainStatus(USER_WALLET);
		service.chainStatus(USER_WALLET);

		assertThat(user.getStatus()).isEqualTo(UserStatus.ACTIVE);
		verify(repository, never()).save(any());
	}

}
