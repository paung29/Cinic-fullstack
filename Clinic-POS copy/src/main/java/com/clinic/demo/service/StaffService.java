package com.clinic.demo.service;

import com.clinic.demo.controller.dto.ClinicApi.StaffInput;
import com.clinic.demo.controller.dto.ClinicApi.StaffResponse;
import com.clinic.demo.controller.dto.ClinicApi.PinResponse;
import com.clinic.demo.entity.Clinic;
import com.clinic.demo.entity.Staff;
import com.clinic.demo.exception.ResourceNotFoundException;
import com.clinic.demo.repo.ClinicRepository;
import com.clinic.demo.repo.StaffRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class StaffService {
    private final StaffRepository staffRepository;
    private final ClinicRepository clinicRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional(readOnly = true)
    public List<StaffResponse> list(UUID clinicId) {
        return staffRepository.findAllByClinicIdOrderByName(clinicId).stream().map(this::response).toList();
    }

    @Transactional
    public StaffResponse create(UUID clinicId, StaffInput input) {
        Clinic clinic = clinicRepository.findById(clinicId)
                .orElseThrow(() -> new ResourceNotFoundException("Clinic", "id", clinicId.toString()));
        Staff staff = staffRepository.save(Staff.builder()
                .clinic(clinic).name(input.name().trim()).phone(input.phone().trim())
                .pinHash(passwordEncoder.encode(input.pin()))
                .active(input.active() == null || input.active()).build());
        return response(staff);
    }

    @Transactional
    public StaffResponse update(UUID clinicId, UUID id, StaffInput input) {
        Staff staff = require(clinicId, id);
        staff.setName(input.name().trim());
        staff.setPhone(input.phone().trim());
        if (input.pin() != null && !input.pin().isBlank()) staff.setPinHash(passwordEncoder.encode(input.pin()));
        staff.setActive(input.active() == null || input.active());
        return response(staff);
    }

    public Staff require(UUID clinicId, UUID id) {
        return staffRepository.findByIdAndClinicId(id, clinicId)
                .orElseThrow(() -> new ResourceNotFoundException("Staff", "id", id.toString()));
    }

    @Transactional(readOnly = true)
    public PinResponse verifyPin(UUID clinicId, UUID staffId, String pin) {
        Staff staff = require(clinicId, staffId);
        boolean valid = Boolean.TRUE.equals(staff.getActive()) && passwordEncoder.matches(pin, staff.getPinHash());
        return new PinResponse(staff.getId(), staff.getName(), valid);
    }

    private StaffResponse response(Staff s) {
        return new StaffResponse(s.getId(), s.getName(), s.getPhone(), Boolean.TRUE.equals(s.getActive()));
    }
}
