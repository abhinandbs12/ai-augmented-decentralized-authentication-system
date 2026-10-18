package com.blockauth.security;

import java.io.IOException;

import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import com.blockauth.common.ApiErrorWriter;
import com.blockauth.common.ErrorCode;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** 401 as JSON for a protected path requested without a valid session; never a redirect. */
@Component
public class RestAuthenticationEntryPoint implements AuthenticationEntryPoint {

	private final ApiErrorWriter errors;

	public RestAuthenticationEntryPoint(ApiErrorWriter errors) {
		this.errors = errors;
	}

	@Override
	public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException exception)
			throws IOException {
		errors.write(request, response, ErrorCode.UNAUTHENTICATED);
	}

}
