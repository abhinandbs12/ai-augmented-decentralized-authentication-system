package com.blockauth;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;

import org.web3j.crypto.ECKeyPair;
import org.web3j.crypto.Keys;
import org.web3j.crypto.Sign;
import org.web3j.utils.Numeric;

/** A throwaway key pair that signs exactly like MetaMask personal_sign (EIP-191). Tests only. */
public final class TestWallet {

	private final ECKeyPair keys;

	public TestWallet() {
		try {
			this.keys = Keys.createEcKeyPair();
		}
		catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	/** Lowercase 0x address. */
	public String address() {
		return "0x" + Keys.getAddress(keys);
	}

	public String checksumAddress() {
		return Keys.toChecksumAddress(address());
	}

	public String sign(String message) {
		Sign.SignatureData sig = Sign.signPrefixedMessage(message.getBytes(StandardCharsets.UTF_8), keys);
		return Numeric.toHexString(ByteBuffer.allocate(65).put(sig.getR()).put(sig.getS()).put(sig.getV()).array());
	}

}
