package com.clinic.demo.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "contact_log")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Contact {
    @Id private UUID id;
    @Version private Long version;
    @Column(name = "contacted_at", nullable = false) private OffsetDateTime at;
    @Column(nullable = false) private String channel;
    @Column(nullable = false) private String direction;
    private String outcome;
    @Column(columnDefinition = "TEXT") private String note;
    @Column(nullable = false) @Builder.Default private Boolean automated = false;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "patient_id") private Patient patient;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "sale_id") private Sale sale;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "clinic_id") private Clinic clinic;
    @PrePersist void assignDefaults() {
        if (id == null) id = UUID.randomUUID();
        if (at == null) at = OffsetDateTime.now();
    }
}
