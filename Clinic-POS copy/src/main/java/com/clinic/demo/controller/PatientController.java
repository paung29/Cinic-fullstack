package com.clinic.demo.controller;

import com.clinic.demo.controller.dto.ClinicApi.*;
import com.clinic.demo.service.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/clinics/{clinicId}/patients")
@RequiredArgsConstructor
public class PatientController {
    private final PatientService patientService;
    private final ClinicalRecordService clinicalRecordService;
    private final TenantAccessService tenantAccessService;

    @GetMapping
    public List<PatientResponse> list(@PathVariable UUID clinicId, Authentication auth) {
        tenantAccessService.require(auth.getName(), clinicId);
        return patientService.list(clinicId);
    }

    @GetMapping("/{patientId}")
    public PatientResponse get(@PathVariable UUID clinicId, @PathVariable UUID patientId, Authentication auth) {
        tenantAccessService.require(auth.getName(), clinicId);
        return patientService.get(clinicId, patientId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PatientResponse create(@PathVariable UUID clinicId, Authentication auth,
                                  @Valid @RequestBody PatientInput input) {
        tenantAccessService.require(auth.getName(), clinicId);
        return patientService.create(clinicId, input);
    }

    @PutMapping("/{patientId}")
    public PatientResponse update(@PathVariable UUID clinicId, @PathVariable UUID patientId,
                                  Authentication auth, @Valid @RequestBody PatientInput input) {
        tenantAccessService.require(auth.getName(), clinicId);
        return patientService.update(clinicId, patientId, input);
    }

    @GetMapping("/{patientId}/clinical-records")
    public List<ClinicalRecordResponse> clinicalRecords(
            @PathVariable UUID clinicId, @PathVariable UUID patientId,
            @RequestHeader("X-Elevation-Token") UUID elevationToken, Authentication auth) {
        return clinicalRecordService.list(clinicId, patientId, auth.getName(), elevationToken);
    }

    @PostMapping("/{patientId}/clinical-records")
    @ResponseStatus(HttpStatus.CREATED)
    public ClinicalRecordResponse addClinicalRecord(
            @PathVariable UUID clinicId, @PathVariable UUID patientId,
            @RequestHeader("X-Elevation-Token") UUID elevationToken, Authentication auth,
            @Valid @RequestBody ClinicalRecordInput input) {
        return clinicalRecordService.create(clinicId, patientId, auth.getName(), elevationToken, input);
    }
}
