package com.clinic.demo.repo;

import com.clinic.demo.entity.ClinicalAccessLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ClinicalAccessLogRepository extends JpaRepository<ClinicalAccessLog, UUID> {
    List<ClinicalAccessLog> findAllByClinicIdOrderByCreatedAtDesc(UUID clinicId);
}
