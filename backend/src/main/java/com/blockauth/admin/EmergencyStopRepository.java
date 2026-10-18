package com.blockauth.admin;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import jakarta.persistence.LockModeType;

public interface EmergencyStopRepository extends JpaRepository<EmergencyStop, Integer> {

	/** The single row, locked until the surrounding transaction ends, so changes to it never interleave. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select s from EmergencyStop s where s.id = " + EmergencyStop.ID)
	Optional<EmergencyStop> lockCurrent();

}
