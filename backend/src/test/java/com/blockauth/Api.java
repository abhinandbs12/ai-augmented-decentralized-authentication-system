package com.blockauth;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublisher;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse.BodyHandlers;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * A minimal "browser" for integration tests: real HTTP, its own cookie jar, and the SPA's CSRF
 * behavior (fetch the XSRF-TOKEN cookie, echo it as X-XSRF-TOKEN on state-changing requests).
 */
public final class Api {

	private static final ObjectMapper JSON = new ObjectMapper();

	public record Response(int status, HttpHeaders headers, JsonNode body) {

		public String code() {
			return body.path("code").asString();
		}

		public List<String> setCookies() {
			return headers.allValues("set-cookie");
		}
	}

	public final Map<String, String> cookies = new LinkedHashMap<>();
	private final HttpClient http = HttpClient.newHttpClient();
	private final String baseUrl;

	public Api(String baseUrl) {
		this.baseUrl = baseUrl;
	}

	public static String json(Object value) {
		return JSON.writeValueAsString(value);
	}

	public Response get(String path) {
		return send("GET", path, null, Map.of(), true);
	}

	/** POST a JSON body (a Map), or no body at all when {@code body} is null. */
	public Response post(String path, Object body) {
		return send("POST", path, body == null ? null : json(body), Map.of(), true);
	}

	public Response send(String method, String path, String body, Map<String, String> headers, boolean withCsrf) {
		return send(method, path, body == null ? BodyPublishers.noBody() : BodyPublishers.ofString(body),
				body != null, headers, withCsrf);
	}

	public Response send(String method, String path, BodyPublisher body, boolean json, Map<String, String> headers,
			boolean withCsrf) {
		boolean stateChanging = !method.equals("GET");
		if (stateChanging && withCsrf && !cookies.containsKey("XSRF-TOKEN")) {
			get("/api/auth/csrf");
		}
		HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(baseUrl + path)).method(method, body);
		if (json) {
			request.setHeader("Content-Type", "application/json");
		}
		if (stateChanging && withCsrf) {
			request.setHeader("X-XSRF-TOKEN", cookies.get("XSRF-TOKEN"));
		}
		if (!cookies.isEmpty()) {
			request.setHeader("Cookie", cookies.entrySet().stream().map(c -> c.getKey() + "=" + c.getValue())
					.collect(Collectors.joining("; ")));
		}
		headers.forEach(request::setHeader);
		try {
			var response = http.send(request.build(), BodyHandlers.ofString());
			for (String setCookie : response.headers().allValues("set-cookie")) {
				String[] pair = setCookie.split(";", 2)[0].split("=", 2);
				if (pair.length < 2 || pair[1].isEmpty()) {
					cookies.remove(pair[0]);
				}
				else {
					cookies.put(pair[0], pair[1]);
				}
			}
			String text = response.body();
			return new Response(response.statusCode(), response.headers(),
					text == null || text.isBlank() ? JSON.createObjectNode() : JSON.readTree(text));
		}
		catch (IOException e) {
			throw new IllegalStateException(e);
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException(e);
		}
	}

}
