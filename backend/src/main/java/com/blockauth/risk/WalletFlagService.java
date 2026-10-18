package com.blockauth.risk;

import java.time.Clock;
import java.util.regex.Pattern;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import com.blockauth.admin.EmergencyStopService;
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
import com.blockauth.common.WalletAddresses;
import com.blockauth.security.BlockAuthPrincipal;

/** Administrators flag wallets they consider suspicious; the trust score takes the flags into account. */
@Service
public class WalletFlagService {

	private static final Pattern REASON = Pattern.compile("^[\\p{L}\\p{N} .,:;!?()'_/-]{3,200}$");

	private final WalletFlagRepository flags;
	private final StepUpService stepUp;
	private final EmergencyStopService stop;
	private final AuditService audit;
	private final Clock clock;

	public WalletFlagService(WalletFlagRepository flags, StepUpService stepUp, EmergencyStopService stop,
			AuditService audit, Clock clock) {
		this.flags = flags;
		this.stepUp = stepUp;
		this.stop = stop;
		this.audit = audit;
		this.clock = clock;
	}

	public Page<WalletFlag> list(Pageable pageable) {
		return flags.findAll(pageable);
	}

	public WalletFlag flag(BlockAuthPrincipal admin, String address, String reason, StepUpProof proof,
			ClientInfo client) {
		String wallet = WalletAddresses.normalize(address, "walletAddress");
		if (reason == null || !REASON.matcher(reason).matches()) {
			throw BlockAuthException.invalid("reason", "must be 3-200 characters of text");
		}
		if (flags.existsById(wallet)) {
			throw new BlockAuthException(ErrorCode.WALLET_ALREADY_FLAGGED);
		}
		stepUp.verify(admin, StepUpAction.FLAG_WALLET, StepUpDetails.wallet(wallet), proof, client);
		WalletFlag flag = flags.save(new WalletFlag(wallet, reason, admin.userId(), clock.instant()));
		audit.recordAuthEvent(AuthEventType.WALLET_FLAGGED, AuthEventStatus.SUCCESS, wallet, null, admin.userId(), null,
				client);
		return flag;
	}

	/** Removing a flag raises trust, so it is not possible while the emergency stop is on. */
	public void unflag(BlockAuthPrincipal admin, String address, StepUpProof proof, ClientInfo client) {
		stop.requireInactive();
		String wallet = WalletAddresses.normalize(address, "walletAddress");
		if (!flags.existsById(wallet)) {
			throw new BlockAuthException(ErrorCode.WALLET_NOT_FLAGGED);
		}
		stepUp.verify(admin, StepUpAction.UNFLAG_WALLET, StepUpDetails.wallet(wallet), proof, client);
		flags.deleteById(wallet);
		audit.recordAuthEvent(AuthEventType.WALLET_UNFLAGGED, AuthEventStatus.SUCCESS, wallet, null, admin.userId(),
				null, client);
	}

}
