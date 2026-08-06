package com.clinic.demo.repo;

import com.clinic.demo.entity.SyncEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.*;

public interface SyncEventRepository extends JpaRepository<SyncEvent, Long> {
    List<SyncEvent> findAllByClinicIdAndIdGreaterThanOrderByIdAsc(UUID clinicId, long id);
    @Query("select coalesce(max(e.id), 0) from SyncEvent e where e.clinic.id = :clinicId")
    long cursor(UUID clinicId);
}
