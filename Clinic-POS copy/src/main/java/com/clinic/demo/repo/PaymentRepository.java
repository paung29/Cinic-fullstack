package com.clinic.demo.repo;

import com.clinic.demo.entity.Payment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;
import java.util.List;
import java.util.Optional;

public interface PaymentRepository extends JpaRepository<Payment, UUID> {
    List<Payment> findAllByClinicIdAndSaleId(UUID clinicId, UUID saleId);
    Optional<Payment> findByIdAndClinicId(UUID id, UUID clinicId);
}
