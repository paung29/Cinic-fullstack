package com.clinic.demo.service;

import com.clinic.demo.controller.dto.ClinicApi.LicenseInput;
import com.clinic.demo.controller.dto.ClinicApi.LicenseResponse;
import com.clinic.demo.entity.Clinic;
import com.clinic.demo.entity.License;
import com.clinic.demo.entity.enums.LicenseStatus;
import com.clinic.demo.exception.AppBusinessException;
import com.clinic.demo.exception.ResourceNotFoundException;
import com.clinic.demo.repo.ClinicRepository;
import com.clinic.demo.repo.LicenseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class LicenseService {
    private final LicenseRepository licenseRepository;
    private final ClinicRepository clinicRepository;

    @Transactional(readOnly = true)
    public LicenseResponse get(UUID clinicId) {
        return response(require(clinicId));
    }

    @Transactional
    public LicenseResponse set(UUID clinicId, LicenseInput input, String changedBy) {
        License license = licenseRepository.findByClinicId(clinicId).orElseGet(() -> {
            Clinic clinic = clinicRepository.findById(clinicId)
                    .orElseThrow(() -> new ResourceNotFoundException("Clinic", "id", clinicId.toString()));
            return License.builder().clinic(clinic).build();
        });
        LocalDate graceEnd = input.graceEndsOn() == null ? input.termEndsOn().plusDays(90) : input.graceEndsOn();
        if (graceEnd.isBefore(input.termEndsOn())) {
            throw new AppBusinessException("Grace end cannot be before the license term end.");
        }
        license.setStatus(input.status());
        license.setTermEndsOn(input.termEndsOn());
        license.setGraceEndsOn(graceEnd);
        license.setChangedBy(changedBy);
        license.setNote(input.note());
        return response(licenseRepository.save(license));
    }

    /**
     * The clock can only move ACTIVE -> WARNING -> GRACE. Punishing states are
     * deliberately human-set and never automatic.
     */
    public LicenseStatus effectiveStatus(License license) {
        if (license.getStatus() == LicenseStatus.RESTRICTED || license.getStatus() == LicenseStatus.SUSPENDED) {
            return license.getStatus();
        }
        LocalDate today = LocalDate.now();
        if (today.isAfter(license.getTermEndsOn()) && !today.isAfter(license.getGraceEndsOn())) {
            return LicenseStatus.GRACE;
        }
        if (today.isAfter(license.getGraceEndsOn())) {
            return LicenseStatus.GRACE;
        }
        if (!today.isBefore(license.getTermEndsOn().minusDays(30))) {
            return LicenseStatus.WARNING;
        }
        return LicenseStatus.ACTIVE;
    }

    public void requireAdministrativeWrite(UUID clinicId) {
        LicenseStatus status = effectiveStatus(require(clinicId));
        if (status == LicenseStatus.RESTRICTED || status == LicenseStatus.SUSPENDED) {
            throw new AppBusinessException("The license does not allow administrative changes.");
        }
    }

    public License require(UUID clinicId) {
        return licenseRepository.findByClinicId(clinicId)
                .orElseThrow(() -> new ResourceNotFoundException("License", "clinicId", clinicId.toString()));
    }

    private LicenseResponse response(License l) {
        return new LicenseResponse(l.getId(), l.getClinic().getId(), l.getStatus(), effectiveStatus(l),
                l.getTermEndsOn(), l.getGraceEndsOn(), l.getChangedAt(), l.getChangedBy(), l.getNote());
    }
}
