package com.blockauth.audit;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

public interface SecurityEventRepository
		extends JpaRepository<SecurityEvent, Long>, JpaSpecificationExecutor<SecurityEvent> {

	interface TypeCount {

		AttackType getAttackType();

		long getTotal();

	}

	@Query("select s.attackType as attackType, count(s) as total from SecurityEvent s group by s.attackType")
	List<TypeCount> countByType();

}
