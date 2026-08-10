package com.clinic.demo.repo;

import com.clinic.demo.entity.ProductPhoto;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ProductPhotoRepository extends JpaRepository<ProductPhoto, UUID> {
}
