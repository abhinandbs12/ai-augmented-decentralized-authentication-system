package com.blockauth.secondstep;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
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
import com.blockauth.common.Tokens;
import com.blockauth.common.WalletAddresses;
import com.blockauth.config.SecuritySettings;
import com.blockauth.security.BlockAuthPrincipal;
import com.blockauth.security.InMemoryRateLimiter;
import com.blockauth.session.SessionRegistry;

/**
 * The second step: an authenticator code (or a one-time backup code) asked for on top of the wallet
 * signature when a sign-in looks risky. Turning it on, off, or renewing the backup codes needs a fresh
 * wallet signature and a valid code.
 */
@Service
public class SecondStepService {

	public record Status(boolean enabled, long backupCodesLeft) {
	}

	/** Shown once: the key to enter in an authenticator app, and the same as an otpauth link. */
	public record Setup(String secret, String otpauthUri) {
	}

	private static final int BACKUP_CODE_COUNT = 10;
	private static final char[] BACKUP_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789".toCharArray();
	private static final Pattern TOTP_CODE = Pattern.compile("^[0-9]{6}$");
	private static final Pattern BACKUP_CODE = Pattern.compile("^[A-Z0-9]{8}$");
	private static final int CODE_ATTEMPTS = 5;
	private static final Duration CODE_WINDOW = Duration.ofMinutes(5);

	private final SecondFactorRepository factors;
	private final BackupCodeRepository backupCodes;
	private final StepUpService stepUp;
	private final SessionRegistry sessions;
	private final AuditService audit;
	private final InMemoryRateLimiter limiter;
	private final SecretBox box;
	private final byte[] backupCodeKey;
	private final Clock clock;
	private final TransactionTemplate transaction;
	private final SecureRandom random = new SecureRandom();

	public SecondStepService(SecondFactorRepository factors, BackupCodeRepository backupCodes, StepUpService stepUp,
			SessionRegistry sessions, AuditService audit, InMemoryRateLimiter limiter, SecuritySettings settings,
			Clock clock, PlatformTransactionManager transactionManager) {
		this.factors = factors;
		this.backupCodes = backupCodes;
		this.stepUp = stepUp;
		this.sessions = sessions;
		this.audit = audit;
		this.limiter = limiter;
		this.box = new SecretBox(settings.secondStepKeyBytes());
		// A separate key for the backup-code hashes, derived from the configured one, so one key is never
		// used for two algorithms.
		this.backupCodeKey = Tokens.hmacSha256Hex(settings.secondStepKeyBytes(), "blockauth backup codes v1")
			.getBytes(StandardCharsets.US_ASCII);
		this.clock = clock;
		this.transaction = new TransactionTemplate(transactionManager);
	}

	public boolean isEnabled(UUID userId) {
		return factors.existsByUserIdAndEnabledAtIsNotNull(userId);
	}

	public Status status(UUID userId) {
		boolean enabled = isEnabled(userId);
		return new Status(enabled, enabled ? backupCodes.countByUserIdAndUsedAtIsNull(userId) : 0);
	}

	/** Creates a new secret, not yet active. Starting again replaces an unconfirmed one. */
	public Setup beginSetup(BlockAuthPrincipal principal) {
		if (isEnabled(principal.userId())) {
			throw new BlockAuthException(ErrorCode.SECOND_STEP_ALREADY_ENABLED);
		}
		byte[] secret = Totp.newSecret();
		factors.save(new SecondFactor(principal.userId(), box.seal(secret), clock.instant()));
		String encoded = Totp.base32(secret);
		String account = URLEncoder.encode("BlockAuth:" + WalletAddresses.checksum(principal.walletAddress()),
				StandardCharsets.UTF_8);
		return new Setup(encoded, "otpauth://totp/" + account + "?secret=" + encoded
				+ "&issuer=BlockAuth&algorithm=SHA1&digits=6&period=" + Totp.PERIOD_SECONDS);
	}

	/**
	 * Confirms the setup with a first code and a fresh signature. The device it is confirmed on becomes
	 * trusted. @return the backup codes, shown this once only
	 */
	public List<String> enable(BlockAuthPrincipal principal, String code, StepUpProof proof, ClientInfo client) {
		throttle(principal.userId());
		SecondFactor factor = factors.findById(principal.userId())
			.orElseThrow(() -> new BlockAuthException(ErrorCode.SECOND_STEP_SETUP_MISSING));
		if (factor.isEnabled()) {
			throw new BlockAuthException(ErrorCode.SECOND_STEP_ALREADY_ENABLED);
		}
		long step = TOTP_CODE.matcher(code == null ? "" : code).matches()
				? Totp.matchingStep(box.open(factor.getSecretCiphertext()), code, clock.instant(), -1) : -1;
		if (step < 0) {
			throw new BlockAuthException(ErrorCode.VERIFICATION_CODE_INVALID);
		}
		stepUp.verify(principal, StepUpAction.ENABLE_SECOND_STEP, StepUpDetails.none(), proof, client);
		List<String> codes = transaction.execute(status -> {
			factor.enable(clock.instant(), step);
			factors.save(factor);
			return replaceBackupCodes(principal.userId());
		});
		sessions.trustDeviceOf(principal.userId(), principal.sessionId());
		audit.recordAuthEvent(AuthEventType.SECOND_STEP_ENABLED, AuthEventStatus.SUCCESS, principal.walletAddress(),
				principal.userId(), null, null, client);
		return codes;
	}

	public void disable(BlockAuthPrincipal principal, String code, StepUpProof proof, ClientInfo client) {
		requireCode(principal, code);
		stepUp.verify(principal, StepUpAction.DISABLE_SECOND_STEP, StepUpDetails.none(), proof, client);
		remove(principal.userId());
		audit.recordAuthEvent(AuthEventType.SECOND_STEP_DISABLED, AuthEventStatus.SUCCESS, principal.walletAddress(),
				principal.userId(), null, null, client);
	}

	/** @return the new backup codes, shown this once only; the old ones stop working */
	public List<String> renewBackupCodes(BlockAuthPrincipal principal, String code, StepUpProof proof,
			ClientInfo client) {
		requireCode(principal, code);
		stepUp.verify(principal, StepUpAction.RENEW_BACKUP_CODES, StepUpDetails.none(), proof, client);
		List<String> codes = transaction.execute(status -> replaceBackupCodes(principal.userId()));
		audit.recordAuthEvent(AuthEventType.BACKUP_CODES_RENEWED, AuthEventStatus.SUCCESS, principal.walletAddress(),
				principal.userId(), null, null, client);
		return codes;
	}

	/**
	 * Checks an authenticator code or a backup code, and uses it up: an authenticator code is not
	 * accepted twice, a backup code works once.
	 */
	public boolean verifyCode(UUID userId, String code) {
		if (code == null) {
			return false;
		}
		String normalized = code.replace("-", "").replace(" ", "").toUpperCase(Locale.ROOT);
		if (TOTP_CODE.matcher(normalized).matches()) {
			SecondFactor factor = factors.findById(userId).filter(SecondFactor::isEnabled).orElse(null);
			if (factor == null) {
				return false;
			}
			long step = Totp.matchingStep(box.open(factor.getSecretCiphertext()), normalized, clock.instant(),
					factor.lastUsedStep());
			return step >= 0 && factors.useStep(userId, step) == 1;
		}
		return BACKUP_CODE.matcher(normalized).matches() && isEnabled(userId)
				&& backupCodes.use(userId, backupCodeHash(normalized), clock.instant()) == 1;
	}

	/** Removes the second step entirely (by its owner, or by an administrator's delayed reset). */
	public void remove(UUID userId) {
		transaction.executeWithoutResult(status -> {
			backupCodes.deleteAllOf(userId);
			factors.deleteById(userId);
		});
	}

	private void requireCode(BlockAuthPrincipal principal, String code) {
		throttle(principal.userId());
		if (!isEnabled(principal.userId())) {
			throw new BlockAuthException(ErrorCode.SECOND_STEP_NOT_ENABLED);
		}
		if (!verifyCode(principal.userId(), code)) {
			throw new BlockAuthException(ErrorCode.VERIFICATION_CODE_INVALID);
		}
	}

	private void throttle(UUID userId) {
		InMemoryRateLimiter.Decision decision = limiter.acquire("second-step-code", userId.toString(), CODE_ATTEMPTS,
				CODE_WINDOW);
		if (!decision.allowed()) {
			throw new BlockAuthException(ErrorCode.RATE_LIMITED, decision.retryAfterSeconds());
		}
	}

	private List<String> replaceBackupCodes(UUID userId) {
		backupCodes.deleteAllOf(userId);
		List<String> codes = new ArrayList<>();
		for (int i = 0; i < BACKUP_CODE_COUNT; i++) {
			String code = randomBackupCode();
			backupCodes.save(new BackupCode(userId, backupCodeHash(code)));
			codes.add(code.substring(0, 4) + "-" + code.substring(4));
		}
		return codes;
	}

	/** Keyed hash: a backup code has only about 39 bits, so a plain hash could be reversed offline. */
	private String backupCodeHash(String code) {
		return Tokens.hmacSha256Hex(backupCodeKey, code);
	}

	private String randomBackupCode() {
		StringBuilder code = new StringBuilder();
		for (int i = 0; i < 8; i++) {
			code.append(BACKUP_ALPHABET[random.nextInt(BACKUP_ALPHABET.length)]);
		}
		return code.toString();
	}

}
