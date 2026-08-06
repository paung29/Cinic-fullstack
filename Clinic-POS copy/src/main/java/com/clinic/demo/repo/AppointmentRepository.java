package com.clinic.demo.repo;

import com.clinic.demo.entity.Appointment;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.*;

public interface AppointmentRepository extends JpaRepository<Appointment, UUID> {
    List<Appointment> findAllByClinicIdOrderByDateAscTimeAsc(UUID clinicId);
    Optional<Appointment> findByIdAndClinicId(UUID id, UUID clinicId);
    boolean existsByClinicIdAndStaffIdAndDateAndTimeAndStatusNot(UUID clinicId, UUID staffId, LocalDate date, LocalTime time, String status);
}
