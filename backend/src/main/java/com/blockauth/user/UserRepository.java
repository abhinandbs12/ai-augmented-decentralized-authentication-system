package com.blockauth.user;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

public interface UserRepository extends JpaRepository<User, UUID>, JpaSpecificationExecutor<User> {

	interface StatusCount {

		UserStatus getStatus();

		long getTotal();

	}

	// The two lookups below run on every login and every authenticated request. As single statements
	// they need no transaction of their own, which saves one database round trip (the commit) each.
	@Transactional(propagation = Propagation.SUPPORTS, readOnly = true)
	Optional<User> findByWalletAddress(String walletAddress);

	@Override
	@Transactional(propagation = Propagation.SUPPORTS, readOnly = true)
	Optional<User> findById(UUID id);

	@Query("select u.status as status, count(u) as total from User u group by u.status")
	List<StatusCount> countPerStatus();

}
