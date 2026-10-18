package com.blockauth.apikey;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Service;

import com.blockauth.admin.EmergencyStopService;
import com.blockauth.audit.AuditService;
import com.blockauth.audit.AuthEventStatus;
import com.blockauth.audit.AuthEventType;
import com.blockauth.audit.ClientInfo;
import com.blockauth.auth.StepUpAction;
import com.blockauth.auth.StepUpProof;
import com.blockauth.auth.StepUpService;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;
import com.blockauth.common.PageResponse;
import com.blockauth.common.Tokens;
import com.blockauth.common.WalletAddresses;
import com.blockauth.security.BlockAuthPrincipal;
import com.blockauth.user.User;
import com.blockauth.user.UserRepository;
import com.blockauth.user.UserRole;
import com.blockauth.user.UserStatus;

/**
 * Read-only API keys for tools that monitor BlockAuth. A key belongs to an administrator, carries only
 * the scopes chosen when it was created, expires, and stops working the moment it is revoked or its
 * owner is no longer an active administrator.
 */
@Service
public class ApiKeyService {

	/** Token format: "bak." + key id + "." + 43-character secret. */
	private static final Pattern TOKEN = Pattern.compile(
			"^bak\\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\\.([A-Za-z0-9_-]{43})$");
	private static final Duration TOUCH_INTERVAL = Duration.ofMinutes(1);

	public record KeyView(UUID id, String name, String owner, List<String> scopes, Instant createdAt,
			Instant expiresAt, Instant revokedAt, Instant lastUsedAt, String status) {
	}

	/** @param token shown this once; it cannot be retrieved later */
	public record Created(KeyView key, String token) {
	}

	public record Authenticated(ApiKeyPrincipal principal, List<SimpleGrantedAuthority> authorities) {
	}

	private final ApiKeyRepository keys;
	private final UserRepository users;
	private final StepUpService stepUp;
	private final EmergencyStopService stop;
	private final AuditService audit;
	private final Clock clock;

	public ApiKeyService(ApiKeyRepository keys, UserRepository users, StepUpService stepUp, EmergencyStopService stop,
			AuditService audit, Clock clock) {
		this.keys = keys;
		this.users = users;
		this.stepUp = stepUp;
		this.stop = stop;
		this.audit = audit;
		this.clock = clock;
	}

	public Created create(BlockAuthPrincipal admin, ApiKeySpec spec, StepUpProof proof, ClientInfo client) {
		stop.requireInactive();
		stepUp.verify(admin, StepUpAction.CREATE_API_KEY, spec.details(), proof, client);
		String secret = Tokens.random(32);
		ApiKey key = keys.save(new ApiKey(admin.userId(), spec, Tokens.sha256Hex(secret), clock.instant()));
		audit.recordAuthEvent(AuthEventType.API_KEY_CREATED, AuthEventStatus.SUCCESS, admin.walletAddress(), null,
				admin.userId(), null, client);
		return new Created(view(key, admin.walletAddress()), "bak." + key.getId() + "." + secret);
	}

	public PageResponse<KeyView> list(Pageable pageable) {
		Page<ApiKey> page = keys.findAll(pageable);
		Map<UUID, String> owners = users.findAllById(page.getContent().stream().map(ApiKey::getOwnerId).toList())
			.stream()
			.collect(Collectors.toMap(User::getId, User::getWalletAddress));
		return PageResponse.of(page, k -> view(k, owners.get(k.getOwnerId())));
	}

	/** Any administrator may revoke any key: revoking never grants anything. */
	public KeyView revoke(BlockAuthPrincipal admin, UUID id, ClientInfo client) {
		if (!keys.existsById(id)) {
			throw new BlockAuthException(ErrorCode.RESOURCE_NOT_FOUND);
		}
		// Conditional update: of concurrent revocations exactly one takes effect and is recorded.
		if (keys.revoke(id, admin.userId(), clock.instant()) == 1) {
			audit.recordAuthEvent(AuthEventType.API_KEY_REVOKED, AuthEventStatus.SUCCESS, admin.walletAddress(), null,
					admin.userId(), null, client);
		}
		ApiKey key = keys.findById(id).orElseThrow();
		return view(key, users.findById(key.getOwnerId()).map(User::getWalletAddress).orElse(null));
	}

	/**
	 * Checks a presented key. Empty for anything that is not a valid, unexpired, unrevoked key of an
	 * active administrator; the caller answers all of those the same way.
	 */
	public Optional<Authenticated> authenticate(String token) {
		var match = TOKEN.matcher(token == null ? "" : token);
		if (!match.matches()) {
			return Optional.empty();
		}
		Instant now = clock.instant();
		Optional<KeyAndOwner> found = keys.findWithOwner(UUID.fromString(match.group(1)))
			.filter(k -> Tokens.constantTimeEquals(k.key().getSecretHash(), Tokens.sha256Hex(match.group(2))))
			.filter(k -> k.key().usableAt(now))
			.filter(k -> k.owner().getRole() == UserRole.ADMIN && k.owner().getStatus() == UserStatus.ACTIVE);
		found.ifPresent(k -> {
			if (k.key().getLastUsedAt() == null || k.key().getLastUsedAt().isBefore(now.minus(TOUCH_INTERVAL))) {
				keys.touch(k.key().getId(), now, now.minus(TOUCH_INTERVAL));
			}
		});
		return found.map(k -> new Authenticated(new ApiKeyPrincipal(k.key().getId(), k.key().getName(), k.owner().getId()),
				k.key().scopeSet().stream().map(s -> new SimpleGrantedAuthority(s.authority())).toList()));
	}

	private KeyView view(ApiKey key, String ownerWallet) {
		Instant now = clock.instant();
		String status = key.getRevokedAt() != null ? "REVOKED" : key.usableAt(now) ? "ACTIVE" : "EXPIRED";
		return new KeyView(key.getId(), key.getName(), WalletAddresses.checksum(ownerWallet),
				key.scopeSet().stream().map(ApiScope::value).toList(), key.getCreatedAt(), key.getExpiresAt(),
				key.getRevokedAt(), key.getLastUsedAt(), status);
	}

}
