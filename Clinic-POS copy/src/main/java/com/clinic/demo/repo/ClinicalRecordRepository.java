package com.clinic.demo.repo;

import com.clinic.demo.entity.ClinicalRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ClinicalRecordRepository extends JpaRepository<ClinicalRecord, UUID> {
    List<ClinicalRecord> findAllByClinicIdAndPatientIdOrderByCreatedAtDesc(UUID clinicId, UUID patientId);
    Optional<ClinicalRecord> findByIdAndClinicId(UUID id, UUID clinicId);
}
