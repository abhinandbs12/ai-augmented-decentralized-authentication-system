package com.blockauth.session;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SignInAlertRepository extends JpaRepository<SignInAlert, Long> {

	Optional<SignInAlert> findByIdAndUserId(Long id, UUID userId);

	/** Unanswered alerts about sessions other than the one asking. */
	@Query("select a from SignInAlert a where a.userId = :userId and a.resolvedAt is null and a.sessionId <> :current "
			+ "order by a.createdAt desc")
	List<SignInAlert> findOpen(@Param("userId") UUID userId, @Param("current") UUID current);

}
