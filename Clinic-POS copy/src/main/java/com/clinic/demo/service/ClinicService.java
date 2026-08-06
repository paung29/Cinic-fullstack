package com.clinic.demo.service;

import com.clinic.demo.controller.dto.ClinicApi.ClinicResponse;
import com.clinic.demo.entity.Clinic;
import com.clinic.demo.exception.ResourceNotFoundException;
import com.clinic.demo.repo.ClinicRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ClinicService {
    private final ClinicRepository clinicRepository;

    @Transactional(readOnly = true)
    public ClinicResponse get(UUID clinicId) {
        Clinic clinic = clinicRepository.findById(clinicId)
                .orElseThrow(() -> new ResourceNotFoundException("Clinic", "id", clinicId.toString()));
        return new ClinicResponse(clinic.getId(), clinic.getName(), clinic.getPhone(),
                clinic.getAddress(), clinic.getTimeZone());
    }
}
