package com.blockauth.secondstep;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

public interface SecondFactorRepository extends JpaRepository<SecondFactor, UUID> {

	@Transactional(propagation = Propagation.SUPPORTS, readOnly = true)
	boolean existsByUserIdAndEnabledAtIsNotNull(UUID userId);

	/**
	 * Records that the code of {@code step} was used. Of two concurrent uses of one code exactly one
	 * succeeds: the update applies only while the stored step is older.
	 * @return 1 if this call recorded it
	 */
	@Transactional
	@Modifying
	@Query("update SecondFactor f set f.lastUsedStep = :step where f.userId = :userId and f.enabledAt is not null "
			+ "and (f.lastUsedStep is null or f.lastUsedStep < :step)")
	int useStep(@Param("userId") UUID userId, @Param("step") long step);

}
