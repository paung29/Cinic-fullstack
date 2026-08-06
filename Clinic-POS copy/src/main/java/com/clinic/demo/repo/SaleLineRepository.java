package com.clinic.demo.repo;

import com.clinic.demo.entity.SaleLine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface SaleLineRepository extends JpaRepository<SaleLine, UUID> {
}
