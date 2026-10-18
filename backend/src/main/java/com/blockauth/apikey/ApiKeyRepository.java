package com.blockauth.apikey;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

public interface ApiKeyRepository extends JpaRepository<ApiKey, UUID> {

	/** The key with its owner, in one query, for every request that carries a key. */
	@Transactional(propagation = Propagation.SUPPORTS, readOnly = true)
	@Query("select new com.blockauth.apikey.KeyAndOwner(k, u) from ApiKey k join User u on u.id = k.ownerId "
			+ "where k.id = :id")
	Optional<KeyAndOwner> findWithOwner(@Param("id") UUID id);

	/** @return 1 if this call revoked the key, 0 if it was already revoked */
	@Transactional
	@Modifying(clearAutomatically = true)
	@Query("update ApiKey k set k.revokedAt = :now, k.revokedBy = :by where k.id = :id and k.revokedAt is null")
	int revoke(@Param("id") UUID id, @Param("by") UUID by, @Param("now") Instant now);

	/** Records use at most once per period. */
	@Transactional
	@Modifying
	@Query("update ApiKey k set k.lastUsedAt = :now where k.id = :id "
			+ "and (k.lastUsedAt is null or k.lastUsedAt < :olderThan)")
	int touch(@Param("id") UUID id, @Param("now") Instant now, @Param("olderThan") Instant olderThan);

}
