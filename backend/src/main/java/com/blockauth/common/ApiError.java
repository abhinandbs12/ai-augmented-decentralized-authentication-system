package com.blockauth.common;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

public record ApiError(int status, String code, String message, Instant timestamp, String path, String errorId,
		List<FieldError> fieldErrors) {

	public record FieldError(String field, String message) {
	}

	public static ApiError of(ErrorCode code, String path) {
		return of(code, path, null, List.of());
	}

	public static ApiError of(ErrorCode code, String path, String errorId, List<FieldError> fieldErrors) {
		return new ApiError(code.status(), code.name(), code.message(), Instant.now().truncatedTo(ChronoUnit.SECONDS),
				path, errorId, fieldErrors);
	}

}
