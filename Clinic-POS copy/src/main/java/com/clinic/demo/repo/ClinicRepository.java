package com.clinic.demo.repo;

import com.clinic.demo.entity.Clinic;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ClinicRepository extends JpaRepository<Clinic, UUID> {
    boolean existsByNameIgnoreCase(String name);
}
