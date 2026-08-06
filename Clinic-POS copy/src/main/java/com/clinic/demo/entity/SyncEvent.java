package com.clinic.demo.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "sync_events", indexes = @Index(name = "idx_sync_event_clinic_id", columnList = "clinic_id,id"))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class SyncEvent {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "clinic_id") private Clinic clinic;
    @Column(nullable = false) private String entity;
    @Column(nullable = false) @Builder.Default private String op = "upsert";
    @Lob @Column(name = "row_json", nullable = false) private String rowJson;
}
