package com.clinic.demo.entity;

import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;
import java.time.ZoneId;

@Entity
@Table(name = "clinics")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Clinic {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    private String phone;

    private String address;

    @Column(name = "rounding_step", nullable = false)
    @Builder.Default
    private Integer roundingStep = 500;

    @Column(name = "credit_limit_mmk", nullable = false)
    @Builder.Default
    private Integer creditLimitMmk = 500_000;

    @Column(name = "receipt_footer")
    @Builder.Default
    private String receiptFooter = "Thank you";

    @Column(name = "logo_url")
    @Builder.Default
    private String logoUrl = "";

    @Column(name = "receipt_qr", nullable = false)
    @Builder.Default
    private Boolean receiptQr = true;

    @Column(name = "receipt_next_visit", nullable = false)
    @Builder.Default
    private Boolean receiptNextVisit = true;

    @Builder.Default private String receiptTemplate = "classic";
    @Builder.Default private String receiptHeaderFont = "sans";
    @Builder.Default private String receiptDivider = "line";
    @Builder.Default private String consentMode = "warn";

    @Column(name = "time_zone", nullable = false, length = 60)
    @Builder.Default
    private String timeZone = ZoneId.systemDefault().getId();

}
