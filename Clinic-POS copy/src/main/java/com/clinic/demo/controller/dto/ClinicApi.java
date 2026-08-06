package com.clinic.demo.controller.dto;

import com.clinic.demo.entity.enums.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public final class ClinicApi {
    private ClinicApi() {}

    public record SetupRequest(
            @NotBlank String clinicName,
            String clinicPhone,
            String clinicAddress,
            @NotBlank String timeZone,
            @NotBlank String adminName,
            @NotBlank String adminPhone,
            @Email @NotBlank String email,
            @NotBlank @Size(min = 8) String password,
            @NotBlank @Pattern(regexp = "\\d{4}") String pin
    ) {}

    public record SetupResponse(UUID clinicId, UUID staffId, UUID accountId, String email) {}

    public record LoginRequest(
            @Email @NotBlank String email,
            @NotBlank String password
    ) {}

    public record RefreshRequest(@NotBlank String refreshToken) {}

    public record LogoutRequest(@NotBlank String refreshToken) {}

    public record TokenResponse(
            String accessToken,
            String refreshToken,
            String tokenType,
            LocalDateTime accessExpiresAt,
            LocalDateTime refreshExpiresAt,
            UUID clinicId,
            Role role
    ) {}

    public record ClinicResponse(UUID id, String name, String phone, String address, String timeZone) {}

    public record PatientInput(
            UUID id,
            @NotBlank String name,
            @NotBlank String phone,
            String allergies,
            String alertNote
    ) {}

    public record PatientResponse(
            UUID id,
            String name,
            String phone,
            String allergies,
            String alertNote
    ) {}

    public record CatalogInput(
            @NotBlank String name,
            String sku,
            @NotNull @DecimalMin("0.00") BigDecimal price,
            Boolean active
    ) {}

    public record CatalogItem(
            UUID id,
            SaleLineKind kind,
            String name,
            String sku,
            BigDecimal price,
            Integer currentStock,
            boolean active
    ) {}

    public record StaffInput(
            @NotBlank String name,
            @NotBlank String phone,
            @Pattern(regexp = "\\d{4}") String pin,
            Boolean active
    ) {}

    public record StaffResponse(UUID id, String name, String phone, boolean active) {}

    public record AccountInput(
            @Email @NotBlank String email,
            @Size(min = 8) String password,
            @NotNull Role role,
            UUID staffId,
            Boolean active
    ) {}

    public record AccountResponse(UUID id, String email, Role role, Boolean active, UUID staffId) {}

    public record PatientRef(UUID id, String name, String phone, String allergies, String alertNote) {}

    public record SaleLineInput(
            @NotNull SaleLineKind kind,
            UUID catalogId,
            String nameSnapshot,
            @DecimalMin("0.00") BigDecimal unitPrice,
            @NotNull @Min(1) Integer quantity
    ) {}

    public record PaymentInput(
            @NotNull PaymentMethod method,
            @NotNull @DecimalMin("0.00") BigDecimal amount,
            String referenceNumber,
            LocalDateTime paidAt
    ) {}

    public record SaleInput(
            @NotNull UUID id,
            @NotBlank String idempotencyKey,
            @NotBlank String saleNumber,
            @Valid PatientRef patient,
            @NotNull UUID staffId,
            LocalDate followUpDate,
            Boolean createdOffline,
            LocalDateTime createdAt,
            @NotEmpty List<@Valid SaleLineInput> lines,
            @NotEmpty List<@Valid PaymentInput> payments
    ) {}

    public record SaleLineResponse(
            UUID id,
            SaleLineKind kind,
            UUID catalogId,
            String name,
            BigDecimal unitPrice,
            int quantity,
            BigDecimal lineTotal
    ) {}

    public record PaymentResponse(
            UUID id,
            PaymentMethod method,
            BigDecimal amount,
            String referenceNumber,
            LocalDateTime paidAt
    ) {}

    public record SaleResponse(
            UUID id,
            String idempotencyKey,
            String saleNumber,
            UUID patientId,
            UUID staffId,
            LocalDate followUpDate,
            BigDecimal total,
            SaleStatus status,
            String validationMessage,
            boolean createdOffline,
            LocalDateTime createdAt,
            List<SaleLineResponse> lines,
            List<PaymentResponse> payments,
            boolean replay
    ) {}

    public record StockAdjustment(
            @NotNull Integer delta,
            @NotNull StockMoveReason reason,
            String note
    ) {}

    public record StockMoveResponse(
            UUID id,
            UUID productId,
            Integer delta,
            StockMoveReason reason,
            UUID saleId,
            String note,
            LocalDateTime createdAt
    ) {}

    public record ElevationRequest(@NotBlank String adminPassword) {}
    public record ElevationResponse(UUID token, LocalDateTime expiresAt) {}
    public record PinRequest(@NotNull UUID staffId, @Pattern(regexp = "\\d{4}") String pin) {}
    public record PinResponse(UUID staffId, String name, boolean valid) {}

    public record ClinicalRecordInput(
            @NotNull UUID staffId,
            String visitNotes,
            String prescriptions,
            String injectionMap,
            String consents,
            String mediaKeys,
            String contactLog
    ) {}

    public record ClinicalRecordResponse(
            UUID id,
            UUID patientId,
            UUID staffId,
            String visitNotes,
            String prescriptions,
            String injectionMap,
            String consents,
            String mediaKeys,
            String contactLog,
            LocalDateTime createdAt
    ) {}

    public record LicenseInput(
            @NotNull LicenseStatus status,
            @NotNull LocalDate termEndsOn,
            LocalDate graceEndsOn,
            String note
    ) {}

    public record LicenseResponse(
            UUID id,
            UUID clinicId,
            LicenseStatus storedStatus,
            LicenseStatus effectiveStatus,
            LocalDate termEndsOn,
            LocalDate graceEndsOn,
            LocalDateTime changedAt,
            String changedBy,
            String note
    ) {}

    public record ExportRequest(@NotBlank String adminPassword) {}
}
