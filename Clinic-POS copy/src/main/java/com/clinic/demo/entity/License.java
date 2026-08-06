package com.clinic.demo.entity;

import com.clinic.demo.entity.enums.LicenseStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "licenses")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class License {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "clinic_id", nullable = false, unique = true)
    private Clinic clinic;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private LicenseStatus status = LicenseStatus.ACTIVE;

    @Column(name = "term_ends_on", nullable = false)
    private LocalDate termEndsOn;

    @Column(name = "grace_ends_on", nullable = false)
    private LocalDate graceEndsOn;

    @Column(name = "changed_at", nullable = false)
    private LocalDateTime changedAt;

    @Column(name = "changed_by")
    private String changedBy;

    @Column(columnDefinition = "TEXT")
    private String note;

    @PrePersist
    @PreUpdate
    void touch() {
        changedAt = LocalDateTime.now();
    }
}
