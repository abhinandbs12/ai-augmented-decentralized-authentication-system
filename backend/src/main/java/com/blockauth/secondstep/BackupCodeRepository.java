package com.blockauth.secondstep;

import java.time.Instant;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface BackupCodeRepository extends JpaRepository<BackupCode, Long> {

	long countByUserIdAndUsedAtIsNull(UUID userId);

	/** @return 1 if this call used the code; 0 if it does not exist or was already used */
	@Transactional
	@Modifying
	@Query("update BackupCode c set c.usedAt = :now where c.userId = :userId and c.codeHash = :hash and c.usedAt is null")
	int use(@Param("userId") UUID userId, @Param("hash") String hash, @Param("now") Instant now);

	@Transactional
	@Modifying
	@Query("delete from BackupCode c where c.userId = :userId")
	int deleteAllOf(@Param("userId") UUID userId);

}
