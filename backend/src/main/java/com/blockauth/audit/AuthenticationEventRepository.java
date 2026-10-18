package com.blockauth.audit;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AuthenticationEventRepository
		extends JpaRepository<AuthenticationEvent, Long>, JpaSpecificationExecutor<AuthenticationEvent> {

	interface OutcomeCount {

		AuthEventStatus getStatus();

		String getReason();

		long getTotal();

	}

	/** Events of one type, counted per (status, failure reason): the raw material of the statistics. */
	@Query("select e.eventStatus as status, e.failureReason as reason, count(e) as total "
			+ "from AuthenticationEvent e where e.eventType = :type group by e.eventStatus, e.failureReason")
	List<OutcomeCount> countOutcomes(@Param("type") AuthEventType type);

}
