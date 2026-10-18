package com.blockauth.auth;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.blockauth.common.WalletAddresses;
import com.blockauth.config.BlockAuthProperties;

/**
 * Builds the text a wallet signs, in the Sign-In with Ethereum layout (EIP-4361). Wallets recognise
 * this layout and warn when the site asking for the signature is not the one named in the first line.
 * Binding the purpose, wallet, site, chain and a one-time nonce into the text makes a signature useless
 * for any other purpose, wallet, site, chain or attempt.
 */
@Component
public class ChallengeMessageFactory {

	private static final String NO_GAS = "This request sends no transaction and costs no gas.";

	private final SecureRandom random = new SecureRandom();
	private final Clock clock;
	private final BlockAuthProperties properties;

	public ChallengeMessageFactory(Clock clock, BlockAuthProperties properties) {
		this.clock = clock;
		this.properties = properties;
	}

	public AuthenticationChallenge create(String wallet, ChallengePurpose purpose) {
		String statement = purpose == ChallengePurpose.REGISTRATION
				? "Register this wallet with BlockAuth. " + NO_GAS
				: "Sign in to BlockAuth. " + NO_GAS;
		Message message = message(wallet, statement);
		return new AuthenticationChallenge(wallet, purpose, message.nonce, message.text, message.issuedAt,
				message.expiresAt);
	}

	/** A challenge that confirms one action with exactly these {@code details}, from one session. */
	public AuthenticationChallenge createForAction(String wallet, StepUpAction action, String details,
			UUID sessionId) {
		String subject = details.isEmpty() ? action.label() : action.label() + " " + details;
		Message message = message(wallet, "Confirm in BlockAuth: " + subject + ". " + NO_GAS);
		return new AuthenticationChallenge(wallet, message.nonce, message.text, message.issuedAt, message.expiresAt,
				action, details, sessionId);
	}

	private Message message(String wallet, String statement) {
		byte[] nonceBytes = new byte[16];
		random.nextBytes(nonceBytes);
		String nonce = HexFormat.of().formatHex(nonceBytes);
		Instant issuedAt = clock.instant().truncatedTo(ChronoUnit.SECONDS);
		Instant expiresAt = issuedAt.plusSeconds(properties.challengeTtlSeconds());
		String text = String.join("\n",
				properties.domain() + " wants you to sign in with your Ethereum account:",
				WalletAddresses.checksum(wallet),
				"",
				statement,
				"",
				"URI: " + properties.appOrigin(),
				"Version: 1",
				"Chain ID: " + properties.blockchain().chainId(),
				"Nonce: " + nonce,
				"Issued At: " + issuedAt,
				"Expiration Time: " + expiresAt);
		return new Message(nonce, text, issuedAt, expiresAt);
	}

	private record Message(String nonce, String text, Instant issuedAt, Instant expiresAt) {
	}

}
