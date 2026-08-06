package com.clinic.demo.controller;

import com.clinic.demo.controller.dto.ClinicApi.ClinicResponse;
import com.clinic.demo.service.ClinicService;
import com.clinic.demo.service.TenantAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/clinics/{clinicId}")
@RequiredArgsConstructor
public class ClinicController {
    private final ClinicService clinicService;
    private final TenantAccessService tenantAccessService;

    @GetMapping
    public ClinicResponse get(@PathVariable UUID clinicId, Authentication auth) {
        tenantAccessService.require(auth.getName(), clinicId);
        return clinicService.get(clinicId);
    }
}
