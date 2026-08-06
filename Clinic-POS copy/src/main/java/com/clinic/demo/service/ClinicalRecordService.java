package com.clinic.demo.service;

import com.clinic.demo.controller.dto.ClinicApi.ClinicalRecordInput;
import com.clinic.demo.controller.dto.ClinicApi.ClinicalRecordResponse;
import com.clinic.demo.entity.*;
import com.clinic.demo.exception.ResourceNotFoundException;
import com.clinic.demo.repo.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ClinicalRecordService {
    private final ClinicalRecordRepository clinicalRecordRepository;
    private final ClinicalAccessLogRepository accessLogRepository;
    private final ElevationService elevationService;
    private final PatientRepository patientRepository;
    private final StaffRepository staffRepository;

    @Transactional
    public List<ClinicalRecordResponse> list(UUID clinicId, UUID patientId, String email, UUID token) {
        Account account = elevationService.requireValid(clinicId, email, token);
        Patient patient = requirePatient(clinicId, patientId);
        log(account, patient, "READ_CLINICAL_RECORDS");
        return clinicalRecordRepository.findAllByClinicIdAndPatientIdOrderByCreatedAtDesc(clinicId, patientId)
                .stream().map(this::response).toList();
    }

    @Transactional
    public ClinicalRecordResponse create(UUID clinicId, UUID patientId, String email, UUID token,
                                         ClinicalRecordInput input) {
        Account account = elevationService.requireValid(clinicId, email, token);
        Patient patient = requirePatient(clinicId, patientId);
        Staff staff = staffRepository.findByIdAndClinicId(input.staffId(), clinicId)
                .orElseThrow(() -> new ResourceNotFoundException("Staff", "id", input.staffId().toString()));
        ClinicalRecord record = clinicalRecordRepository.save(ClinicalRecord.builder()
                .clinic(patient.getClinic()).patient(patient).staff(staff)
                .visitNotes(input.visitNotes()).prescriptions(input.prescriptions())
                .injectionMap(input.injectionMap()).consents(input.consents())
                .mediaKeys(input.mediaKeys()).contactLog(input.contactLog()).build());
        log(account, patient, "CREATE_CLINICAL_RECORD");
        return response(record);
    }

    private Patient requirePatient(UUID clinicId, UUID id) {
        return patientRepository.findByIdAndClinicId(id, clinicId)
                .orElseThrow(() -> new ResourceNotFoundException("Patient", "id", id.toString()));
    }

    private void log(Account account, Patient patient, String action) {
        accessLogRepository.save(ClinicalAccessLog.builder()
                .clinic(account.getClinic()).account(account).patient(patient).action(action).build());
    }

    private ClinicalRecordResponse response(ClinicalRecord r) {
        return new ClinicalRecordResponse(r.getId(), r.getPatient().getId(), r.getStaff().getId(),
                r.getVisitNotes(), r.getPrescriptions(), r.getInjectionMap(), r.getConsents(),
                r.getMediaKeys(), r.getContactLog(), r.getCreatedAt());
    }
}
