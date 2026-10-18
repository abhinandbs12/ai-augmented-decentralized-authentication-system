package com.blockauth.auth;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** The fresh signature a dangerous action carries: the action challenge and the wallet's signature of it. */
public record StepUpProof(
		@NotNull(message = "is required") @Size(min = 1, max = 1000, message = "must be 1-1000 characters") String challenge,
		@NotNull(message = "is required") @Pattern(regexp = "^0x[0-9a-fA-F]{130}$", message = "must be a 0x-prefixed 65-byte hex signature") String signature) {
}
