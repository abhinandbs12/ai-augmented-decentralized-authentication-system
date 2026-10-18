package com.blockauth.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.web3j.crypto.Keys;

import com.blockauth.MutableClock;
import com.blockauth.TestProperties;
import com.blockauth.apikey.ApiKeySpec;

/**
 * Every message the server can ask a wallet to sign follows the EIP-4361 message grammar line by line,
 * so wallets can parse it and check the site. This covers the layout only: BlockAuth verifies the
 * signature against its own stored copy of the text, not with a SIWE library.
 */
class Eip4361FormatTest {

	private static final String WALLET = "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed";
	private static final String TARGET = "0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359";

	// EIP-4361 statement: reserved and unreserved URI characters (RFC 3986) and spaces, no line break.
	private static final String STATEMENT = "^[A-Za-z0-9\\-._~:/?#\\[\\]@!$&'()*+,;= ]+$";

	private final ChallengeMessageFactory factory = new ChallengeMessageFactory(
			new MutableClock(Instant.parse("2026-10-06T16:30:00.750Z")), TestProperties.with());

	private List<String> allMessages() {
		List<String> texts = new ArrayList<>();
		texts.add(factory.create(WALLET, ChallengePurpose.REGISTRATION).getChallenge());
		texts.add(factory.create(WALLET, ChallengePurpose.LOGIN).getChallenge());
		String apiKey = ApiKeySpec.of("Nightly report_v2.1-final", List.of("users:read", "audit:read"), 30, 90).details();
		for (StepUpAction action : StepUpAction.values()) {
			String details = switch (action) {
				case REVOKE_WALLET, ACTIVATE_WALLET, RESET_SECOND_STEP, FLAG_WALLET, UNFLAG_WALLET ->
					StepUpDetails.wallet(TARGET);
				case START_EMERGENCY_STOP -> StepUpDetails.emergencyStop(true, false);
				case CREATE_API_KEY -> apiKey;
				default -> StepUpDetails.none();
			};
			texts.add(factory.createForAction(WALLET, action, details, UUID.randomUUID()).getChallenge());
		}
		return texts;
	}

	@Test
	void everyMessageFollowsTheGrammar() {
		List<String> texts = allMessages();
		assertThat(texts).hasSize(2 + StepUpAction.values().length);
		for (String text : texts) {
			String[] lines = text.split("\n", -1);
			assertThat(lines).as(text).hasSize(11);
			assertThat(lines[0]).isEqualTo("localhost:5173 wants you to sign in with your Ethereum account:");
			// The address in its EIP-55 checksummed form, as the standard requires.
			assertThat(lines[1]).isEqualTo(Keys.toChecksumAddress(WALLET));
			assertThat(lines[2]).isEmpty();
			assertThat(lines[3]).as("statement").matches(STATEMENT);
			assertThat(lines[4]).isEmpty();
			assertThat(lines[5]).isEqualTo("URI: http://localhost:5173");
			assertThat(lines[6]).isEqualTo("Version: 1");
			assertThat(lines[7]).isEqualTo("Chain ID: 31337");
			assertThat(lines[8]).matches("^Nonce: [A-Za-z0-9]{8,}$");
			assertThat(lines[9]).startsWith("Issued At: ");
			assertThat(lines[10]).startsWith("Expiration Time: ");
			OffsetDateTime issued = OffsetDateTime.parse(lines[9].substring("Issued At: ".length()));
			OffsetDateTime expires = OffsetDateTime.parse(lines[10].substring("Expiration Time: ".length()));
			assertThat(Duration.between(issued, expires)).isEqualTo(Duration.ofSeconds(120));
		}
	}

	@Test
	void eachPurposeAndActionSaysWhatIsSigned() {
		List<String> statements = allMessages().stream().map(t -> t.split("\n")[3]).toList();

		assertThat(statements).doesNotHaveDuplicates();
		assertThat(statements.get(0)).startsWith("Register this wallet with BlockAuth.");
		assertThat(statements.get(1)).startsWith("Sign in to BlockAuth.");
		assertThat(statements).filteredOn(s -> s.contains("Create a read-only API key"))
			.containsExactly("Confirm in BlockAuth: Create a read-only API key 'Nightly report_v2.1-final' "
					+ "(users:read, audit:read) for 30 days. This request sends no transaction and costs no gas.");
	}

}
