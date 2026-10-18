package com.blockauth.auth;

import com.blockauth.common.WalletAddresses;

/**
 * The parameters of a dangerous action, written the same way when the challenge is issued and when
 * the action is carried out. The two must be equal, so a signature for one wallet or one setting cannot
 * be used for another.
 */
public final class StepUpDetails {

	private StepUpDetails() {
	}

	public static String none() {
		return "";
	}

	public static String wallet(String normalizedWallet) {
		return WalletAddresses.checksum(normalizedWallet);
	}

	public static String emergencyStop(boolean blockLogins, boolean endUserSessions) {
		return "(new sign-ins by users " + (blockLogins ? "blocked" : "allowed") + ", open user sessions "
				+ (endUserSessions ? "ended" : "kept") + ")";
	}

}
