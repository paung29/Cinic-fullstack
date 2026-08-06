package com.clinic.demo.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import java.util.UUID;
import java.time.LocalDate;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(
        name = "patients",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_patient_clinic_phone",
                        columnNames = {"clinic_id", "phone"}
                )
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Patient {

    @Id
    private UUID id;

    @Version
    private Long version;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String phone;

    private String code;
    private String sex;
    @Column(name = "telegram_linked", nullable = false) @Builder.Default private Boolean telegramLinked = false;
    @Column(name = "followup_date") private LocalDate followupDate;

    @Column(columnDefinition = "TEXT")
    private String allergies;

    @Column(name = "alert_note", columnDefinition = "TEXT")
    private String alertNote;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "clinic_id", nullable = false)
    private Clinic clinic;

    @PrePersist
    void assignId() {
        if (id == null) id = UUID.randomUUID();
    }

}
