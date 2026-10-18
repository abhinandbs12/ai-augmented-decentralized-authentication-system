package com.blockauth.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import com.blockauth.TestWallet;
import com.blockauth.blockchain.WalletRegistryClient;
import com.blockauth.common.WalletAddresses;
import com.blockauth.user.UserRepository;
import com.blockauth.user.UserRole;
import com.blockauth.user.UserService;

/**
 * The developer's real configuration, loaded the way the application loads it (application.yml, the
 * imported environment file, real environment variables): whatever BLOCKAUTH_ADMIN_WALLETS says there
 * must reach the role decision. Nothing is written to the database or the chain.
 */
class ConfiguredAdminWalletsIT {

	@EnableConfigurationProperties(BlockAuthProperties.class)
	static class Config {
	}

	@Test
	void everyConfiguredAdministratorWalletIsCreatedAsAdminAndNobodyElseIs() {
		new ApplicationContextRunner().withInitializer(new ConfigDataApplicationContextInitializer())
				.withUserConfiguration(Config.class).run(context -> {
					assertThat(context).hasNotFailed();
					BlockAuthProperties properties = context.getBean(BlockAuthProperties.class);
					UserRepository repository = mock(UserRepository.class);
					when(repository.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
					UserService users = new UserService(repository, mock(WalletRegistryClient.class), properties);

					for (String wallet : properties.adminWalletSet()) {
						// Stored the way registration will look it up: lowercase and well-formed.
						assertThat(WalletAddresses.normalize(wallet, "adminWallets")).isEqualTo(wallet);
						assertThat(users.create(wallet).getRole()).isEqualTo(UserRole.ADMIN);
					}
					assertThat(users.create(new TestWallet().address()).getRole()).isEqualTo(UserRole.USER);
					// The application administrators and the contract administrator are different accounts.
					String operator = new WalletRegistryClient(mock(org.web3j.protocol.Web3j.class), properties)
							.operatorAddress();
					assertThat(properties.adminWalletSet()).doesNotContain(operator);
				});
	}

}
