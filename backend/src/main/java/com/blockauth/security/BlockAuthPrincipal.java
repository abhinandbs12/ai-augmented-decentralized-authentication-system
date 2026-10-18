package com.blockauth.security;

import java.io.Serializable;
import java.util.List;
import java.util.UUID;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import com.blockauth.user.User;

/**
 * The authenticated identity stored in the session: the user, the wallet and the id of the session
 * record that every request checks. The role is not part of it: it is re-read per request.
 */
public record BlockAuthPrincipal(UUID userId, String walletAddress, UUID sessionId) implements Serializable {

	/** The authentication for a user as the database describes them right now. There are no credentials. */
	public static Authentication authentication(User user, UUID sessionId) {
		return UsernamePasswordAuthenticationToken.authenticated(
				new BlockAuthPrincipal(user.getId(), user.getWalletAddress(), sessionId), null,
				List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole())));
	}

}
