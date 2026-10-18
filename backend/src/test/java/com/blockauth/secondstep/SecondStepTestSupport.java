package com.blockauth.secondstep;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

import com.blockauth.Api;

/** What an authenticator app does, for tests in any package. */
public final class SecondStepTestSupport {

	public record Enabled(byte[] secret, List<String> backupCodes) {
	}

	private SecondStepTestSupport() {
	}

	/**
	 * Sets up and turns on the second step for the signed-in {@code api}. @return the secret, to compute
	 * codes with {@link #code}, and the backup codes
	 * @param proof obtains the fresh-signature body for an action name
	 */
	public static Enabled enable(Api api, Instant now, Function<String, Map<String, Object>> proof) {
		Api.Response setup = api.post("/api/users/second-step/setup", null);
		assertThat(setup.status()).as(setup.body().toString()).isEqualTo(200);
		byte[] secret = base32Decode(setup.body().get("secret").asString());
		Map<String, Object> body = new LinkedHashMap<>(proof.apply("ENABLE_SECOND_STEP"));
		body.put("code", code(secret, now));
		Api.Response enabled = api.post("/api/users/second-step/enable", body);
		assertThat(enabled.status()).as(enabled.body().toString()).isEqualTo(200);
		return new Enabled(secret, backupCodes(enabled));
	}

	public static String code(byte[] secret, Instant time) {
		return Totp.code(secret, Totp.step(time));
	}

	public static List<String> backupCodes(Api.Response response) {
		List<String> codes = new ArrayList<>();
		response.body().get("backupCodes").forEach(c -> codes.add(c.asString()));
		return codes;
	}

	public static byte[] base32Decode(String text) {
		String alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
		byte[] out = new byte[text.length() * 5 / 8];
		int buffer = 0;
		int bits = 0;
		int index = 0;
		for (char c : text.toCharArray()) {
			buffer = (buffer << 5) | alphabet.indexOf(c);
			bits += 5;
			if (bits >= 8) {
				out[index++] = (byte) (buffer >> (bits - 8));
				bits -= 8;
			}
		}
		return out;
	}

}
