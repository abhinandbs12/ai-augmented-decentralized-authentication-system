package com.blockauth.secondstep;

import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import com.blockauth.common.Tokens;

/**
 * AES-256-GCM encryption of authenticator secrets at rest. The server must be able to read a secret
 * back to check codes, so it is encrypted rather than hashed; a copy of the database alone is useless
 * without the key, which lives only in the environment.
 */
final class SecretBox {

	private static final int IV_BYTES = 12;
	private static final int TAG_BITS = 128;

	private final SecretKeySpec key;

	SecretBox(byte[] key) {
		this.key = new SecretKeySpec(key, "AES");
	}

	/** Base64 of IV followed by ciphertext and tag. */
	String seal(byte[] plaintext) {
		try {
			byte[] iv = Tokens.randomBytes(IV_BYTES);
			Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
			byte[] sealed = cipher.doFinal(plaintext);
			return Base64.getEncoder()
				.encodeToString(ByteBuffer.allocate(iv.length + sealed.length).put(iv).put(sealed).array());
		}
		catch (GeneralSecurityException e) {
			throw new IllegalStateException("Encryption failed", e);
		}
	}

	/** @throws IllegalStateException if the value was altered or sealed with another key */
	byte[] open(String sealed) {
		try {
			byte[] data = Base64.getDecoder().decode(sealed);
			Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, data, 0, IV_BYTES));
			return cipher.doFinal(data, IV_BYTES, data.length - IV_BYTES);
		}
		catch (GeneralSecurityException | IllegalArgumentException e) {
			throw new IllegalStateException("Stored second-step secret cannot be decrypted");
		}
	}

}
