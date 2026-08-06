package com.clinic.demo.service;

import com.clinic.demo.repo.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ExportService {
    private final ElevationService elevationService;
    private final PatientService patientService;
    private final SaleService saleService;
    private final CatalogService catalogService;
    private final StaffService staffService;

    /**
     * Data export always re-prompts for the admin secret and deliberately has no
     * license check. The clinic's data remains the clinic's data in every state.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> export(UUID clinicId, String adminPassword) {
        elevationService.verifyAdminPassword(clinicId, adminPassword);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("clinicId", clinicId);
        data.put("patients", patientService.list(clinicId));
        data.put("staff", staffService.list(clinicId));
        data.put("catalogue", catalogService.list(clinicId));
        data.put("sales", saleService.list(clinicId));
        return data;
    }
}
