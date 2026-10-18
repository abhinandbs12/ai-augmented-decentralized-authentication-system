package com.blockauth;

import java.util.List;

import com.blockauth.config.BlockAuthProperties;

public final class TestProperties {

	private TestProperties() {
	}

	/** Dummy values; no test using these connects to a chain. */
	public static BlockAuthProperties with(String... adminWallets) {
		return new BlockAuthProperties("http://localhost:5173", 120, List.of(adminWallets),
				new BlockAuthProperties.Blockchain("http://127.0.0.1:8545", 31337,
						"0x0000000000000000000000000000000000000001", "0x" + "11".repeat(32)));
	}

}
