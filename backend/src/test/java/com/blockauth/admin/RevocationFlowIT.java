package com.blockauth.admin;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.blockauth.Api;
import com.blockauth.IntegrationTest;
import com.blockauth.TestWallet;

/** IT-05 / ST-09 / ST-10: revocation ends sessions and blocks login until the wallet is reactivated. */
class RevocationFlowIT extends IntegrationTest {

	private final TestWallet userWallet = new TestWallet();
	private Api admin;
	private Api user;

	@Autowired
	private AdminActionService adminActions;

	@BeforeEach
	void signIn() {
		admin = registeredAndLoggedIn(ADMIN);
		user = registeredAndLoggedIn(userWallet);
	}

	private Api.Response revoke(TestWallet target) {
		return admin.post("/api/admin/wallet/" + target.checksumAddress() + "/revoke",
				proof(admin, ADMIN, "REVOKE_WALLET", target));
	}

	private Api.Response activate(TestWallet target) {
		return admin.post("/api/admin/wallet/" + target.checksumAddress() + "/activate",
				proof(admin, ADMIN, "ACTIVATE_WALLET", target));
	}

	@Test
	void revokeEndsTheSessionAndBlocksLoginUntilReactivated() {
		Api.Response revoke = revoke(userWallet);

		assertThat(revoke.status()).isEqualTo(200);
		assertShape(revoke.body(), "walletAddress", "status", "transactionHash");
		assertThat(revoke.body().get("walletAddress").asString()).isEqualTo(userWallet.checksumAddress());
		assertThat(revoke.body().get("status").asString()).isEqualTo("REVOKED");
		assertThat(revoke.body().get("transactionHash").asString()).startsWith("0x");
		assertThat(chain.get(userWallet.address()).active()).isFalse();
		assertThat(count("select count(*) from users where wallet_address = ? and status = 'REVOKED'",
				userWallet.address())).isEqualTo(1);
		assertThat(count("select count(*) from authentication_events e join users a on a.id = e.actor_user_id "
				+ "join users u on u.id = e.user_id where e.event_type = 'WALLET_REVOKED' and u.wallet_address = ? "
				+ "and a.wallet_address = ?", userWallet.address(), ADMIN.address())).isEqualTo(1);
		// The session records were closed by the revocation itself...
		assertThat(count("select count(*) from user_sessions s join users u on u.id = s.user_id "
				+ "where u.wallet_address = ? and s.end_reason = 'WALLET_REVOKED'", userWallet.address())).isEqualTo(1);

		// ...so the open session dies on its next request.
		Api.Response me = user.get("/api/users/me");
		assertThat(me.status()).isEqualTo(401);
		assertThat(me.code()).isEqualTo("SESSION_REVOKED");
		assertThat(user.get("/api/users/me").code()).isEqualTo("UNAUTHENTICATED");
		assertThat(count("select count(*) from authentication_events where event_type = 'SESSION_TERMINATED' "
				+ "and wallet_address = ?", userWallet.address())).isEqualTo(1);

		// A fresh, correctly signed login is refused by the chain check.
		Api.Response login = login(user, userWallet);
		assertThat(login.status()).isEqualTo(403);
		assertThat(login.code()).isEqualTo("WALLET_REVOKED");
		assertThat(user.get("/api/users/me").code()).isEqualTo("UNAUTHENTICATED");
		assertThat(count("select count(*) from security_events where attack_type = 'REVOKED_WALLET_ATTEMPT'"))
				.isEqualTo(1);

		// Reactivation is scheduled, not immediate.
		Api.Response activate = activate(userWallet);
		assertThat(activate.status()).isEqualTo(202);
		assertThat(activate.body().get("action").asString()).isEqualTo("ACTIVATE_WALLET");
		assertThat(activate.body().get("status").asString()).isEqualTo("PENDING");
		adminActions.runDue();
		assertThat(chain.get(userWallet.address()).active()).isFalse();
		assertThat(login(browser(), userWallet).code()).isEqualTo("WALLET_REVOKED");

		clock.advance(Duration.ofMinutes(10).plusSeconds(1));
		adminActions.runDue();
		assertThat(chain.get(userWallet.address()).active()).isTrue();
		assertThat(count("select count(*) from users where wallet_address = ? and status = 'ACTIVE'",
				userWallet.address())).isEqualTo(1);
		assertThat(login(user, userWallet).status()).isEqualTo(200);
		assertThat(count("select count(*) from authentication_events e join users a on a.id = e.actor_user_id "
				+ "where e.event_type = 'WALLET_ACTIVATED' and a.wallet_address = ?", ADMIN.address())).isEqualTo(1);
		assertThat(count("select count(*) from admin_actions where status = 'EXECUTED'")).isEqualTo(1);
	}

	@Test
	void adminCannotRevokeOrActivateOwnWallet() {
		Api.Response revoke = revoke(ADMIN);
		Api.Response activate = admin.post("/api/admin/wallet/" + ADMIN.address() + "/activate",
				proof(admin, ADMIN, "ACTIVATE_WALLET", ADMIN));

		assertThat(revoke.status()).isEqualTo(409);
		assertThat(revoke.code()).isEqualTo("CANNOT_MODIFY_OWN_WALLET");
		assertThat(activate.code()).isEqualTo("CANNOT_MODIFY_OWN_WALLET");
		assertThat(chain.get(ADMIN.address()).active()).isTrue();
	}

	@Test
	void repeatedOrImpossibleChangesAreConflictsNotTransactions() {
		String base = "/api/admin/wallet/" + userWallet.checksumAddress();
		assertThat(activate(userWallet).code()).isEqualTo("WALLET_ALREADY_ACTIVE");
		revoke(userWallet);
		Api.Response again = revoke(userWallet);
		assertThat(again.status()).isEqualTo(409);
		assertThat(again.code()).isEqualTo("WALLET_ALREADY_REVOKED");

		Api.Response unknown = revoke(new TestWallet());
		assertThat(unknown.status()).isEqualTo(404);
		assertThat(unknown.code()).isEqualTo("WALLET_NOT_FOUND");

		Map<String, Object> anyProof = Map.of("proof", Map.of("challenge", "x", "signature", "0x" + "00".repeat(65)));
		assertThat(admin.post("/api/admin/wallet/0x123/revoke", anyProof).code()).isEqualTo("VALIDATION_FAILED");
		assertThat(admin.post(base + "/revoke", null).code()).isEqualTo("MALFORMED_REQUEST");
		assertThat(count("select count(*) from authentication_events where event_type = 'WALLET_REVOKED'"))
				.isEqualTo(1);
	}

	@Test
	void staleMirrorIsRepairedFromTheChainAndCanNeverGrantALogin() {
		// The chain says revoked while the database mirror still says active.
		registry.revokeWallet(userWallet.address());

		Api.Response login = login(browser(), userWallet);

		assertThat(login.status()).isEqualTo(403);
		assertThat(login.code()).isEqualTo("WALLET_REVOKED");
		assertThat(count("select count(*) from users where wallet_address = ? and status = 'REVOKED'",
				userWallet.address())).isEqualTo(1);
		// With the mirror corrected, the session that was still open ends too.
		assertThat(user.get("/api/users/me").code()).isEqualTo("SESSION_REVOKED");
	}

	@Test
	void revokedWalletCannotReRegister() {
		revoke(userWallet);

		Api.Response response = register(browser(), userWallet);

		assertThat(response.status()).isEqualTo(403);
		assertThat(response.code()).isEqualTo("WALLET_REVOKED");
	}

	@Test
	void adminListsShowTheMirroredStatus() {
		revoke(userWallet);

		Api.Response revoked = admin.get("/api/admin/users?status=REVOKED");
		assertShape(revoked.body(), "items", "page", "size", "totalElements", "totalPages");
		assertThat(revoked.body().get("totalElements").asInt()).isEqualTo(1);
		assertShape(revoked.body().get("items").get(0), "id", "walletAddress", "role", "status", "createdAt",
				"updatedAt");
		assertThat(revoked.body().get("items").get(0).get("walletAddress").asString())
				.isEqualTo(userWallet.checksumAddress());
		assertThat(admin.get("/api/admin/users?role=ADMIN").body().get("totalElements").asInt()).isEqualTo(1);
		assertThat(admin.get("/api/admin/users?walletAddress=" + userWallet.address()).body().get("totalElements")
				.asInt()).isEqualTo(1);
		assertThat(admin.get("/api/admin/users?status=ACTIVE&role=USER").body().get("totalElements").asInt())
				.isZero();
		Api.Response all = admin.get("/api/admin/users?size=1");
		assertThat(all.body().get("totalElements").asInt()).isEqualTo(2);
		assertThat(all.body().get("totalPages").asInt()).isEqualTo(2);
		// Newest first.
		assertThat(all.body().get("items").get(0).get("walletAddress").asString())
				.isEqualTo(userWallet.checksumAddress());
	}

}
