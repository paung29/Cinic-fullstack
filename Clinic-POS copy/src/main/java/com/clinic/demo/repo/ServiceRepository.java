package com.clinic.demo.repo;

import com.clinic.demo.entity.Service;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;
import java.util.List;
import java.util.Optional;

public interface ServiceRepository extends JpaRepository<Service, UUID> {
    List<Service> findAllByClinicIdOrderByName(UUID clinicId);
    Optional<Service> findByIdAndClinicId(UUID id, UUID clinicId);
}
