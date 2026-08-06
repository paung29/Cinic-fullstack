package com.clinic.demo.repo;

import com.clinic.demo.entity.StockMove;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;
import java.util.List;

public interface StockMoveRepository extends JpaRepository<StockMove, UUID> {
    List<StockMove> findAllByClinicIdAndProductIdOrderByCreatedAtDesc(UUID clinicId, UUID productId);
}
