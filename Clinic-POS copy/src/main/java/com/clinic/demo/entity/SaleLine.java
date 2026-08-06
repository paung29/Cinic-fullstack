package com.clinic.demo.entity;

import com.clinic.demo.entity.enums.SaleLineKind;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "sale_lines")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SaleLine {

    @Id
    private UUID id;

    @Version private Long version;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SaleLineKind kind;

    @Column(name = "name_snapshot", nullable = false)
    private String nameSnapshot;

    @Column(name = "unit_price", nullable = false, precision = 12, scale = 2)
    private BigDecimal unitPrice;

    @Column(nullable = false)
    @Builder.Default
    private BigDecimal quantity = BigDecimal.ONE;

    @Column(name = "line_total", nullable = false, precision = 12, scale = 2)
    private BigDecimal lineTotal;

    @Column(name = "discount_pct") private BigDecimal discountPct;
    @Column(columnDefinition = "TEXT") private String note;
    @Column(name = "lot_no") private String lotNo;
    @Column(name = "lot_expiry") private String lotExpiry;
    @Column(name = "item_id_snapshot") private UUID itemIdSnapshot;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sale_id", nullable = false)
    private Sale sale;

    /*
     * Filled only when kind = SERVICE.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "service_id")
    private Service service;

    /*
     * Filled only when kind = PRODUCT.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id")
    private Product product;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "clinic_id", nullable = false)
    private Clinic clinic;

    @PrePersist
    @PreUpdate
    public void calculateLineTotal() {
        if (id == null) id = UUID.randomUUID();
        if (unitPrice != null && quantity != null) {
            if (lineTotal == null) lineTotal = unitPrice.multiply(quantity);
        }
    }
}
