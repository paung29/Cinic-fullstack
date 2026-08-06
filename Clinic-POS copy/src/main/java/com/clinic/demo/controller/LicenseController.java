package com.clinic.demo.controller;

import com.clinic.demo.controller.dto.ClinicApi.LicenseInput;
import com.clinic.demo.controller.dto.ClinicApi.LicenseResponse;
import com.clinic.demo.service.LicenseService;
import com.clinic.demo.service.TenantAccessService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/clinics/{clinicId}/license")
@RequiredArgsConstructor
public class LicenseController {
    private final LicenseService licenseService;
    private final TenantAccessService tenantAccessService;

    @GetMapping
    public LicenseResponse get(@PathVariable UUID clinicId, Authentication auth) {
        tenantAccessService.require(auth.getName(), clinicId);
        return licenseService.get(clinicId);
    }

    @PutMapping
    @PreAuthorize("hasRole('ADMIN')")
    public LicenseResponse set(@PathVariable UUID clinicId, Authentication auth,
                               @Valid @RequestBody LicenseInput input) {
        tenantAccessService.require(auth.getName(), clinicId);
        return licenseService.set(clinicId, input, auth.getName());
    }
}
