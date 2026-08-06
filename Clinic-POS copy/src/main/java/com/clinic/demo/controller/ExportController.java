package com.clinic.demo.controller;

import com.clinic.demo.controller.dto.ClinicApi.ExportRequest;
import com.clinic.demo.service.ExportService;
import com.clinic.demo.service.TenantAccessService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/clinics/{clinicId}/export")
@RequiredArgsConstructor
public class ExportController {
    private final ExportService exportService;
    private final TenantAccessService tenantAccessService;

    @PostMapping
    public Map<String, Object> export(@PathVariable UUID clinicId, Authentication auth,
                                      @Valid @RequestBody ExportRequest input) {
        tenantAccessService.require(auth.getName(), clinicId);
        return exportService.export(clinicId, input.adminPassword());
    }
}
