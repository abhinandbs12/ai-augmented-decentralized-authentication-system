package com.blockauth.session;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.blockauth.user.UserRole;

/** Every "end" update applies only to open records, so the first reason recorded is the one that stays. */
public interface UserSessionRepository extends JpaRepository<UserSession, UUID> {

	@Transactional(propagation = Propagation.SUPPORTS, readOnly = true)
	@Query("select new com.blockauth.session.SessionAndUser(s, u) from UserSession s join User u on u.id = s.userId "
			+ "where s.id = :id")
	Optional<SessionAndUser> findWithUser(@Param("id") UUID id);

	@Query("select s from UserSession s where s.userId = :userId and s.endedAt is null and s.lastSeenAt > :since "
			+ "order by s.lastSeenAt desc")
	List<UserSession> findOpen(@Param("userId") UUID userId, @Param("since") Instant since);

	@Transactional
	@Modifying
	@Query("update UserSession s set s.endedAt = :now, s.endReason = :reason where s.id = :id and s.endedAt is null")
	int end(@Param("id") UUID id, @Param("reason") SessionEndReason reason, @Param("now") Instant now);

	@Transactional
	@Modifying
	@Query("update UserSession s set s.endedAt = :now, s.endReason = :reason "
			+ "where s.userId = :userId and s.endedAt is null and s.id <> :keep")
	int endAllForUserExcept(@Param("userId") UUID userId, @Param("keep") UUID keep,
			@Param("reason") SessionEndReason reason, @Param("now") Instant now);

	@Transactional
	@Modifying
	@Query("update UserSession s set s.endedAt = :now, s.endReason = :reason where s.userId = :userId and s.endedAt is null")
	int endAllForUser(@Param("userId") UUID userId, @Param("reason") SessionEndReason reason, @Param("now") Instant now);

	@Transactional
	@Modifying
	@Query("update UserSession s set s.endedAt = :now, s.endReason = :reason "
			+ "where s.userId = :userId and s.deviceId = :deviceId and s.endedAt is null")
	int endAllForUserDevice(@Param("userId") UUID userId, @Param("deviceId") UUID deviceId,
			@Param("reason") SessionEndReason reason, @Param("now") Instant now);

	@Transactional
	@Modifying
	@Query("update UserSession s set s.endedAt = :now, s.endReason = :reason where s.endedAt is null "
			+ "and s.userId in (select u.id from User u where u.role = :role)")
	int endAllForRole(@Param("role") UserRole role, @Param("reason") SessionEndReason reason,
			@Param("now") Instant now);

	@Transactional
	@Modifying
	@Query("update UserSession s set s.endedAt = :now, s.endReason = :reason where s.endedAt is null")
	int endAllOpen(@Param("reason") SessionEndReason reason, @Param("now") Instant now);

	/** Records activity at most once per period, not on every request. */
	@Transactional
	@Modifying
	@Query("update UserSession s set s.lastSeenAt = :now where s.id = :id and s.lastSeenAt < :olderThan")
	int touch(@Param("id") UUID id, @Param("now") Instant now, @Param("olderThan") Instant olderThan);

}
