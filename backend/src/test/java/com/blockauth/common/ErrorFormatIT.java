package com.blockauth.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;

import java.io.ByteArrayInputStream;
import java.net.http.HttpRequest.BodyPublishers;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.web.multipart.MultipartResolver;

import com.blockauth.Api;
import com.blockauth.IntegrationTest;
import com.blockauth.TestWallet;

/** IT-10 / ST-11 / ST-24 / ST-25: the standard error body, input validation and injection payloads. */
class ErrorFormatIT extends IntegrationTest {

	private static final String WALLET = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
	private static final String INTERNAL_DETAIL = "jdbc:postgresql://db.internal/blockauth?password=hunter2";

	@Autowired
	private ApplicationContext context;

	@Test
	void errorsUseTheStandardBody() {
		Api.Response response = browser().get("/api/users/me");

		assertThat(response.headers().firstValue("Content-Type").orElseThrow()).startsWith("application/json");
		assertShape(response.body(), "status", "code", "message", "timestamp", "path", "errorId", "fieldErrors");
		assertThat(response.body().get("status").asInt()).isEqualTo(401);
		assertThat(response.body().get("message").asString()).isEqualTo("Authentication required.");
		assertThat(response.body().get("timestamp").asString()).matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z");
		assertThat(response.body().get("path").asString()).isEqualTo("/api/users/me");
		assertThat(response.body().get("errorId").isNull()).isTrue();
		assertThat(response.body().get("fieldErrors").isEmpty()).isTrue();
	}

	@Test
	void apiResponsesCarrySecurityHeaders() {
		var headers = browser().get("/api/auth/csrf").headers();

		assertThat(headers.firstValue("X-Content-Type-Options")).contains("nosniff");
		assertThat(headers.firstValue("X-Frame-Options")).contains("DENY");
		assertThat(headers.firstValue("Referrer-Policy")).contains("no-referrer");
		assertThat(headers.firstValue("Content-Security-Policy")).contains("default-src 'none'; frame-ancestors 'none'");
		assertThat(headers.firstValue("Cache-Control").orElseThrow()).contains("no-store");
		// No CORS: another origin is never told it may read these responses.
		assertThat(headers.firstValue("Access-Control-Allow-Origin")).isEmpty();
		assertThat(headers.firstValue("Server")).isEmpty();
	}

	@Test
	void theResponseFormatDoesNotDependOnTheAcceptHeader() {
		Api api = browser();

		Api.Response ok = api.send("GET", "/api/auth/csrf", null, Map.of("Accept", "application/xml"), true);
		Api.Response error = api.send("GET", "/api/users/me", null, Map.of("Accept", "text/html"), true);

		assertThat(ok.status()).isEqualTo(200);
		assertThat(ok.headers().firstValue("Content-Type").orElseThrow()).startsWith("application/json");
		assertThat(ok.body().has("token")).isTrue();
		assertThat(error.status()).isEqualTo(401);
		assertThat(error.code()).isEqualTo("UNAUTHENTICATED");
	}

	@Test
	void malformedBodiesAreRejectedWithoutLeakingParserDetails() {
		Api api = browser();

		Api.Response unknownField = api.post("/api/auth/challenge", Map.of("walletAddress", WALLET, "extra", 1));
		Api.Response brokenJson = api.send("POST", "/api/auth/challenge", "{\"walletAddress\":", Map.of(), true);
		Api.Response wrongType = api.send("POST", "/api/auth/challenge", "{\"walletAddress\":{}}", Map.of(), true);
		Api.Response notAnObject = api.send("POST", "/api/auth/challenge", "[]", Map.of(), true);

		for (Api.Response response : new Api.Response[] { unknownField, brokenJson, wrongType, notAnObject }) {
			assertThat(response.status()).isEqualTo(400);
			assertThat(response.code()).isEqualTo("MALFORMED_REQUEST");
			assertThat(response.body().toString()).doesNotContainIgnoringCase("jackson").doesNotContain("Exception",
					"line:", "com.blockauth");
		}
	}

	@Test
	void missingBodyOrFieldsAreValidationOrFormatErrors() {
		Api api = browser();

		Api.Response emptyObject = api.post("/api/auth/challenge", Map.of());
		Api.Response noBody = api.send("POST", "/api/auth/challenge", "", Map.of(), true);

		assertThat(emptyObject.status()).isEqualTo(400);
		assertThat(emptyObject.code()).isEqualTo("VALIDATION_FAILED");
		assertThat(emptyObject.body().get("fieldErrors").get(0).get("field").asString()).isEqualTo("walletAddress");
		assertThat(emptyObject.body().get("fieldErrors").get(0).get("message").asString()).isEqualTo("is required");
		assertThat(noBody.status()).isEqualTo(400);
		assertThat(noBody.code()).isEqualTo("MALFORMED_REQUEST");
	}

	@Test
	void wrongContentTypeIs415() {
		Api api = browser();

		Api.Response text = api.send("POST", "/api/auth/challenge", "walletAddress=" + WALLET,
				Map.of("Content-Type", "text/plain"), true);
		Api.Response multipart = api.send("POST", "/api/auth/challenge", "--x\r\n\r\n--x--\r\n",
				Map.of("Content-Type", "multipart/form-data; boundary=x"), true);

		assertThat(text.status()).isEqualTo(415);
		assertThat(text.code()).isEqualTo("UNSUPPORTED_MEDIA_TYPE");
		assertThat(multipart.status()).isEqualTo(415);
		// File uploads do not exist here, so the container must not parse multipart bodies at all.
		assertThat(context.getBeanNamesForType(MultipartResolver.class)).isEmpty();
	}

	@Test
	void oversizedBodiesAre413WhetherDeclaredOrStreamed() {
		Api api = browser();
		String big = "{\"walletAddress\":\"" + "a".repeat(20_000) + "\"}";
		String justUnder = "{\"walletAddress\":\"" + "a".repeat(16_000) + "\"}";

		Api.Response declared = api.send("POST", "/api/auth/challenge", big, Map.of(), true);
		Api.Response chunked = api.send("POST", "/api/auth/challenge",
				BodyPublishers.ofInputStream(() -> new ByteArrayInputStream(big.getBytes(StandardCharsets.UTF_8))),
				true, Map.of(), true);
		Api.Response allowedSize = api.send("POST", "/api/auth/challenge", justUnder, Map.of(), true);

		assertThat(declared.status()).isEqualTo(413);
		assertThat(declared.code()).isEqualTo("PAYLOAD_TOO_LARGE");
		assertThat(chunked.status()).isEqualTo(413);
		assertThat(chunked.code()).isEqualTo("PAYLOAD_TOO_LARGE");
		// Under the limit the body is read, and fails for what it contains rather than for its size.
		assertThat(allowedSize.status()).isEqualTo(400);
		assertThat(allowedSize.code()).isEqualTo("VALIDATION_FAILED");
	}

	@Test
	void injectionPayloadsAreValidationErrorsAndLeaveTheDatabaseIntact() {
		Api admin = registeredAndLoggedIn(ADMIN);

		Api.Response body = admin.post("/api/auth/challenge", Map.of("walletAddress", "' OR '1'='1"));
		Api.Response path = admin.get("/api/blockchain/wallet/0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed;DROP%20TABLE%20users;--");
		Api.Response pathOr = admin.get("/api/blockchain/wallet/'%20OR%20'1'='1");
		Api.Response enumFilter = admin.get("/api/admin/authentication-events?eventType=LOGIN'%20--");
		Api.Response walletFilter = admin.get("/api/admin/users?walletAddress='%20OR%201=1--");
		Api.Response badPage = admin.get("/api/admin/users?page=-1");
		Api.Response badSize = admin.get("/api/admin/users?size=101");
		Api.Response zeroSize = admin.get("/api/admin/users?size=0");
		Api.Response notANumber = admin.get("/api/admin/users?page=abc");
		Api.Response badRange = admin
				.get("/api/admin/security-events?from=2026-10-07T00:00:00Z&to=2026-10-06T00:00:00Z");
		Api.Response badInstant = admin.get("/api/admin/security-events?from=yesterday");
		Api.Response zeroAddress = admin.get("/api/blockchain/verify/0x0000000000000000000000000000000000000000");
		Api.Response badChecksum = admin.get("/api/blockchain/verify/0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");

		// The ";" path never reaches a controller: the HTTP firewall rejects it.
		assertThat(path.status()).isEqualTo(400);
		assertThat(path.code()).isEqualTo("VALIDATION_FAILED");
		for (Api.Response response : new Api.Response[] { body, pathOr, enumFilter, walletFilter, badPage, badSize,
				zeroSize, notANumber, badRange, badInstant, zeroAddress, badChecksum }) {
			assertThat(response.status()).as(response.body().toString()).isEqualTo(400);
			assertThat(response.code()).isEqualTo("VALIDATION_FAILED");
			assertThat(response.body().get("fieldErrors").size()).isEqualTo(1);
			assertThat(response.body().toString()).doesNotContainIgnoringCase("sql").doesNotContain("Exception");
		}
		assertThat(body.body().get("fieldErrors").get(0).get("field").asString()).isEqualTo("walletAddress");
		assertThat(count("select count(*) from users")).isEqualTo(1);
		assertThat(count("select count(*) from security_events where attack_type = 'PRIVILEGE_ESCALATION_ATTEMPT'"))
				.isZero();
	}

	@Test
	void aQueryParameterWithoutANameIsAValidationErrorNotA500() {
		// Found by the 2026-10-19 ZAP scan: the servlet container refuses "?=" and that ended in a 500.
		Api admin = registeredAndLoggedIn(ADMIN);
		for (String path : java.util.List.of("/api/admin/users?=&size=20", "/api/admin/actions?=&page=0",
				"/api/admin/api-keys?page=0&=", "/api/admin/authentication-events?=",
				"/api/users/authentication-history?=&page=0")) {
			Api.Response response = admin.get(path);
			assertThat(response.status()).as(path).isEqualTo(400);
			assertThat(response.code()).as(path).isEqualTo("VALIDATION_FAILED");
			assertThat(response.body().path("errorId").isNull()).as(path).isTrue();
		}
		// Ordinary requests on the same session are unaffected.
		assertThat(admin.get("/api/admin/users?size=20").status()).isEqualTo(200);
	}

	@Test
	void unmappedAdminPathIs404AndWrongMethodIs405() {
		Api admin = registeredAndLoggedIn(ADMIN);

		Api.Response missing = admin.get("/api/admin/nothing-here");
		Api.Response wrongMethod = admin.send("PUT", "/api/admin/users", null, Map.of(), true);

		assertThat(missing.status()).isEqualTo(404);
		assertThat(missing.code()).isEqualTo("RESOURCE_NOT_FOUND");
		assertThat(wrongMethod.status()).isEqualTo(405);
		assertThat(wrongMethod.code()).isEqualTo("METHOD_NOT_ALLOWED");
	}

	@Test
	void unexpectedFailureIsA500ThatExposesOnlyAnErrorId() {
		Api api = browser();
		doThrow(new IllegalStateException(INTERNAL_DETAIL)).when(registry).getWalletStatus(anyString());

		Api.Response response = login(api, new TestWallet());

		assertThat(response.status()).isEqualTo(500);
		assertThat(response.code()).isEqualTo("INTERNAL_ERROR");
		assertThat(response.body().get("message").asString()).isEqualTo("An unexpected error occurred.");
		assertThat(response.body().get("errorId").asString())
				.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
		assertThat(response.body().toString()).doesNotContain("hunter2", "jdbc", "IllegalStateException", "at com.");
		assertThat(api.cookies).doesNotContainKey("BLOCKAUTH_SESSION");
	}

	@Test
	void databaseFailureIsAGeneric503AndAuthenticationFailsClosed() {
		Api api = browser();
		// Raised by the mocked collaborator to exercise the handler: the type is what a lost connection throws.
		doThrow(new DataAccessResourceFailureException(INTERNAL_DETAIL)).when(registry).getWalletStatus(anyString());

		Api.Response response = login(api, new TestWallet());

		assertThat(response.status()).isEqualTo(503);
		assertThat(response.code()).isEqualTo("DATABASE_UNAVAILABLE");
		assertThat(response.body().get("errorId").isNull()).isTrue();
		assertThat(response.body().toString()).doesNotContain("hunter2", "jdbc", "Exception");
		assertThat(api.cookies).doesNotContainKey("BLOCKAUTH_SESSION");
	}

	@Test
	void noDefaultUserOrPasswordMechanismExists() {
		assertThat(context.getBeanNamesForType(UserDetailsService.class)).isEmpty();
	}

}
