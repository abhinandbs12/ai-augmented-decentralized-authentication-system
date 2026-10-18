package com.blockauth.audit;

/** Where a request came from, as recorded with audit events. The user agent is untrusted text. */
public record ClientInfo(String ip, String userAgent) {
}
