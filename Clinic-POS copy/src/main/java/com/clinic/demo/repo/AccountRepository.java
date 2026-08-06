package com.clinic.demo.repo;

import com.clinic.demo.entity.Account;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;
import java.util.List;
import com.clinic.demo.entity.enums.Role;


public interface AccountRepository extends JpaRepository<Account, UUID> {

    Optional<Account> findByEmail(String email);

    boolean existsByEmail(String email);

    Optional<Account> findByIdAndClinicId(UUID id, UUID clinicId);

    long countByClinicId(UUID clinicId);

    List<Account> findAllByClinicIdAndRoleAndActiveTrue(UUID clinicId, Role role);

    List<Account> findAllByClinicIdOrderByEmail(UUID clinicId);
    Optional<Account> findByStaffId(UUID staffId);
}
