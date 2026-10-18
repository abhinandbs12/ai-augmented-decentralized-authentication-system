package com.blockauth.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import tools.jackson.databind.JsonNode;

import com.blockauth.Api;
import com.blockauth.IntegrationTest;
import com.blockauth.TestWallet;
import com.blockauth.common.BlockAuthException;
import com.blockauth.common.ErrorCode;
import com.blockauth.secondstep.SecondStepTestSupport;

/** Administrator actions that restore access wait ten minutes, during which any administrator can cancel. */
class AdminActionIT extends IntegrationTest {

	private static final Duration AFTER_DELAY = Duration.ofMinutes(10).plusSeconds(1);

	@Autowired
	private AdminActionService actions;

	private final TestWallet user = new TestWallet();
	private Api admin;

	@BeforeEach
	void setUp() {
		admin = registeredAndLoggedIn(ADMIN);
	}

	private void revoke(TestWallet target) {
		assertThat(admin.post("/api/admin/wallet/" + target.checksumAddress() + "/revoke",
				proof(admin, ADMIN, "REVOKE_WALLET", target)).status()).isEqualTo(200);
	}

	private Api.Response requestActivation(Api as, TestWallet signer, TestWallet target) {
		return as.post("/api/admin/wallet/" + target.checksumAddress() + "/activate",
				proof(as, signer, "ACTIVATE_WALLET", target));
	}

	private String status(long id) {
		return jdbc.queryForObject("select status from admin_actions where id = ?", String.class, id);
	}

	/** A second administrator: a registered wallet given the role in the database, then signed in. */
	private Api secondAdmin(TestWallet wallet) {
		Api api = browser();
		assertThat(register(api, wallet).status()).isEqualTo(201);
		jdbc.update("update users set role = 'ADMIN' where wallet_address = ?", wallet.address());
		assertThat(login(api, wallet).status()).isEqualTo(200);
		return api;
	}

	@Test
	void anActivationWaitsForTheDelayAndIsCarriedOutByTheServer() {
		register(browser(), user);
		revoke(user);

		Api.Response requested = requestActivation(admin, ADMIN, user);

		assertThat(requested.status()).isEqualTo(202);
		JsonNode view = requested.body();
		assertThat(view.get("targetWallet").asString()).isEqualTo(user.checksumAddress());
		assertThat(view.get("requestedBy").asString()).isEqualTo(ADMIN.checksumAddress());
		assertThat(Duration.between(Instant.parse(view.get("requestedAt").asString()),
				Instant.parse(view.get("executeAfter").asString()))).isEqualTo(Duration.ofMinutes(10));
		assertThat(login(browser(), user).code()).isEqualTo("WALLET_REVOKED");
		assertThat(admin.get("/api/admin/actions?status=PENDING").body().get("items")).hasSize(1);
		assertThat(count("select count(*) from authentication_events where event_type = 'ACTION_REQUESTED'"))
			.isEqualTo(1);

		clock.advance(Duration.ofMinutes(9));
		actions.runDue();
		assertThat(chain.get(user.address()).active()).isFalse();
		clock.advance(Duration.ofMinutes(1).plusSeconds(1));
		actions.runDue();

		assertThat(chain.get(user.address()).active()).isTrue();
		assertThat(status(view.get("id").asLong())).isEqualTo("EXECUTED");
		assertThat(login(browser(), user).status()).isEqualTo(200);
	}

	@Test
	void anyAdministratorCanCancelAWaitingAction() {
		register(browser(), user);
		revoke(user);
		long id = requestActivation(admin, ADMIN, user).body().get("id").asLong();
		Api colleague = secondAdmin(new TestWallet());

		Api.Response cancelled = colleague.post("/api/admin/actions/" + id + "/cancel", null);

		assertThat(cancelled.status()).isEqualTo(200);
		assertThat(cancelled.body().get("status").asString()).isEqualTo("CANCELLED");
		assertThat(cancelled.body().get("requestedBy").asString()).isEqualTo(ADMIN.checksumAddress());
		clock.advance(AFTER_DELAY);
		actions.runDue();
		assertThat(chain.get(user.address()).active()).isFalse();
		assertThat(admin.post("/api/admin/actions/" + id + "/cancel", null).code())
			.isEqualTo("ADMIN_ACTION_NOT_PENDING");
		assertThat(admin.post("/api/admin/actions/999999/cancel", null).status()).isEqualTo(404);
		assertThat(count("select count(*) from authentication_events where event_type = 'ACTION_CANCELLED'"))
			.isEqualTo(1);
	}

	@Test
	void onlyOneRequestPerWalletCanWait() {
		register(browser(), user);
		revoke(user);
		assertThat(requestActivation(admin, ADMIN, user).status()).isEqualTo(202);

		assertThat(requestActivation(admin, ADMIN, user).code()).isEqualTo("ADMIN_ACTION_ALREADY_PENDING");
		assertThat(count("select count(*) from admin_actions")).isEqualTo(1);
	}

	@Test
	void anActionFailsIfItsRequesterIsNoLongerAnActiveAdministrator() {
		register(browser(), user);
		revoke(user);
		long id = requestActivation(admin, ADMIN, user).body().get("id").asLong();
		jdbc.update("update users set role = 'USER' where wallet_address = ?", ADMIN.address());

		clock.advance(AFTER_DELAY);
		actions.runDue();

		assertThat(status(id)).isEqualTo("FAILED");
		assertThat(jdbc.queryForObject("select failure_reason from admin_actions where id = ?", String.class, id))
			.isEqualTo("ACCESS_DENIED");
		assertThat(chain.get(user.address()).active()).isFalse();
	}

	@Test
	void aTemporaryChainFailureIsRetried() {
		register(browser(), user);
		revoke(user);
		long id = requestActivation(admin, ADMIN, user).body().get("id").asLong();
		doThrow(new BlockAuthException(ErrorCode.BLOCKCHAIN_UNAVAILABLE)).when(registry).activateWallet(anyString());

		clock.advance(AFTER_DELAY);
		actions.runDue();

		assertThat(status(id)).isEqualTo("PENDING");
		assertThat(jdbc.queryForObject("select failure_reason from admin_actions where id = ?", String.class, id))
			.isEqualTo("BLOCKCHAIN_UNAVAILABLE");
		stubChain();
		clock.advance(Duration.ofSeconds(61));
		actions.runDue();
		assertThat(status(id)).isEqualTo("EXECUTED");
		assertThat(chain.get(user.address()).active()).isTrue();
	}

	@Test
	void anUnexpectedFailureReturnsTheActionToTheQueueWhereItCanBeCancelled() {
		register(browser(), user);
		revoke(user);
		long id = requestActivation(admin, ADMIN, user).body().get("id").asLong();
		doThrow(new IllegalStateException("unexpected")).when(registry).activateWallet(anyString());

		clock.advance(AFTER_DELAY);
		actions.runDue();

		assertThat(status(id)).isEqualTo("PENDING");
		assertThat(jdbc.queryForObject("select failure_reason from admin_actions where id = ?", String.class, id))
			.isEqualTo("INTERNAL_ERROR");
		assertThat(admin.post("/api/admin/actions/" + id + "/cancel", null).body().get("status").asString())
			.isEqualTo("CANCELLED");
		stubChain();
		clock.advance(Duration.ofMinutes(2));
		actions.runDue();
		assertThat(chain.get(user.address()).active()).isFalse();
	}

	@RepeatedTest(5)
	void aCancelRacingTheSchedulerEitherCancelsOrLetsItRunNeverBoth() {
		TestWallet target = new TestWallet();
		register(browser(), target);
		revoke(target);
		long id = requestActivation(admin, ADMIN, target).body().get("id").asLong();
		clock.advance(AFTER_DELAY);

		List<Api.Response> cancel = concurrently(List.<Supplier<Api.Response>>of(
				() -> admin.post("/api/admin/actions/" + id + "/cancel", null), () -> {
					actions.runDue();
					return null;
				}));

		boolean active = chain.get(target.address()).active();
		if (cancel.get(0).status() == 200) {
			assertThat(status(id)).isEqualTo("CANCELLED");
			assertThat(active).isFalse();
		}
		else {
			assertThat(cancel.get(0).code()).isEqualTo("ADMIN_ACTION_NOT_PENDING");
			assertThat(status(id)).isEqualTo("EXECUTED");
			assertThat(active).isTrue();
		}
	}

	@Test
	void anActionInterruptedByARestartIsCarriedOutAgain() {
		register(browser(), user);
		revoke(user);
		long id = requestActivation(admin, ADMIN, user).body().get("id").asLong();
		clock.advance(AFTER_DELAY);
		// As if the process stopped after taking the action but before finishing it.
		jdbc.update("update admin_actions set status = 'EXECUTING' where id = ?", id);
		actions.runDue();
		assertThat(status(id)).isEqualTo("EXECUTING");

		actions.requeueInterrupted();
		actions.runDue();

		assertThat(status(id)).isEqualTo("EXECUTED");
		assertThat(chain.get(user.address()).active()).isTrue();
	}

	@Test
	void resettingAUsersSecondStepIsAlsoDelayed() {
		Api laptop = registeredAndLoggedIn(user);
		assertThat(admin.post("/api/admin/wallet/" + user.checksumAddress() + "/second-step/reset",
				proof(admin, ADMIN, "RESET_SECOND_STEP", user)).code()).isEqualTo("SECOND_STEP_NOT_ENABLED");
		SecondStepTestSupport.enable(laptop, clock.instant(), action -> proof(laptop, user, action, Map.of()));
		assertThat(admin.post("/api/admin/wallet/" + ADMIN.checksumAddress() + "/second-step/reset",
				proof(admin, ADMIN, "RESET_SECOND_STEP", ADMIN)).code()).isEqualTo("CANNOT_MODIFY_OWN_WALLET");

		Api.Response requested = admin.post("/api/admin/wallet/" + user.checksumAddress() + "/second-step/reset",
				proof(admin, ADMIN, "RESET_SECOND_STEP", user));

		assertThat(requested.status()).isEqualTo(202);
		assertThat(login(browser(), user).status()).isEqualTo(202);
		clock.advance(AFTER_DELAY);
		actions.runDue();
		assertThat(count("select count(*) from second_factors")).isZero();
		assertThat(count("select count(*) from authentication_events where event_type = 'SECOND_STEP_RESET'"))
			.isEqualTo(1);
		assertThat(login(browser(), user).status()).isEqualTo(200);
	}

	@Test
	void usersCannotSeeOrCancelActions() {
		Api signedIn = registeredAndLoggedIn(user);

		assertThat(signedIn.get("/api/admin/actions").status()).isEqualTo(403);
		assertThat(signedIn.post("/api/admin/actions/1/cancel", null).status()).isEqualTo(403);
	}

}
