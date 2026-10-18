package com.blockauth.security;

import java.io.IOException;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.blockauth.common.ApiErrorWriter;
import com.blockauth.common.ErrorCode;
import com.blockauth.common.PayloadTooLargeException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;

/** Rejects request bodies over 16 KB, whether declared by Content-Length or streamed without one. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestSizeLimitFilter extends OncePerRequestFilter {

	static final int MAX_BODY_BYTES = 16 * 1024;

	private final ApiErrorWriter errors;

	public RequestSizeLimitFilter(ApiErrorWriter errors) {
		this.errors = errors;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		long declared = request.getContentLengthLong();
		if (declared > MAX_BODY_BYTES) {
			errors.write(request, response, ErrorCode.PAYLOAD_TOO_LARGE);
			return;
		}
		chain.doFilter(declared < 0 ? new LimitedRequest(request) : request, response);
	}

	private static final class LimitedRequest extends HttpServletRequestWrapper {

		LimitedRequest(HttpServletRequest request) {
			super(request);
		}

		@Override
		public ServletInputStream getInputStream() throws IOException {
			ServletInputStream in = super.getInputStream();
			return new ServletInputStream() {
				private int read;

				@Override
				public int read() throws IOException {
					int b = in.read();
					if (b >= 0 && ++read > MAX_BODY_BYTES) {
						throw new PayloadTooLargeException();
					}
					return b;
				}

				@Override
				public boolean isFinished() {
					return in.isFinished();
				}

				@Override
				public boolean isReady() {
					return in.isReady();
				}

				@Override
				public void setReadListener(ReadListener listener) {
					in.setReadListener(listener);
				}
			};
		}

	}

}
