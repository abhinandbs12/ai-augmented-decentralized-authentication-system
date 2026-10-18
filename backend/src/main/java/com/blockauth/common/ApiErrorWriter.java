package com.blockauth.common;

import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.ObjectMapper;

/** Writes the standard error body from servlet filters and security handlers, which run outside MVC. */
@Component
public class ApiErrorWriter {

	private static final Logger log = LoggerFactory.getLogger(ApiErrorWriter.class);

	private final ObjectMapper objectMapper;

	public ApiErrorWriter(ObjectMapper objectMapper) {
		this.objectMapper = objectMapper;
	}

	public void write(HttpServletRequest request, HttpServletResponse response, ErrorCode code) throws IOException {
		write(request, response, code, 0);
	}

	public void write(HttpServletRequest request, HttpServletResponse response, ErrorCode code, long retryAfterSeconds)
			throws IOException {
		log.atLevel(code.logLevel()).log("{} on {} {}", code, request.getMethod(), request.getRequestURI());
		response.setStatus(code.status());
		response.setContentType(MediaType.APPLICATION_JSON_VALUE);
		response.setCharacterEncoding("UTF-8");
		if (retryAfterSeconds > 0) {
			response.setHeader(HttpHeaders.RETRY_AFTER, Long.toString(retryAfterSeconds));
		}
		response.getWriter().write(objectMapper.writeValueAsString(ApiError.of(code, request.getRequestURI())));
	}

}
