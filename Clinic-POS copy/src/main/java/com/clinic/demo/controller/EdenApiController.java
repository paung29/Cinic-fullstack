package com.clinic.demo.controller;

import com.clinic.demo.controller.dto.EdenApi.*;
import com.clinic.demo.entity.Account;
import com.clinic.demo.service.EdenApiService;
import com.clinic.demo.service.ClinicalRecordService;
import com.clinic.demo.service.LicenseService;
import com.clinic.demo.service.ExportService;
import com.clinic.demo.controller.dto.ClinicApi.LicenseResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.*;
import java.util.*;

@RestController
@RequiredArgsConstructor
public class EdenApiController {
    private final EdenApiService api;
    private final ClinicalRecordService clinicalRecords;
    private final LicenseService licenses;
    private final ExportService exports;

    @GetMapping("/health") public HealthResponse health() { return new HealthResponse(true, OffsetDateTime.now(ZoneOffset.UTC)); }
    @PostMapping("/auth/login") public LoginResponse login(@Valid @RequestBody LoginRequest input, HttpServletRequest request) { return api.login(input, request.getRemoteAddr()); }
    @PostMapping("/auth/login-email") public LoginResponse loginEmail(@Valid @RequestBody EmailLoginRequest input, HttpServletRequest request) { return api.loginWithEmail(input, request.getRemoteAddr()); }
    @PostMapping("/auth/refresh") public TokenPair refresh(@Valid @RequestBody RefreshRequest input, HttpServletRequest request) { return api.refresh(input.refresh(), request.getRemoteAddr()); }
    @PostMapping("/auth/logout") public void logout(@Valid @RequestBody LogoutRequest input) { api.logout(input.refresh()); }
    @PostMapping("/auth/elevate") public ElevationResponse elevate(Authentication auth, @Valid @RequestBody ElevationRequest input) { return api.elevate(account(auth), input); }
    @GetMapping("/bootstrap") public Bootstrap bootstrap(Authentication auth) { return api.bootstrap(account(auth)); }
    @GetMapping("/delta") public Delta delta(Authentication auth, @RequestParam long since) { return api.delta(account(auth), since); }
    @PatchMapping("/clinic") public ClinicDto clinic(Authentication auth, @Valid @RequestBody ClinicPatch input, @RequestHeader("X-Elevation") UUID elevation) { return api.patchClinic(account(auth), input, elevation); }
    @PostMapping("/patients") public PatientEnvelope patient(Authentication auth, @Valid @RequestBody PatientDto input) { return api.createPatient(account(auth), input); }
    @PatchMapping("/patients/{id}") public PatientDto patientPatch(Authentication auth, @PathVariable UUID id, @Valid @RequestBody PatientDto input) { return api.patchPatient(account(auth), id, input); }
    @PostMapping("/products") public ProductEnvelope product(Authentication auth, @Valid @RequestBody ProductInput input) { return api.createProduct(account(auth), input); }
    @PatchMapping("/products/{id}") public ProductDto productPatch(Authentication auth, @PathVariable UUID id, @Valid @RequestBody ProductPatch input, @RequestHeader("X-Elevation") UUID elevation) { return api.patchProduct(account(auth), id, input, elevation); }
    @PostMapping("/services") public ServiceEnvelope serviceCreate(Authentication auth, @Valid @RequestBody ServiceInput input, @RequestHeader("X-Elevation") UUID elevation) { return api.createService(account(auth), input, elevation); }
    @PatchMapping("/services/{id}") public ServiceDto servicePatch(Authentication auth, @PathVariable UUID id, @Valid @RequestBody ServicePatch input, @RequestHeader("X-Elevation") UUID elevation) { return api.patchService(account(auth), id, input, elevation); }
    @GetMapping("/barcode-lookup") public BarcodeLookup barcode(Authentication auth, @RequestParam String code) { return api.barcode(account(auth), code); }
    @PutMapping("/products/{id}/photo") public ProductDto productPhotoPut(Authentication auth, @PathVariable UUID id, @Valid @RequestBody ProductPhotoInput input) { return api.putProductPhoto(account(auth), id, input); }
    @GetMapping("/products/{id}/photo") public ProductPhotoResponse productPhotoGet(Authentication auth, @PathVariable UUID id) { return api.productPhoto(account(auth), id); }
    @DeleteMapping("/products/{id}/photo") public ProductDto productPhotoDelete(Authentication auth, @PathVariable UUID id) { return api.deleteProductPhoto(account(auth), id); }
    @PostMapping("/stock/receive") public ProductEnvelope receive(Authentication auth, @Valid @RequestBody StockReceive input) { return api.receive(account(auth), input); }
    @PostMapping("/stock/adjust") public ProductDto adjust(Authentication auth, @Valid @RequestBody StockAdjust input, @RequestHeader("X-Elevation") UUID elevation) { return api.adjust(account(auth), input, elevation); }
    @PostMapping("/appointments") public AppointmentEnvelope appointment(Authentication auth, @Valid @RequestBody AppointmentDto input) { return api.createAppointment(account(auth), input); }
    @PatchMapping("/appointments/{id}") public AppointmentDto appointmentPatch(Authentication auth, @PathVariable UUID id, @Valid @RequestBody AppointmentPatch input) { return api.patchAppointment(account(auth), id, input); }
    @PostMapping("/contact-log") public ContactEnvelope contact(Authentication auth, @Valid @RequestBody ContactDto input) { return api.createContact(account(auth), input); }
    @PostMapping("/sales") public SaleEnvelope sale(Authentication auth, @Valid @RequestBody SaleDto input) { return api.createSale(account(auth), input); }
    @PostMapping("/sales/{id}/payments") public PaymentEnvelope payment(Authentication auth, @PathVariable UUID id, @Valid @RequestBody PaymentDto input) { return api.addPayment(account(auth), id, input); }
    @PostMapping("/sales/{id}/void") public SaleEnvelope voidSale(Authentication auth, @PathVariable UUID id, @RequestHeader("X-Elevation") UUID elevation, @RequestBody(required = false) VoidSaleRequest input) { return api.voidSale(account(auth), id, elevation, input == null ? null : input.reason()); }
    @GetMapping("/patients/{id}/clinical-records") public List<ClinicalRecordDto> clinicalRecords(Authentication auth, @PathVariable UUID id, @RequestHeader("X-Elevation") UUID elevation) { Account account = account(auth); return clinicalRecords.listForFrontend(account.getClinic().getId(), id, auth.getName(), elevation); }
    @PostMapping("/patients/{id}/clinical-records") public ClinicalRecordDto clinicalRecord(Authentication auth, @PathVariable UUID id, @RequestHeader("X-Elevation") UUID elevation, @Valid @RequestBody ClinicalRecordInput input) { Account account = account(auth); return clinicalRecords.createForFrontend(account.getClinic().getId(), id, auth.getName(), elevation, input); }
    @GetMapping("/followups") public List<Map<String,Object>> followups(Authentication auth, @RequestParam(required = false) LocalDate from, @RequestParam(required = false) LocalDate to) { return api.followups(account(auth), from, to); }
    @GetMapping("/reports/daily") public Map<String,Object> daily(Authentication auth, @RequestParam LocalDate date, @RequestHeader("X-Elevation") UUID elevation) { return api.dailyReport(account(auth), date, elevation); }
    @PostMapping("/admin/staff-account") public StaffDto createStaffAccount(Authentication auth, @Valid @RequestBody StaffAccountInput input) { return api.createStaffAccount(account(auth), input); }
    @GetMapping("/license") public LicenseResponse license(Authentication auth) { Account account = account(auth); return licenses.get(account.getClinic().getId()); }
    @PostMapping("/export") public Map<String,Object> export(Authentication auth, @RequestBody Map<String,String> input) { Account account = account(auth); return exports.export(account.getClinic().getId(), input.getOrDefault("password", "")); }

    private Account account(Authentication auth) { return api.account(auth.getName()); }
}
