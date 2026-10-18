package com.blockauth.auth;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.SignatureException;
import java.util.Arrays;

import org.springframework.stereotype.Component;
import org.web3j.crypto.Keys;
import org.web3j.crypto.Sign;
import org.web3j.utils.Numeric;

import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;

/** Verifies an EIP-191 {@code personal_sign} signature by recovering the signer address. */
@Component
public class SignatureVerifier {

	// Half the secp256k1 group order; a larger s is the malleable twin of a valid signature (EIP-2).
	private static final BigInteger HALF_CURVE_ORDER = new BigInteger(
			"7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0", 16);

	/**
	 * @throws BlockAuthException INVALID_SIGNATURE if the signature is malformed, SIGNATURE_MISMATCH if
	 * it is well-formed but was not produced by {@code expectedWallet} over {@code message}
	 */
	public void verify(String message, String signatureHex, String expectedWallet) {
		byte[] signature;
		try {
			signature = Numeric.hexStringToByteArray(signatureHex);
		}
		catch (RuntimeException e) {
			throw new BlockAuthException(ErrorCode.INVALID_SIGNATURE);
		}
		if (signature.length != 65) {
			throw new BlockAuthException(ErrorCode.INVALID_SIGNATURE);
		}
		byte[] r = Arrays.copyOfRange(signature, 0, 32);
		byte[] s = Arrays.copyOfRange(signature, 32, 64);
		int v = signature[64] & 0xFF;
		if (v == 0 || v == 1) {
			v += 27;
		}
		if ((v != 27 && v != 28) || new BigInteger(1, s).compareTo(HALF_CURVE_ORDER) > 0) {
			throw new BlockAuthException(ErrorCode.INVALID_SIGNATURE);
		}
		String recovered;
		try {
			BigInteger publicKey = Sign.signedPrefixedMessageToKey(message.getBytes(StandardCharsets.UTF_8),
					new Sign.SignatureData((byte) v, r, s));
			recovered = "0x" + Keys.getAddress(publicKey);
		}
		catch (SignatureException | RuntimeException e) {
			throw new BlockAuthException(ErrorCode.INVALID_SIGNATURE);
		}
		if (!recovered.equalsIgnoreCase(expectedWallet)) {
			throw new BlockAuthException(ErrorCode.SIGNATURE_MISMATCH);
		}
	}

}
