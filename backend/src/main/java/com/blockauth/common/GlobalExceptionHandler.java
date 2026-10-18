package com.blockauth.common;

import java.util.List;
import java.util.UUID;

import org.apache.tomcat.util.http.InvalidParameterException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.transaction.TransactionException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Path;

/**
 * Maps every failure to an entry of the error catalog. Responses carry the code's fixed message only:
 * never an exception message, stack trace, SQL or URL.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

	@ExceptionHandler(BlockAuthException.class)
	ResponseEntity<ApiError> handle(BlockAuthException ex, HttpServletRequest request) {
		return respond(ex.code(), request, ex.fieldErrors(), ex.retryAfterSeconds());
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	ResponseEntity<ApiError> handle(MethodArgumentNotValidException ex, HttpServletRequest request) {
		List<ApiError.FieldError> fields = ex.getBindingResult().getFieldErrors().stream()
				.map(f -> new ApiError.FieldError(f.getField(), f.getDefaultMessage())).toList();
		return respond(ErrorCode.VALIDATION_FAILED, request, fields, 0);
	}

	@ExceptionHandler(ConstraintViolationException.class)
	ResponseEntity<ApiError> handle(ConstraintViolationException ex, HttpServletRequest request) {
		List<ApiError.FieldError> fields = ex.getConstraintViolations().stream()
				.map(v -> new ApiError.FieldError(lastNode(v.getPropertyPath()), v.getMessage())).toList();
		return respond(ErrorCode.VALIDATION_FAILED, request, fields, 0);
	}

	@ExceptionHandler(MethodArgumentTypeMismatchException.class)
	ResponseEntity<ApiError> handle(MethodArgumentTypeMismatchException ex, HttpServletRequest request) {
		return respond(ErrorCode.VALIDATION_FAILED, request,
				List.of(new ApiError.FieldError(ex.getName(), "has an invalid value")), 0);
	}

	@ExceptionHandler(MissingServletRequestParameterException.class)
	ResponseEntity<ApiError> handle(MissingServletRequestParameterException ex, HttpServletRequest request) {
		return respond(ErrorCode.VALIDATION_FAILED, request,
				List.of(new ApiError.FieldError(ex.getParameterName(), "is required")), 0);
	}

	/** A query string the servlet container cannot parse, such as a parameter without a name ("?=&page=0"). */
	@ExceptionHandler(InvalidParameterException.class)
	ResponseEntity<ApiError> handle(InvalidParameterException ex, HttpServletRequest request) {
		return respond(ErrorCode.VALIDATION_FAILED, request);
	}

	@ExceptionHandler(HttpMessageNotReadableException.class)
	ResponseEntity<ApiError> handle(HttpMessageNotReadableException ex, HttpServletRequest request) {
		// The body-size limit surfaces here when a chunked body overruns while being parsed.
		for (Throwable t = ex; t != null; t = t.getCause()) {
			if (t instanceof PayloadTooLargeException) {
				return respond(ErrorCode.PAYLOAD_TOO_LARGE, request);
			}
		}
		return respond(ErrorCode.MALFORMED_REQUEST, request);
	}

	@ExceptionHandler(HttpMediaTypeNotSupportedException.class)
	ResponseEntity<ApiError> handle(HttpMediaTypeNotSupportedException ex, HttpServletRequest request) {
		return respond(ErrorCode.UNSUPPORTED_MEDIA_TYPE, request);
	}

	@ExceptionHandler(HttpRequestMethodNotSupportedException.class)
	ResponseEntity<ApiError> handle(HttpRequestMethodNotSupportedException ex, HttpServletRequest request) {
		return respond(ErrorCode.METHOD_NOT_ALLOWED, request);
	}

	@ExceptionHandler({ NoResourceFoundException.class, NoHandlerFoundException.class })
	ResponseEntity<ApiError> handleNotFound(Exception ex, HttpServletRequest request) {
		return respond(ErrorCode.RESOURCE_NOT_FOUND, request);
	}

	@ExceptionHandler({ DataAccessException.class, TransactionException.class })
	ResponseEntity<ApiError> handleDatabase(Exception ex, HttpServletRequest request) {
		// The exception text can contain SQL and the JDBC URL, so only its type is logged.
		log.error("Database failure on {}: {}", request.getRequestURI(), ex.getClass().getSimpleName());
		return body(ErrorCode.DATABASE_UNAVAILABLE, request, null, List.of(), 0);
	}

	@ExceptionHandler(Exception.class)
	ResponseEntity<ApiError> handleUnexpected(Exception ex, HttpServletRequest request) {
		String errorId = UUID.randomUUID().toString();
		log.error("Unexpected error {} on {}", errorId, request.getRequestURI(), ex);
		return body(ErrorCode.INTERNAL_ERROR, request, errorId, List.of(), 0);
	}

	private static ResponseEntity<ApiError> respond(ErrorCode code, HttpServletRequest request) {
		return respond(code, request, List.of(), 0);
	}

	private static ResponseEntity<ApiError> respond(ErrorCode code, HttpServletRequest request,
			List<ApiError.FieldError> fieldErrors, long retryAfterSeconds) {
		log.atLevel(code.logLevel()).log("{} on {} {}", code, request.getMethod(), request.getRequestURI());
		return body(code, request, null, fieldErrors, retryAfterSeconds);
	}

	private static ResponseEntity<ApiError> body(ErrorCode code, HttpServletRequest request, String errorId,
			List<ApiError.FieldError> fieldErrors, long retryAfterSeconds) {
		ResponseEntity.BodyBuilder builder = ResponseEntity.status(code.status());
		if (retryAfterSeconds > 0) {
			builder.header(HttpHeaders.RETRY_AFTER, Long.toString(retryAfterSeconds));
		}
		return builder.body(ApiError.of(code, request.getRequestURI(), errorId, fieldErrors));
	}

	private static String lastNode(Path path) {
		String name = null;
		for (Path.Node node : path) {
			name = node.getName();
		}
		return name;
	}

}
