package com.clinic.demo.service;

import com.clinic.demo.controller.dto.ClinicApi.PatientInput;
import com.clinic.demo.controller.dto.ClinicApi.PatientResponse;
import com.clinic.demo.entity.Clinic;
import com.clinic.demo.entity.Patient;
import com.clinic.demo.exception.AppBusinessException;
import com.clinic.demo.exception.ResourceNotFoundException;
import com.clinic.demo.repo.ClinicRepository;
import com.clinic.demo.repo.PatientRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class PatientService {
    private final PatientRepository patientRepository;
    private final ClinicRepository clinicRepository;

    @Transactional(readOnly = true)
    public List<PatientResponse> list(UUID clinicId) {
        return patientRepository.findAllByClinicIdOrderByName(clinicId).stream().map(this::response).toList();
    }

    @Transactional(readOnly = true)
    public PatientResponse get(UUID clinicId, UUID patientId) {
        return response(require(clinicId, patientId));
    }

    @Transactional
    public PatientResponse create(UUID clinicId, PatientInput input) {
        patientRepository.findByClinicIdAndPhone(clinicId, normalizePhone(input.phone())).ifPresent(existing -> {
            throw new AppBusinessException("A patient with this phone already exists.");
        });
        Clinic clinic = clinicRepository.findById(clinicId)
                .orElseThrow(() -> new ResourceNotFoundException("Clinic", "id", clinicId.toString()));
        return response(patientRepository.save(Patient.builder()
                .id(input.id())
                .clinic(clinic)
                .name(input.name().trim())
                .phone(normalizePhone(input.phone()))
                .allergies(input.allergies())
                .alertNote(input.alertNote())
                .build()));
    }

    @Transactional
    public PatientResponse update(UUID clinicId, UUID patientId, PatientInput input) {
        Patient patient = require(clinicId, patientId);
        patientRepository.findByClinicIdAndPhone(clinicId, normalizePhone(input.phone()))
                .filter(other -> !other.getId().equals(patientId))
                .ifPresent(other -> { throw new AppBusinessException("A patient with this phone already exists."); });
        patient.setName(input.name().trim());
        patient.setPhone(normalizePhone(input.phone()));
        patient.setAllergies(input.allergies());
        patient.setAlertNote(input.alertNote());
        return response(patient);
    }

    public Patient require(UUID clinicId, UUID patientId) {
        return patientRepository.findByIdAndClinicId(patientId, clinicId)
                .orElseThrow(() -> new ResourceNotFoundException("Patient", "id", patientId.toString()));
    }

    public PatientResponse response(Patient p) {
        return new PatientResponse(p.getId(), p.getName(), p.getPhone(), p.getAllergies(), p.getAlertNote());
    }

    public static String normalizePhone(String phone) {
        return phone == null ? null : phone.replaceAll("[^0-9+]", "");
    }
}
