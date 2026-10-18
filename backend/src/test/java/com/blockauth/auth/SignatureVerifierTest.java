package com.blockauth.auth;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigInteger;

import org.junit.jupiter.api.Test;
import org.web3j.utils.Numeric;

import com.blockauth.TestWallet;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;

class SignatureVerifierTest {

	private static final String MESSAGE = "BlockAuth wants you to prove ownership of this wallet.\n\nNonce: abc";
	private static final BigInteger CURVE_ORDER = new BigInteger(
			"FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141", 16);

	private final SignatureVerifier verifier = new SignatureVerifier();
	private final TestWallet wallet = new TestWallet();
	private final String signature = wallet.sign(MESSAGE);

	@Test
	void acceptsTheWalletsOwnSignature() {
		assertThatCode(() -> verifier.verify(MESSAGE, signature, wallet.address())).doesNotThrowAnyException();
		assertThatCode(() -> verifier.verify(MESSAGE, signature, wallet.checksumAddress()))
				.doesNotThrowAnyException();
	}

	@Test
	void acceptsRecoveryIdEncodedAsZeroOrOne() {
		byte[] raw = Numeric.hexStringToByteArray(signature);
		raw[64] -= 27;
		assertThatCode(() -> verifier.verify(MESSAGE, Numeric.toHexString(raw), wallet.address()))
				.doesNotThrowAnyException();
	}

	@Test
	void rejectsAModifiedMessage() {
		assertFails(MESSAGE + " ", signature, wallet.address(), ErrorCode.SIGNATURE_MISMATCH);
	}

	@Test
	void rejectsASignatureFromAnotherWallet() {
		assertFails(MESSAGE, new TestWallet().sign(MESSAGE), wallet.address(), ErrorCode.SIGNATURE_MISMATCH);
	}

	@Test
	void neverAcceptsATamperedSignature() {
		byte[] raw = Numeric.hexStringToByteArray(signature);
		for (int index : new int[] { 0, 15, 31 }) {
			byte[] tampered = raw.clone();
			tampered[index] ^= 0x01;
			// A flipped r either fails recovery or recovers some other address; it must never pass.
			assertThatThrownBy(() -> verifier.verify(MESSAGE, Numeric.toHexString(tampered), wallet.address()))
					.isInstanceOf(BlockAuthException.class);
		}
	}

	@Test
	void rejectsAnInvalidRecoveryId() {
		byte[] raw = Numeric.hexStringToByteArray(signature);
		raw[64] = 29;
		assertFails(MESSAGE, Numeric.toHexString(raw), wallet.address(), ErrorCode.INVALID_SIGNATURE);
	}

	@Test
	void rejectsTheMalleableHighSTwin() {
		byte[] raw = Numeric.hexStringToByteArray(signature);
		BigInteger s = new BigInteger(1, raw, 32, 32);
		System.arraycopy(Numeric.toBytesPadded(CURVE_ORDER.subtract(s), 32), 0, raw, 32, 32);
		raw[64] = (byte) (raw[64] == 27 ? 28 : 27);
		// (r, n - s, flipped v) is mathematically valid for the same key, so only the low-s rule stops it.
		assertFails(MESSAGE, Numeric.toHexString(raw), wallet.address(), ErrorCode.INVALID_SIGNATURE);
	}

	@Test
	void rejectsWrongLengthAndNonHexInput() {
		assertFails(MESSAGE, signature.substring(0, signature.length() - 2), wallet.address(),
				ErrorCode.INVALID_SIGNATURE);
		assertFails(MESSAGE, "0xzz", wallet.address(), ErrorCode.INVALID_SIGNATURE);
		assertFails(MESSAGE, "", wallet.address(), ErrorCode.INVALID_SIGNATURE);
	}

	private void assertFails(String message, String sig, String address, ErrorCode expected) {
		assertThatThrownBy(() -> verifier.verify(message, sig, address)).isInstanceOf(BlockAuthException.class)
				.extracting(e -> ((BlockAuthException) e).code()).isEqualTo(expected);
	}

}
