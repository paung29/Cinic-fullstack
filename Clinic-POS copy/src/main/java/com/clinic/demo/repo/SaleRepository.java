package com.clinic.demo.repo;

import com.clinic.demo.entity.Sale;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;
import java.util.List;
import java.util.Optional;

public interface SaleRepository extends JpaRepository<Sale, UUID> {
    Optional<Sale> findByIdAndClinicId(UUID id, UUID clinicId);
    Optional<Sale> findByClinicIdAndIdempotencyKey(UUID clinicId, String idempotencyKey);
    List<Sale> findAllByClinicIdOrderByCreatedAtDesc(UUID clinicId);
}
