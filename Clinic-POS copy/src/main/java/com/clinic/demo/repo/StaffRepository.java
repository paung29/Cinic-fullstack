package com.clinic.demo.repo;

import com.clinic.demo.entity.Staff;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;
import java.util.List;
import java.util.Optional;

public interface StaffRepository extends JpaRepository<Staff, UUID> {
    List<Staff> findAllByClinicIdOrderByName(UUID clinicId);
    Optional<Staff> findByIdAndClinicId(UUID id, UUID clinicId);
}
