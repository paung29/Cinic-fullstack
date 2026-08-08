package com.clinic.demo.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import com.clinic.demo.entity.enums.SaleStatus;

@Entity
@Table(
        name = "sales",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_sale_clinic_number", columnNames = {"clinic_id", "sale_number"}),
                @UniqueConstraint(name = "uk_sale_clinic_idempotency", columnNames = {"clinic_id", "idempotency_key"})
        },
        indexes = {
                @Index(name = "idx_sale_clinic_created_at", columnList = "clinic_id, created_at"),
                @Index(name = "idx_sale_patient", columnList = "patient_id")
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Sale {

    @Id
    private UUID id;

    @Version
    private Long version;

    @Column(name = "sale_number", nullable = false)
    private String saleNumber;

    @Column(name = "idempotency_key", nullable = false)
    private String idempotencyKey;

    @Column(name = "follow_up_date")
    private LocalDate followUpDate;

    @Column(nullable = false, precision = 12, scale = 2)
    @Builder.Default
    private BigDecimal total = BigDecimal.ZERO;

    @Column(precision = 12, scale = 2) private BigDecimal subtotal;
    @Column(name = "discount_pct") private BigDecimal discountPct;
    @Column(name = "discount_approved_by") private String discountApprovedBy;
    @Column(precision = 12, scale = 2) private BigDecimal credit;
    @Column(name = "credit_approved_by") private String creditApprovedBy;
    @Column(name = "practitioner_id") private UUID practitionerId;
    @Column(name = "staff_id_snapshot") private UUID staffIdSnapshot;
    @Column(name = "appointment_id") private UUID appointmentId;
    @Column(name = "device_id") private String deviceId;
    @Column(name = "received_at") private OffsetDateTime receivedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private SaleStatus status = SaleStatus.COMPLETED;

    @Column(name = "validation_message", columnDefinition = "TEXT")
    private String validationMessage;

    @Column(name = "void_reason", columnDefinition = "TEXT")
    private String voidReason;

    @Column(name = "created_offline", nullable = false)
    @Builder.Default
    private Boolean createdOffline = false;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "patient_id")
    private Patient patient;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "staff_id")
    private Staff staff;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "clinic_id", nullable = false)
    private Clinic clinic;

    @OneToMany(
            mappedBy = "sale",
            cascade = CascadeType.ALL,
            orphanRemoval = true
    )
    @Builder.Default
    private List<SaleLine> saleLines = new ArrayList<>();

    @OneToMany(
            mappedBy = "sale",
            cascade = CascadeType.ALL,
            orphanRemoval = true
    )
    @Builder.Default
    private List<Payment> payments = new ArrayList<>();

    @PrePersist
    public void prePersist() {
        if (id == null) {
            id = UUID.randomUUID();
        }

        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    public void addSaleLine(SaleLine line) {
        saleLines.add(line);
        line.setSale(this);
    }

    public void addPayment(Payment payment) {
        payments.add(payment);
        payment.setSale(this);
    }
}
