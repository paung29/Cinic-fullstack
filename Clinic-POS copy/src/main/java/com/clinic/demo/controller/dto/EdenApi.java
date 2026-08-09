package com.clinic.demo.controller.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;

public final class EdenApi {
    private EdenApi() {}

    public record ErrorResponse(int status, String code, String message) {}
    public record HealthResponse(boolean ok, OffsetDateTime serverTime) {}

    public record LoginRequest(@NotNull UUID staffId, @NotBlank @Pattern(regexp = "\\d{4}") String pin) {}
    public record RefreshRequest(@NotBlank String refresh) {}
    public record LogoutRequest(@NotBlank String refresh) {}
    public record ElevationRequest(@NotBlank String password, String screen) {}
    public record TokenPair(String token, String refresh) {}
    public record LoginResponse(String token, String refresh, StaffDto staff, ClinicDto clinic, OffsetDateTime serverTime) {}
    public record ElevationResponse(UUID elevationToken, OffsetDateTime expiresAt) {}

    public record ClinicDto(UUID id, String name, String phone, String address, int roundingStep,
            int creditLimitMmk, Map<String,Object> receipt, String receiptFooter, String telegramHandle, String logoUrl,
            boolean receiptQr, boolean receiptNextVisit, String receiptTemplate, String receiptHeaderFont,
            String receiptDivider, String consentMode, Map<String,Object> addons, Map<String,Object> featureFlags) {}
    public record ClinicPatch(String name, String phone, String address, String telegramHandle, String receiptFooter, String logoUrl,
            Integer roundingStep, @Min(0) Integer creditLimitMmk, String consentMode, Boolean receiptQr,
            Boolean receiptNextVisit, String receiptTemplate, String receiptHeaderFont, String receiptDivider) {}
    public record StaffDto(UUID id, String name, String role, boolean takesBookings, boolean active) {}
    public record StaffAccountInput(@NotBlank String name, @NotBlank String phone,
            @NotBlank @Pattern(regexp = "\\d{4}") String pin, @Email @NotBlank String email,
            @NotBlank @Size(min = 8) String password, @NotBlank @Pattern(regexp = "admin|staff") String role,
            Boolean takesBookings) {}
    public record ServiceDto(UUID id, String category, String nameMm, String nameEn, long price,
            Integer durationMin, boolean requiresLot, Integer defaultFollowupDays, boolean active) {}

    public record ServiceInput(@NotNull UUID id, String category, @NotBlank String nameMm, String nameEn,
                               @NotNull @Min(0) Long price, Integer durationMin, Boolean requiresLot,
                               Integer defaultFollowupDays, Boolean active) {}

    public record ServicePatch(String category, String nameMm, String nameEn, @Min(0) Long price,
                               Integer durationMin, Boolean requiresLot, Integer defaultFollowupDays, Boolean active) {}

    public record ServiceEnvelope(ServiceDto service, Boolean replayed) {}
    public record ProductDto(UUID id, String name, String category, String subcategory, int sortOrder,
            String barcode, long cost, long price, BigDecimal stockQty, BigDecimal lowStockAt,
            BigDecimal reorderAt, String stockType, String soldBy, boolean requiresLot,
            boolean requiresConsent, String unitLabel, String photoKey, boolean active) {}
    public record ProductInput(@NotNull UUID id, @NotBlank String name, String category, String subcategory,
            Integer sortOrder, String barcode, Long cost, @NotNull @Min(0) Long price, BigDecimal stockQty,
            BigDecimal lowStockAt, BigDecimal reorderAt,
            @NotBlank @Pattern(regexp = "retail|professional|injectable") String stockType,
            @NotBlank @Pattern(regexp = "each|weight") String soldBy,
            Boolean requiresLot, Boolean requiresConsent, String unitLabel, String photoKey, Boolean active) {}
    public record ProductPatch(String name, String category, String subcategory, Integer sortOrder,
            String barcode, Long cost, Long price, BigDecimal lowStockAt, BigDecimal reorderAt,
            @Pattern(regexp = "retail|professional|injectable") String stockType,
            @Pattern(regexp = "each|weight") String soldBy, Boolean requiresLot, Boolean requiresConsent,
            String unitLabel, String photoKey, Boolean active) {}
    public record ProductEnvelope(ProductDto product, String mergedInto, boolean replayed) {}
    public record BarcodeLookup(boolean found, String name, String brand, String category, String imageUrl, String source) {}

    public record PatientDto(UUID id, String code, String name, String phone, String sex, String allergies,
            String alertNote, boolean telegramLinked, LocalDate followupDate) {}
    public record PatientEnvelope(PatientDto patient, String mergedInto, boolean replayed) {}

    public record SaleLineDto(@NotNull UUID id, @NotBlank String kind, @NotNull UUID itemId,
            @NotBlank String nameSnapshot, @NotNull BigDecimal qty, @NotNull Long unitPrice,
            @NotNull Long lineTotal, BigDecimal discountPct, String note, String lotNo, String lotExpiry) {}
    public record PaymentDto(@NotNull UUID id, @NotBlank String method, @NotNull Long amount, OffsetDateTime at) {}
    public record SaleDto(@NotNull UUID id, UUID patientId, @NotNull UUID staffId, UUID practitionerId,
            UUID appointmentId, @NotNull OffsetDateTime at, @NotEmpty List<@Valid SaleLineDto> lines,
            List<@Valid PaymentDto> payments, Long subtotal, BigDecimal discountPct,
            String discountApprovedBy, @NotNull Long total, Long credit, String creditApprovedBy,
            LocalDate followupDate, String deviceId, Boolean createdOffline, String no, String status,
            Boolean needsReview, String reviewReason, OffsetDateTime receivedAt) {}
    public record SaleEnvelope(SaleDto sale, boolean replayed) {}
    public record VoidSaleRequest(String reason) {}
    public record PaymentEnvelope(PaymentDto payment, boolean replayed) {}

    public record StockReceive(@NotNull UUID id, @NotNull UUID productId, @NotNull BigDecimal qty,
            Long cost, String lotNo, String lotExpiry) {}
    public record StockAdjust(@NotNull UUID productId, @NotNull BigDecimal delta, @NotBlank String reason) {}

    public record AppointmentDto(@NotNull UUID id, @NotNull LocalDate date, @NotBlank @Pattern(regexp = "[0-2][0-9]:[0-5][0-9]") String time,
            @NotNull UUID staffId, @NotNull UUID patientId, @NotNull UUID serviceId,
            @Pattern(regexp = "booked|here|done|cancelled") String status) {}
    public record AppointmentEnvelope(AppointmentDto appointment, boolean conflict, boolean replayed) {}
    public record AppointmentPatch(@NotBlank @Pattern(regexp = "booked|here|done|cancelled") String status) {}

    public record ContactDto(@NotNull UUID id, @NotNull UUID patientId, UUID saleId, OffsetDateTime at,
            @NotBlank String channel, @NotBlank String direction, String outcome, String note, Boolean automated) {}
    public record ContactEnvelope(ContactDto contact, boolean replayed) {}

    public record ClinicalRecordInput(@NotNull UUID staffId, String visitNotes, String prescriptions,
            String injectionMap, String consents, String mediaKeys, String contactLog) {}
    public record ClinicalRecordDto(UUID id, UUID patientId, UUID staffId, String visitNotes,
            String prescriptions, String injectionMap, String consents, String mediaKeys,
            String contactLog, OffsetDateTime createdAt) {}

    public record Bootstrap(ClinicDto clinic, List<StaffDto> staff, List<ServiceDto> services,
            List<ProductDto> products, List<PatientDto> patients, List<AppointmentDto> appointments,
            List<SaleDto> recentSales, OffsetDateTime serverTime, long cursor) {}
    public record DeltaChange(String entity, String op, Map<String,Object> row) {}
    public record Delta(List<DeltaChange> changes, long cursor, OffsetDateTime serverTime) {}
}
