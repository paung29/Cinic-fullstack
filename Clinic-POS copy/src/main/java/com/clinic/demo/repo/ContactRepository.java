package com.clinic.demo.repo;

import com.clinic.demo.entity.Contact;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;

public interface ContactRepository extends JpaRepository<Contact, UUID> {
    List<Contact> findAllByClinicId(UUID clinicId);
    Optional<Contact> findByIdAndClinicId(UUID id, UUID clinicId);
}
