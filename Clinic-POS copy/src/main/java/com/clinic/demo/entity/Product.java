package com.clinic.demo.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "products")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Product {

    @Id
    private UUID id;

    @Version private Long version;

    @Column(nullable = false)
    private String name;

    private String sku;

    private String category;
    private String subcategory;
    @Column(name = "sort_order") @Builder.Default private Integer sortOrder = 0;
    private String barcode;
    @Column(precision = 12, scale = 2) @Builder.Default private BigDecimal cost = BigDecimal.ZERO;
    @Column(name = "low_stock_at", precision = 12, scale = 3) @Builder.Default private BigDecimal lowStockAt = BigDecimal.ZERO;
    @Column(name = "reorder_at", precision = 12, scale = 3) @Builder.Default private BigDecimal reorderAt = BigDecimal.ZERO;
    @Column(name = "stock_type") @Builder.Default private String stockType = "retail";
    @Column(name = "sold_by") @Builder.Default private String soldBy = "each";
    @Column(name = "requires_lot", nullable = false) @Builder.Default private Boolean requiresLot = false;
    @Column(name = "requires_consent", nullable = false) @Builder.Default private Boolean requiresConsent = false;
    @Column(name = "unit_label") private String unitLabel;
    @Column(name = "photo_key") private String photoKey;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal price;

    @Column(name = "current_stock", nullable = false)
    @Builder.Default
    private Integer currentStock = 0;

    /** Exact frontend stock quantity; nullable for legacy catalogue rows. */
    @Column(name = "stock_qty", precision = 14, scale = 3)
    private BigDecimal stockQty;

    @Column(nullable = false)
    @Builder.Default
    private Boolean active = true;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "clinic_id", nullable = false)
    private Clinic clinic;

    @PrePersist
    void assignId() { if (id == null) id = UUID.randomUUID(); }
}
