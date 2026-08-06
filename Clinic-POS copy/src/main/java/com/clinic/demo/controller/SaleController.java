package com.clinic.demo.controller;

import com.clinic.demo.controller.dto.ClinicApi.SaleInput;
import com.clinic.demo.controller.dto.ClinicApi.SaleResponse;
import com.clinic.demo.service.SaleService;
import com.clinic.demo.service.TenantAccessService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/clinics/{clinicId}")
@RequiredArgsConstructor
public class SaleController {
    private final SaleService saleService;
    private final TenantAccessService tenantAccessService;

    @PostMapping("/sync/sales")
    public SaleResponse sync(@PathVariable UUID clinicId, Authentication auth,
                             @Valid @RequestBody SaleInput input) {
        tenantAccessService.require(auth.getName(), clinicId);
        return saleService.sync(clinicId, input);
    }

    @GetMapping("/sales")
    public List<SaleResponse> list(@PathVariable UUID clinicId, Authentication auth) {
        tenantAccessService.require(auth.getName(), clinicId);
        return saleService.list(clinicId);
    }

    @GetMapping("/sales/{saleId}")
    public SaleResponse get(@PathVariable UUID clinicId, @PathVariable UUID saleId, Authentication auth) {
        tenantAccessService.require(auth.getName(), clinicId);
        return saleService.get(clinicId, saleId);
    }

    @PostMapping("/sales/{saleId}/void")
    @PreAuthorize("hasRole('ADMIN')")
    public SaleResponse voidSale(@PathVariable UUID clinicId, @PathVariable UUID saleId,
                                 @RequestParam(required = false) String note, Authentication auth) {
        tenantAccessService.require(auth.getName(), clinicId);
        return saleService.voidSale(clinicId, saleId, note);
    }
}
