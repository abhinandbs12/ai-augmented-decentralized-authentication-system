package com.blockauth.session;

/** "Chrome on Windows" from a User-Agent header. Only for display: the header is chosen by the client. */
final class DeviceLabels {

	private DeviceLabels() {
	}

	static String of(String userAgent) {
		if (userAgent == null || userAgent.isBlank()) {
			return "Unknown browser";
		}
		return browser(userAgent) + " on " + system(userAgent);
	}

	private static String browser(String ua) {
		if (ua.contains("Edg/")) {
			return "Edge";
		}
		if (ua.contains("OPR/") || ua.contains("Opera")) {
			return "Opera";
		}
		if (ua.contains("Firefox/")) {
			return "Firefox";
		}
		if (ua.contains("Chrome/") || ua.contains("CriOS/")) {
			return "Chrome";
		}
		if (ua.contains("Safari/")) {
			return "Safari";
		}
		return "Other browser";
	}

	private static String system(String ua) {
		if (ua.contains("Android")) {
			return "Android";
		}
		if (ua.contains("iPhone") || ua.contains("iPad")) {
			return "iOS";
		}
		if (ua.contains("Windows")) {
			return "Windows";
		}
		if (ua.contains("Mac OS X") || ua.contains("Macintosh")) {
			return "macOS";
		}
		if (ua.contains("Linux")) {
			return "Linux";
		}
		return "other system";
	}

}
