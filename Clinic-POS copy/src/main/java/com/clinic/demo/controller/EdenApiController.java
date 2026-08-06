package com.clinic.demo.controller;

import com.clinic.demo.controller.dto.EdenApi.*;
import com.clinic.demo.entity.Account;
import com.clinic.demo.service.EdenApiService;
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

    @GetMapping("/health") public HealthResponse health() { return new HealthResponse(true, OffsetDateTime.now(ZoneOffset.UTC)); }
    @PostMapping("/auth/login") public LoginResponse login(@Valid @RequestBody LoginRequest input, HttpServletRequest request) { return api.login(input, request.getRemoteAddr()); }
    @PostMapping("/auth/refresh") public TokenPair refresh(@Valid @RequestBody RefreshRequest input, HttpServletRequest request) { return api.refresh(input.refresh(), request.getRemoteAddr()); }
    @PostMapping("/auth/elevate") public ElevationResponse elevate(Authentication auth, @Valid @RequestBody ElevationRequest input) { return api.elevate(account(auth), input); }
    @GetMapping("/bootstrap") public Bootstrap bootstrap(Authentication auth) { return api.bootstrap(account(auth)); }
    @GetMapping("/delta") public Delta delta(Authentication auth, @RequestParam long since) { return api.delta(account(auth), since); }
    @PatchMapping("/clinic") public ClinicDto clinic(Authentication auth, @Valid @RequestBody ClinicPatch input, @RequestHeader("X-Elevation") UUID elevation) { return api.patchClinic(account(auth), input, elevation); }
    @PostMapping("/patients") public PatientEnvelope patient(Authentication auth, @Valid @RequestBody PatientDto input) { return api.createPatient(account(auth), input); }
    @PatchMapping("/patients/{id}") public PatientDto patientPatch(Authentication auth, @PathVariable UUID id, @Valid @RequestBody PatientDto input) { return api.patchPatient(account(auth), id, input); }
    @PostMapping("/products") public ProductEnvelope product(Authentication auth, @Valid @RequestBody ProductInput input) { return api.createProduct(account(auth), input); }
    @PatchMapping("/products/{id}") public ProductDto productPatch(Authentication auth, @PathVariable UUID id, @Valid @RequestBody ProductPatch input, @RequestHeader("X-Elevation") UUID elevation) { return api.patchProduct(account(auth), id, input, elevation); }
    @GetMapping("/barcode-lookup") public BarcodeLookup barcode(Authentication auth, @RequestParam String code) { return api.barcode(account(auth), code); }
    @PostMapping("/stock/receive") public ProductEnvelope receive(Authentication auth, @Valid @RequestBody StockReceive input) { return api.receive(account(auth), input); }
    @PostMapping("/stock/adjust") public ProductDto adjust(Authentication auth, @Valid @RequestBody StockAdjust input, @RequestHeader("X-Elevation") UUID elevation) { return api.adjust(account(auth), input, elevation); }
    @PostMapping("/appointments") public AppointmentEnvelope appointment(Authentication auth, @Valid @RequestBody AppointmentDto input) { return api.createAppointment(account(auth), input); }
    @PatchMapping("/appointments/{id}") public AppointmentDto appointmentPatch(Authentication auth, @PathVariable UUID id, @Valid @RequestBody AppointmentPatch input) { return api.patchAppointment(account(auth), id, input); }
    @PostMapping("/contact-log") public ContactEnvelope contact(Authentication auth, @Valid @RequestBody ContactDto input) { return api.createContact(account(auth), input); }
    @PostMapping("/sales") public SaleEnvelope sale(Authentication auth, @Valid @RequestBody SaleDto input) { return api.createSale(account(auth), input); }
    @PostMapping("/sales/{id}/payments") public PaymentEnvelope payment(Authentication auth, @PathVariable UUID id, @Valid @RequestBody PaymentDto input) { return api.addPayment(account(auth), id, input); }
    @PostMapping("/sales/{id}/void") public SaleEnvelope voidSale(Authentication auth, @PathVariable UUID id, @RequestHeader("X-Elevation") UUID elevation) { return api.voidSale(account(auth), id, elevation); }
    @GetMapping("/followups") public List<Map<String,Object>> followups(Authentication auth, @RequestParam(required = false) LocalDate from, @RequestParam(required = false) LocalDate to) { return api.followups(account(auth), from, to); }
    @GetMapping("/reports/daily") public Map<String,Object> daily(Authentication auth, @RequestParam LocalDate date, @RequestHeader("X-Elevation") UUID elevation) { return api.dailyReport(account(auth), date, elevation); }

    private Account account(Authentication auth) { return api.account(auth.getName()); }
}
