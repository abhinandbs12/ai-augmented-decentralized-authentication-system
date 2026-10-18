package com.blockauth.admin;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

/** Status changes are conditional updates, so two schedulers or two administrators can never both act on one action. */
public interface AdminActionRepository extends JpaRepository<AdminAction, Long>, JpaSpecificationExecutor<AdminAction> {

	@Query("select a from AdminAction a where a.status = com.blockauth.admin.AdminAction.Status.PENDING "
			+ "and a.executeAfter <= :now order by a.executeAfter, a.id")
	List<AdminAction> findDue(@Param("now") Instant now);

	/** @return 1 if this call took the action for execution */
	@Transactional
	@Modifying
	@Query("update AdminAction a set a.status = com.blockauth.admin.AdminAction.Status.EXECUTING "
			+ "where a.id = :id and a.status = com.blockauth.admin.AdminAction.Status.PENDING")
	int claim(@Param("id") Long id);

	@Transactional
	@Modifying
	@Query("update AdminAction a set a.status = :status, a.failureReason = :reason, a.decidedAt = :now "
			+ "where a.id = :id and a.status = com.blockauth.admin.AdminAction.Status.EXECUTING")
	int finish(@Param("id") Long id, @Param("status") AdminAction.Status status, @Param("reason") String reason,
			@Param("now") Instant now);

	/** Back to the queue after a temporary failure, to be tried again at {@code at}. */
	@Transactional
	@Modifying
	@Query("update AdminAction a set a.status = com.blockauth.admin.AdminAction.Status.PENDING, a.executeAfter = :at, "
			+ "a.failureReason = :reason where a.id = :id and a.status = com.blockauth.admin.AdminAction.Status.EXECUTING")
	int retryAt(@Param("id") Long id, @Param("at") Instant at, @Param("reason") String reason);

	@Transactional
	@Modifying
	@Query("update AdminAction a set a.status = com.blockauth.admin.AdminAction.Status.CANCELLED, a.decidedBy = :by, "
			+ "a.decidedAt = :now where a.id = :id and a.status = com.blockauth.admin.AdminAction.Status.PENDING")
	int cancel(@Param("id") Long id, @Param("by") UUID by, @Param("now") Instant now);

	/** Actions a crash left half-done go back to the queue; every action is safe to carry out again. */
	@Transactional
	@Modifying
	@Query("update AdminAction a set a.status = com.blockauth.admin.AdminAction.Status.PENDING "
			+ "where a.status = com.blockauth.admin.AdminAction.Status.EXECUTING")
	int requeueInterrupted();

}
