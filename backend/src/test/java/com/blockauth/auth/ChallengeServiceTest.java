package com.blockauth.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;

import com.blockauth.MutableClock;
import com.blockauth.TestProperties;
import com.blockauth.audit.AuditService;
import com.blockauth.audit.AuthEventType;
import com.blockauth.audit.ClientInfo;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;
import com.blockauth.security.InMemoryRateLimiter;

class ChallengeServiceTest {

	private static final String WALLET = "0x1234567890abcdef1234567890abcdef12345678";
	private static final String OTHER = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
	private static final ClientInfo CLIENT = new ClientInfo("127.0.0.1", "JUnit");

	private final MutableClock clock = new MutableClock(Instant.parse("2026-10-06T16:30:00Z"));
	private final AuthenticationChallengeRepository repository = mock(AuthenticationChallengeRepository.class);
	private final AuditService audit = mock(AuditService.class);
	private final ChallengeMessageFactory factory = new ChallengeMessageFactory(clock, TestProperties.with());
	// A mocked transaction manager makes each TransactionTemplate simply run its callback.
	private final ChallengeService service = new ChallengeService(repository, factory, new InMemoryRateLimiter(clock),
			audit, clock, mock(PlatformTransactionManager.class));

	@Test
	void issuesAndStoresAChallenge() {
		when(repository.save(any())).thenAnswer(call -> call.getArgument(0));

		AuthenticationChallenge challenge = service.issue(WALLET, ChallengePurpose.LOGIN, CLIENT);

		assertThat(challenge.getWalletAddress()).isEqualTo(WALLET);
		assertThat(challenge.getPurpose()).isEqualTo(ChallengePurpose.LOGIN);
		verify(repository).save(challenge);
		verifyNoInteractions(audit);
	}

	@Test
	void limitsEachClientToFiveChallengesPerWalletPerMinute() {
		when(repository.save(any())).thenAnswer(call -> call.getArgument(0));
		for (int i = 0; i < 5; i++) {
			service.issue(WALLET, ChallengePurpose.LOGIN, CLIENT);
		}

		assertThatThrownBy(() -> service.issue(WALLET, ChallengePurpose.LOGIN, CLIENT))
				.isInstanceOf(BlockAuthException.class).satisfies(e -> {
					assertThat(((BlockAuthException) e).code()).isEqualTo(ErrorCode.RATE_LIMITED);
					assertThat(((BlockAuthException) e).retryAfterSeconds()).isPositive();
				});
		verify(audit).recordFailure(AuthEventType.LOGIN, WALLET, ErrorCode.RATE_LIMITED, CLIENT);
		verify(repository, times(5)).save(any());
		assertThat(service.issue(OTHER, ChallengePurpose.LOGIN, CLIENT)).isNotNull();
		// Someone else requesting challenges for a wallet must not be able to lock its owner out.
		assertThat(service.issue(WALLET, ChallengePurpose.LOGIN, new ClientInfo("203.0.113.9", "JUnit"))).isNotNull();

		clock.advance(Duration.ofMinutes(1));
		assertThat(service.issue(WALLET, ChallengePurpose.LOGIN, CLIENT)).isNotNull();
	}

	@Test
	void consumesAnUnusedUnexpiredChallenge() {
		AuthenticationChallenge stored = stored(ChallengePurpose.LOGIN);
		when(repository.consume(1L, clock.instant())).thenReturn(1);

		assertThat(service.consume(stored.getChallenge(), WALLET, ChallengePurpose.LOGIN)).isSameAs(stored);
	}

	@Test
	void unknownChallengeIsInvalid() {
		when(repository.findByChallengeAndPurpose(any(), any())).thenReturn(Optional.empty());

		assertFails(() -> service.consume("never issued", WALLET, ChallengePurpose.LOGIN),
				ErrorCode.INVALID_CHALLENGE);
	}

	@Test
	void challengeForAnotherWalletIsInvalidAndStaysUnconsumed() {
		AuthenticationChallenge stored = stored(ChallengePurpose.LOGIN);

		assertFails(() -> service.consume(stored.getChallenge(), OTHER, ChallengePurpose.LOGIN),
				ErrorCode.INVALID_CHALLENGE);
		// Otherwise anyone could burn another wallet's pending challenge.
		verify(repository, never()).consume(anyLong(), any());
	}

	@Test
	void challengeForAnotherPurposeIsInvalid() {
		AuthenticationChallenge stored = stored(ChallengePurpose.REGISTRATION);

		// The lookup is by (text, purpose), so a REGISTRATION challenge is simply not found for LOGIN.
		assertFails(() -> service.consume(stored.getChallenge(), WALLET, ChallengePurpose.LOGIN),
				ErrorCode.INVALID_CHALLENGE);
	}

	@Test
	void secondUseIsAReplay() {
		AuthenticationChallenge stored = stored(ChallengePurpose.LOGIN);
		when(repository.consume(eq(1L), any())).thenReturn(0);
		AuthenticationChallenge consumed = factory.create(WALLET, ChallengePurpose.LOGIN);
		ReflectionTestUtils.setField(consumed, "used", true);
		when(repository.findById(1L)).thenReturn(Optional.of(consumed));

		assertFails(() -> service.consume(stored.getChallenge(), WALLET, ChallengePurpose.LOGIN),
				ErrorCode.CHALLENGE_ALREADY_USED);
	}

	@Test
	void unusedButPastExpiryIsExpired() {
		AuthenticationChallenge stored = stored(ChallengePurpose.LOGIN);
		clock.advance(Duration.ofSeconds(121));
		when(repository.consume(1L, clock.instant())).thenReturn(0);
		when(repository.findById(1L)).thenReturn(Optional.of(stored));

		assertFails(() -> service.consume(stored.getChallenge(), WALLET, ChallengePurpose.LOGIN),
				ErrorCode.CHALLENGE_EXPIRED);
	}

	@Test
	void cleanupJobDeletesChallengesExpiredMoreThanADayAgo() {
		new ChallengeCleanupJob(repository, clock).deleteExpiredChallenges();

		verify(repository).deleteExpiredBefore(clock.instant().minus(Duration.ofHours(24)));
	}

	private AuthenticationChallenge stored(ChallengePurpose purpose) {
		AuthenticationChallenge challenge = factory.create(WALLET, purpose);
		ReflectionTestUtils.setField(challenge, "id", 1L);
		when(repository.findByChallengeAndPurpose(challenge.getChallenge(), purpose))
				.thenReturn(Optional.of(challenge));
		return challenge;
	}

	private static void assertFails(Runnable action, ErrorCode expected) {
		assertThatThrownBy(action::run).isInstanceOf(BlockAuthException.class)
				.extracting(e -> ((BlockAuthException) e).code()).isEqualTo(expected);
	}

}
