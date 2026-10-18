package com.blockauth.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.blockauth.MutableClock;
import com.blockauth.TestProperties;
import com.blockauth.common.WalletAddresses;

class ChallengeMessageFactoryTest {

	private static final String WALLET = "0x1234567890abcdef1234567890abcdef12345678";

	private final ChallengeMessageFactory factory = new ChallengeMessageFactory(
			new MutableClock(Instant.parse("2026-10-06T16:30:00.750Z")), TestProperties.with());

	@Test
	void buildsTheExactSignedText() {
		AuthenticationChallenge challenge = factory.create(WALLET, ChallengePurpose.LOGIN);

		assertThat(challenge.getNonce()).matches("^[0-9a-f]{32}$");
		// The Sign-In with Ethereum layout (EIP-4361), so that wallets can check the site in the first line.
		assertThat(challenge.getChallenge()).isEqualTo("""
				localhost:5173 wants you to sign in with your Ethereum account:
				%s

				Sign in to BlockAuth. This request sends no transaction and costs no gas.

				URI: http://localhost:5173
				Version: 1
				Chain ID: 31337
				Nonce: %s
				Issued At: 2026-10-06T16:30:00Z
				Expiration Time: 2026-10-06T16:32:00Z""".formatted(WalletAddresses.checksum(WALLET), challenge.getNonce()));
	}

	@Test
	void expiresExactlyOneTtlAfterIssue() {
		AuthenticationChallenge challenge = factory.create(WALLET, ChallengePurpose.REGISTRATION);

		assertThat(challenge.getPurpose()).isEqualTo(ChallengePurpose.REGISTRATION);
		assertThat(challenge.getWalletAddress()).isEqualTo(WALLET);
		assertThat(Duration.between(challenge.getCreatedAt(), challenge.getExpiresAt())).hasSeconds(120);
		assertThat(challenge.getChallenge()).contains("Register this wallet with BlockAuth.");
		assertThat(challenge.isUsed()).isFalse();
	}

	@Test
	void anActionChallengeNamesTheActionItsParametersAndTheSession() {
		UUID session = UUID.randomUUID();
		AuthenticationChallenge challenge = factory.createForAction(WALLET, StepUpAction.REVOKE_WALLET,
				"0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", session);

		assertThat(challenge.getPurpose()).isEqualTo(ChallengePurpose.ACTION);
		assertThat(challenge.getAction()).isEqualTo(StepUpAction.REVOKE_WALLET);
		assertThat(challenge.getSessionId()).isEqualTo(session);
		assertThat(challenge.getChallenge()).contains(
				"Confirm in BlockAuth: Revoke wallet 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed. This request");
	}

	@Test
	void noncesAreUniqueAcrossTenThousandChallenges() {
		Set<String> nonces = new HashSet<>();
		for (int i = 0; i < 10_000; i++) {
			nonces.add(factory.create(WALLET, ChallengePurpose.LOGIN).getNonce());
		}
		assertThat(nonces).hasSize(10_000);
	}

}
