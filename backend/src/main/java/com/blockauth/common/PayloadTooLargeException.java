package com.blockauth.common;

import java.io.IOException;

/** Raised while reading a request body that exceeds the size limit without declaring a Content-Length. */
public class PayloadTooLargeException extends IOException {

	public PayloadTooLargeException() {
		super("Request body too large");
	}

}
