package com.blockauth;

import java.time.Clock;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;

// BlockAuth has no passwords: without this exclusion Spring Boot would create a default user with a
// generated password and print it at startup.
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
@ConfigurationPropertiesScan
@EnableScheduling
public class BlockAuthApplication {

	public static void main(String[] args) {
		SpringApplication.run(BlockAuthApplication.class, args);
	}

	@Bean
	Clock clock() {
		return Clock.systemUTC();
	}

}
