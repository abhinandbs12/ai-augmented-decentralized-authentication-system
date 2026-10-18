package com.blockauth.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;

/**
 * How BLOCKAUTH_ADMIN_WALLETS reaches the application: bound through the same expression application.yml
 * uses, from a plain string exactly as it would stand in the environment.
 */
class AdminWalletsBindingTest {

	private static final String CHECKSUMMED = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
	private static final String OTHER = "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359";

	@EnableConfigurationProperties(BlockAuthProperties.class)
	static class Config {
	}

	@Test
	void applicationYmlFeedsThePropertyFromTheDocumentedVariable() throws IOException {
		assertThat(adminWalletsExpression()).isEqualTo("${BLOCKAUTH_ADMIN_WALLETS:}");
	}

	@Test
	void missingOrEmptyVariableMeansNoAdministrators() {
		runner(null).run(context -> assertThat(wallets(context)).isEmpty());
		runner("").run(context -> assertThat(wallets(context)).isEmpty());
		runner("   ").run(context -> assertThat(wallets(context)).isEmpty());
	}

	@Test
	void aSingleAddressIsStoredInLowercase() {
		runner(CHECKSUMMED).run(context -> assertThat(wallets(context)).containsExactly(CHECKSUMMED.toLowerCase()));
	}

	@Test
	void aCommaSeparatedListToleratesSpacesAndEmptyEntries() {
		runner("  " + CHECKSUMMED + " ,\t" + OTHER + " , ").run(context -> assertThat(wallets(context))
				.containsExactlyInAnyOrder(CHECKSUMMED.toLowerCase(), OTHER.toLowerCase()));
	}

	@Test
	void theSameWalletListedTwiceCountsOnce() {
		runner(CHECKSUMMED + "," + CHECKSUMMED.toLowerCase() + ",0x" + CHECKSUMMED.substring(2).toUpperCase())
				.run(context -> assertThat(wallets(context)).containsExactly(CHECKSUMMED.toLowerCase()));
	}

	@ParameterizedTest
	@ValueSource(strings = { "0x123", "not-an-address", "5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
			// one character of the checksummed form changed in case: a typo the checksum exists to catch
			"0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
			"0x0000000000000000000000000000000000000000",
			// a valid entry does not excuse an invalid one
			"0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed,0xabc" })
	void anInvalidEntryStopsTheApplicationFromStarting(String value) {
		runner(value).run(context -> {
			assertThat(context).hasFailed();
			assertThat(context.getStartupFailure()).rootCause().hasMessageContaining("BLOCKAUTH_ADMIN_WALLETS");
		});
	}

	@Test
	void aPrivateKeyPastedByMistakeIsRejectedWithoutBeingEchoed() {
		String key = "0x" + "3c".repeat(32);

		runner(key).run(context -> {
			assertThat(context).hasFailed();
			assertThat(context.getStartupFailure()).rootCause().hasMessageContaining("BLOCKAUTH_ADMIN_WALLETS")
					.hasMessageContaining("private key");
			for (Throwable t = context.getStartupFailure(); t != null; t = t.getCause()) {
				assertThat(String.valueOf(t.getMessage())).doesNotContain(key).doesNotContain(key.substring(2));
			}
		});
	}

	/** A context whose only environment is the given variable: the developer's real one is left out. */
	private static ApplicationContextRunner runner(String adminWallets) {
		return new ApplicationContextRunner().withUserConfiguration(Config.class).withInitializer(context -> {
			context.getEnvironment().getPropertySources()
					.remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
			if (adminWallets != null) {
				context.getEnvironment().getPropertySources().addFirst(
						new MapPropertySource("environment", Map.of("BLOCKAUTH_ADMIN_WALLETS", adminWallets)));
			}
		}).withPropertyValues("blockauth.admin-wallets=" + adminWalletsExpression(),
				"blockauth.app-origin=http://localhost:5173", "blockauth.blockchain.rpc-url=http://127.0.0.1:8545",
				"blockauth.blockchain.chain-id=31337",
				"blockauth.blockchain.contract-address=0x0000000000000000000000000000000000000001",
				"blockauth.blockchain.operator-private-key=" + "ab".repeat(32));
	}

	/** The raw, unresolved value of blockauth.admin-wallets in application.yml. */
	private static String adminWalletsExpression() {
		try {
			return String.valueOf(new YamlPropertySourceLoader()
					.load("application", new ClassPathResource("application.yml")).get(0)
					.getProperty("blockauth.admin-wallets"));
		}
		catch (IOException e) {
			throw new IllegalStateException(e);
		}
	}

	private static java.util.Set<String> wallets(org.springframework.context.ApplicationContext context) {
		return context.getBean(BlockAuthProperties.class).adminWalletSet();
	}

}
