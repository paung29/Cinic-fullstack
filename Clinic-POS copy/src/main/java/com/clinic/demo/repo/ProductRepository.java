package com.clinic.demo.repo;

import com.clinic.demo.entity.Product;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProductRepository extends JpaRepository<Product, UUID> {
    List<Product> findAllByClinicIdOrderByName(UUID clinicId);
    Optional<Product> findByIdAndClinicId(UUID id, UUID clinicId);
    boolean existsByClinicIdAndSku(UUID clinicId, String sku);
    Optional<Product> findByClinicIdAndBarcode(UUID clinicId, String barcode);
}
