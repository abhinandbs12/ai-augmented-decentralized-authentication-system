package com.blockauth.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

import com.blockauth.IntegrationTest;

/**
 * IT-09: the context loads, which means Flyway applied the migrations and Hibernate validated every
 * entity against it. Beyond that, the constraints are exercised directly: they are the last line of
 * defense if application validation is ever bypassed.
 */
class SchemaIT extends IntegrationTest {

	private static final String WALLET = "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed";
	private static final String OTHER = "0x1234567890abcdef1234567890abcdef12345678";
	private static final String NONCE = "0123456789abcdef0123456789abcdef";

	@Test
	void flywayCreatedTheTablesWithTwoMigrations() {
		assertThat(jdbc.queryForList("select script from flyway_schema_history where success order by installed_rank",
				String.class)).containsExactly("V1__init_schema.sql", "V2__security_features.sql");
		assertThat(jdbc.queryForList("select table_name from information_schema.tables where table_schema = 'public' "
				+ "and table_name <> 'flyway_schema_history'", String.class)).containsExactlyInAnyOrder("users",
						"authentication_challenges", "authentication_events", "security_events", "devices",
						"user_devices", "user_sessions", "sign_in_alerts", "second_factors", "backup_codes",
						"wallet_flags", "login_assessments", "emergency_stop", "admin_actions", "api_keys");
	}

	@Test
	void everySpecifiedIndexExists() {
		assertThat(jdbc.queryForList("select indexname from pg_indexes where schemaname = 'public'", String.class))
				.contains("uq_users_wallet", "ix_users_status_role", "uq_challenges_nonce", "uq_challenges_challenge",
						"ix_challenges_wallet_created", "ix_challenges_expires", "ix_auth_events_user",
						"ix_auth_events_wallet", "ix_auth_events_type", "ix_sec_events_type", "ix_sec_events_wallet",
						"ix_sec_events_time", "ix_user_devices_device", "ix_sessions_user", "ix_alerts_user",
						"ix_assess_time", "ix_assess_wallet", "ix_auth_events_ip", "uq_actions_open", "ix_actions_due");
	}

	@Test
	void timestampsAreStoredWithTimeZone() {
		assertThat(jdbc.queryForList("select data_type from information_schema.columns where table_schema = 'public' "
				+ "and table_name <> 'flyway_schema_history' and column_name like '%\\_at'", String.class))
				.hasSize(28).containsOnly("timestamp with time zone");
		assertThat(count("select count(*) from information_schema.columns where table_schema = 'public' "
				+ "and table_name <> 'flyway_schema_history' and data_type = 'timestamp without time zone'")).isZero();
	}

	@Test
	void userDefaultsAndConstraints() {
		jdbc.update("insert into users (wallet_address) values (?)", WALLET);
		Map<String, Object> row = jdbc.queryForMap("select * from users where wallet_address = ?", WALLET);
		assertThat(row.get("id")).isNotNull();
		assertThat(row.get("role")).isEqualTo("USER");
		assertThat(row.get("status")).isEqualTo("ACTIVE");
		assertThat(row.get("created_at")).isNotNull();

		assertRejected("insert into users (wallet_address) values (?)", WALLET);
		assertRejected("insert into users (wallet_address) values (?)", WALLET.toUpperCase().replace("0X", "0x"));
		assertRejected("insert into users (wallet_address) values (?)", "0x123");
		assertRejected("insert into users (wallet_address) values (null)");
		assertRejected("insert into users (wallet_address, role) values (?, 'ROOT')", OTHER);
		assertRejected("insert into users (wallet_address, status) values (?, 'DELETED')", OTHER);
		assertThat(count("select count(*) from users")).isEqualTo(1);
	}

	@Test
	void challengeConstraints() {
		String insert = "insert into authentication_challenges (wallet_address, purpose, nonce, challenge, "
				+ "created_at, expires_at) values (?, ?, ?, ?, now(), now() + ?::interval)";
		jdbc.update(insert, WALLET, "LOGIN", NONCE, "text", "120 seconds");

		assertRejected(insert, WALLET, "LOGIN", NONCE, "other text", "120 seconds");
		assertRejected(insert, WALLET, "LOGIN", NONCE.replace('0', 'f'), "text", "120 seconds");
		assertRejected(insert, WALLET, "RESET", NONCE.replace('0', '1'), "a", "120 seconds");
		assertRejected(insert, WALLET, "LOGIN", "829174", "b", "120 seconds");
		assertRejected(insert, WALLET, "LOGIN", NONCE.toUpperCase(), "c", "120 seconds");
		assertRejected(insert, "0x123", "LOGIN", NONCE.replace('0', '2'), "d", "120 seconds");
		assertRejected(insert, WALLET, "LOGIN", NONCE.replace('0', '3'), "e", "0 seconds");
		assertRejected(insert, WALLET, "LOGIN", NONCE.replace('0', '4'), "x".repeat(1001), "120 seconds");
		assertThat(count("select count(*) from authentication_challenges")).isEqualTo(1);
		assertThat(jdbc.queryForObject("select used from authentication_challenges", Boolean.class)).isFalse();
	}

	@Test
	void eventConstraints() {
		String authEvent = "insert into authentication_events (wallet_address, event_type, event_status, user_id) "
				+ "values (?, ?, ?, ?::uuid)";
		jdbc.update(authEvent, null, "LOGIN", "FAILURE", null);
		assertRejected(authEvent, null, "PASSWORD_RESET", "FAILURE", null);
		assertRejected(authEvent, null, "LOGIN", "MAYBE", null);
		assertRejected(authEvent, "not-a-wallet", "LOGIN", "FAILURE", null);
		assertRejected(authEvent, null, "LOGIN", "FAILURE", "00000000-0000-0000-0000-000000000000");

		String securityEvent = "insert into security_events (wallet_address, attack_type, description, result) "
				+ "values (?, ?, ?, ?)";
		jdbc.update(securityEvent, WALLET, "REPLAY_ATTEMPT", "text", "BLOCKED");
		assertRejected(securityEvent, WALLET, "MADE_UP_ATTACK", "text", "BLOCKED");
		assertRejected(securityEvent, WALLET, "REPLAY_ATTEMPT", "text", "IGNORED");
		assertRejected(securityEvent, WALLET, "REPLAY_ATTEMPT", null, "BLOCKED");
		assertRejected(securityEvent, WALLET.toUpperCase(), "REPLAY_ATTEMPT", "text", "BLOCKED");
		assertThat(count("select count(*) from authentication_events")).isEqualTo(1);
		assertThat(count("select count(*) from security_events")).isEqualTo(1);
	}

	@Test
	void aUserWithEventsCannotBeDeletedSilently() {
		jdbc.update("insert into users (wallet_address) values (?)", WALLET);
		jdbc.update("insert into authentication_events (user_id, event_type, event_status) "
				+ "select id, 'LOGIN', 'SUCCESS' from users");

		assertRejected("delete from users");
	}

	private void assertRejected(String sql, Object... args) {
		assertThatThrownBy(() -> jdbc.update(sql, args)).isInstanceOf(DataIntegrityViolationException.class);
	}

}
