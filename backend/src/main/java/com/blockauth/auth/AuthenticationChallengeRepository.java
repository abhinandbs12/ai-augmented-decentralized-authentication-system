package com.blockauth.auth;

import java.time.Instant;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface AuthenticationChallengeRepository extends JpaRepository<AuthenticationChallenge, Long> {

	Optional<AuthenticationChallenge> findByChallengeAndPurpose(String challenge, ChallengePurpose purpose);

	/**
	 * Atomic single-use consumption: of any number of concurrent callers, exactly one can flip an
	 * unused, unexpired challenge. The persistence context is cleared afterwards because a bulk update
	 * bypasses it, and the caller re-reads the row to tell "already used" from "expired".
	 * @return 1 if this call consumed it, 0 if it was already used or has expired
	 */
	@Transactional
	@Modifying(clearAutomatically = true)
	@Query("update AuthenticationChallenge c set c.used = true, c.usedAt = :now "
			+ "where c.id = :id and c.used = false and c.expiresAt > :now")
	int consume(@Param("id") Long id, @Param("now") Instant now);

	@Transactional
	@Modifying
	@Query("delete from AuthenticationChallenge c where c.expiresAt < :cutoff")
	int deleteExpiredBefore(@Param("cutoff") Instant cutoff);

}
