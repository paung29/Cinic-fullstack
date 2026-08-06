package com.clinic.demo.repo;

import com.clinic.demo.entity.Patient;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;
import java.util.List;
import java.util.Optional;

public interface PatientRepository extends JpaRepository<Patient, UUID> {
    List<Patient> findAllByClinicIdOrderByName(UUID clinicId);
    Optional<Patient> findByIdAndClinicId(UUID id, UUID clinicId);
    Optional<Patient> findByClinicIdAndPhone(UUID clinicId, String phone);
}
