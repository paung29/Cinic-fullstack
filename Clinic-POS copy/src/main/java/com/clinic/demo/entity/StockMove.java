package com.clinic.demo.entity;

import com.clinic.demo.entity.enums.StockMoveReason;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import java.util.UUID;
import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.math.BigDecimal;

@Entity
@Table(
        name = "stock_moves",
        indexes = {
                @Index(
                        name = "idx_stock_move_product_created",
                        columnList = "product_id, created_at"
                )
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StockMove {

    @Id
    private UUID id;

    @Version private Long version;

    @Column(nullable = false)
    private BigDecimal delta;

    @Column(name = "lot_no") private String lotNo;
    @Column(name = "lot_expiry") private String lotExpiry;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private StockMoveReason reason;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(columnDefinition = "TEXT")
    private String note;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;


    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sale_id")
    private Sale sale;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "clinic_id", nullable = false)
    private Clinic clinic;

    @PrePersist
    public void prePersist() {
        if (id == null) id = UUID.randomUUID();
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
