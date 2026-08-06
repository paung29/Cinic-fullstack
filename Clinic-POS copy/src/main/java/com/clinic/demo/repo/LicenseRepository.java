package com.clinic.demo.repo;

import com.clinic.demo.entity.License;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface LicenseRepository extends JpaRepository<License, UUID> {
    Optional<License> findByClinicId(UUID clinicId);
}
