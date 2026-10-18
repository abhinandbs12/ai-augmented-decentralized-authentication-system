package com.blockauth.risk;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface LoginAssessmentRepository
		extends JpaRepository<LoginAssessment, Long>, JpaSpecificationExecutor<LoginAssessment> {
}
