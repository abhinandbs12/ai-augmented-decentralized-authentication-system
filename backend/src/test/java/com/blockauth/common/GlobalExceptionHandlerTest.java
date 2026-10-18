package com.blockauth.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Path;

class GlobalExceptionHandlerTest {

	private static final String SECRET = "jdbc:postgresql://db.internal/blockauth?password=hunter2";

	private final GlobalExceptionHandler handler = new GlobalExceptionHandler();
	private final MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/verify");

	@ParameterizedTest
	@EnumSource(ErrorCode.class)
	void everyErrorCodeMapsToItsStatusAndFixedMessage(ErrorCode code) {
		ResponseEntity<ApiError> response = handler.handle(new BlockAuthException(code), request);

		assertThat(response.getStatusCode().value()).isEqualTo(code.status());
		ApiError body = response.getBody();
		assertThat(body.status()).isEqualTo(code.status());
		assertThat(body.code()).isEqualTo(code.name());
		assertThat(body.message()).isEqualTo(code.message());
		assertThat(body.path()).isEqualTo("/api/auth/verify");
		assertThat(body.timestamp()).isNotNull();
		assertThat(body.errorId()).isNull();
		assertThat(body.fieldErrors()).isEmpty();
	}

	@Test
	void validationFailureCarriesFieldErrors() {
		ApiError body = handler.handle(BlockAuthException.invalid("walletAddress", "must be an address"), request)
				.getBody();

		assertThat(body.code()).isEqualTo("VALIDATION_FAILED");
		assertThat(body.fieldErrors()).containsExactly(new ApiError.FieldError("walletAddress", "must be an address"));
	}

	@Test
	void constraintViolationsBecomeFieldErrorsNamedByTheirLastPathNode() {
		Path.Node method = mock(Path.Node.class);
		Path.Node parameter = mock(Path.Node.class);
		when(method.getName()).thenReturn("history");
		when(parameter.getName()).thenReturn("size");
		Path path = mock(Path.class);
		when(path.iterator()).thenAnswer(call -> List.of(method, parameter).iterator());
		ConstraintViolation<?> violation = mock(ConstraintViolation.class);
		when(violation.getPropertyPath()).thenReturn(path);
		when(violation.getMessage()).thenReturn("must be between 1 and 100");

		ApiError body = handler.handle(new ConstraintViolationException(Set.of(violation)), request).getBody();

		assertThat(body.status()).isEqualTo(400);
		assertThat(body.code()).isEqualTo("VALIDATION_FAILED");
		assertThat(body.fieldErrors()).containsExactly(new ApiError.FieldError("size", "must be between 1 and 100"));
	}

	@Test
	void rateLimitCarriesRetryAfter() {
		ResponseEntity<ApiError> response = handler.handle(new BlockAuthException(ErrorCode.RATE_LIMITED, 42),
				request);

		assertThat(response.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)).isEqualTo("42");
	}

	@Test
	void unexpectedErrorExposesOnlyAnErrorId() {
		ApiError body = handler.handleUnexpected(new IllegalStateException(SECRET), request).getBody();

		assertThat(body.status()).isEqualTo(500);
		assertThat(body.code()).isEqualTo("INTERNAL_ERROR");
		assertThat(body.errorId()).isNotBlank();
		assertThat(body.toString()).doesNotContain("hunter2", "jdbc", "IllegalStateException");
	}

	@Test
	void databaseFailureIsAGeneric503() {
		ApiError body = handler.handleDatabase(new DataAccessResourceFailureException(SECRET), request).getBody();

		assertThat(body.status()).isEqualTo(503);
		assertThat(body.code()).isEqualTo("DATABASE_UNAVAILABLE");
		assertThat(body.toString()).doesNotContain("hunter2", "jdbc");
	}

}
