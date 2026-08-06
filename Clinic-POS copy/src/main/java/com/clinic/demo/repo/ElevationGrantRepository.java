package com.clinic.demo.repo;

import com.clinic.demo.entity.ElevationGrant;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ElevationGrantRepository extends JpaRepository<ElevationGrant, UUID> {
    Optional<ElevationGrant> findByToken(UUID token);
}
