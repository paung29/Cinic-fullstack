package com.clinic.demo.controller;

import com.clinic.demo.controller.dto.ClinicApi.ElevationRequest;
import com.clinic.demo.controller.dto.ClinicApi.ElevationResponse;
import com.clinic.demo.controller.dto.ClinicApi.PinRequest;
import com.clinic.demo.controller.dto.ClinicApi.PinResponse;
import com.clinic.demo.service.ElevationService;
import com.clinic.demo.service.StaffService;
import com.clinic.demo.service.TenantAccessService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/clinics/{clinicId}/auth")
@RequiredArgsConstructor
public class SecurityController {
    private final ElevationService elevationService;
    private final StaffService staffService;
    private final TenantAccessService tenantAccessService;

    @PostMapping("/elevate")
    public ElevationResponse elevate(@PathVariable UUID clinicId, Authentication auth,
                                     @Valid @RequestBody ElevationRequest input) {
        return elevationService.elevate(clinicId, auth.getName(), input.adminPassword());
    }

    @PostMapping("/pin/verify")
    public PinResponse verifyPin(@PathVariable UUID clinicId, Authentication auth,
                                 @Valid @RequestBody PinRequest input) {
        tenantAccessService.require(auth.getName(), clinicId);
        return staffService.verifyPin(clinicId, input.staffId(), input.pin());
    }
}
