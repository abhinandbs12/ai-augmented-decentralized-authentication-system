package com.blockauth.common;

import java.util.List;

public class BlockAuthException extends RuntimeException {

	private final ErrorCode code;
	private final List<ApiError.FieldError> fieldErrors;
	private final long retryAfterSeconds;

	public BlockAuthException(ErrorCode code) {
		this(code, List.of(), 0);
	}

	public BlockAuthException(ErrorCode code, long retryAfterSeconds) {
		this(code, List.of(), retryAfterSeconds);
	}

	private BlockAuthException(ErrorCode code, List<ApiError.FieldError> fieldErrors, long retryAfterSeconds) {
		super(code.name());
		this.code = code;
		this.fieldErrors = fieldErrors;
		this.retryAfterSeconds = retryAfterSeconds;
	}

	public static BlockAuthException invalid(String field, String message) {
		return new BlockAuthException(ErrorCode.VALIDATION_FAILED, List.of(new ApiError.FieldError(field, message)), 0);
	}

	public ErrorCode code() {
		return code;
	}

	public List<ApiError.FieldError> fieldErrors() {
		return fieldErrors;
	}

	public long retryAfterSeconds() {
		return retryAfterSeconds;
	}

}
