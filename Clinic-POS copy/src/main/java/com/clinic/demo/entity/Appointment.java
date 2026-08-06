package com.clinic.demo.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

@Entity
@Table(name = "appointments", indexes = @Index(name = "idx_appointment_clinic_date", columnList = "clinic_id,date"))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Appointment {
    @Id private UUID id;
    @Version private Long version;
    @Column(nullable = false) private LocalDate date;
    @Column(nullable = false) private LocalTime time;
    @Column(nullable = false) @Builder.Default private String status = "booked";
    @Column(name = "has_conflict", nullable = false) @Builder.Default private Boolean conflict = false;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "staff_id") private Staff staff;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "patient_id") private Patient patient;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "service_id") private Service service;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "clinic_id") private Clinic clinic;
    @PrePersist void assignId() { if (id == null) id = UUID.randomUUID(); }
}
