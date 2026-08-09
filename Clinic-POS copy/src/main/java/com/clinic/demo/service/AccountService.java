package com.clinic.demo.service;

import com.clinic.demo.controller.dto.ClinicApi.*;
import com.clinic.demo.entity.*;
import com.clinic.demo.exception.AppBusinessException;
import com.clinic.demo.exception.ResourceNotFoundException;
import com.clinic.demo.repo.*;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AccountService {
    private final AccountRepository accountRepository;
    private final ClinicRepository clinicRepository;
    private final StaffRepository staffRepository;
    private final LicenseRepository licenseRepository;
    private final ServiceRepository serviceRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional
    public SetupResponse setup(SetupRequest input) {
        if (accountRepository.count() != 0) {
            throw new AppBusinessException("Initial setup has already been completed.");
        }
        Clinic clinic = clinicRepository.save(Clinic.builder()
                .name(input.clinicName().trim())
                .phone(input.clinicPhone())
                .address(input.clinicAddress())
                .timeZone(input.timeZone())
                .build());
        Staff staff = staffRepository.save(Staff.builder()
                .clinic(clinic)
                .name(input.adminName().trim())
                .phone(input.adminPhone().trim())
                .pinHash(passwordEncoder.encode(input.pin()))
                .active(true)
                .build());
        Account account = accountRepository.save(Account.builder()
                .clinic(clinic)
                .staff(staff)
                .email(input.email().trim().toLowerCase())
                .passwordHash(passwordEncoder.encode(input.password()))
                .role(com.clinic.demo.entity.enums.Role.ADMIN)
                .active(true)
                .build());
        serviceRepository.save(com.clinic.demo.entity.Service.builder()
                .id(java.util.UUID.randomUUID())
                .clinic(clinic)
                .name("Consultation")
                .nameEn("Consultation")
                .category("General")
                .price(java.math.BigDecimal.valueOf(10_000))
                .durationMin(30)
                .active(true)
                .build());
        LocalDate termEnd = LocalDate.now().plusYears(1);
        licenseRepository.save(License.builder()
                .clinic(clinic)
                .termEndsOn(termEnd)
                .graceEndsOn(termEnd.plusDays(90))
                .changedBy(input.email())
                .note("Initial annual license")
                .build());
        return new SetupResponse(clinic.getId(), staff.getId(), account.getId(), account.getEmail());
    }

    @Transactional(readOnly = true)
    public List<AccountResponse> list(UUID clinicId) {
        return accountRepository.findAllByClinicIdOrderByEmail(clinicId).stream()
                .map(this::response)
                .toList();
    }

    @Transactional
    public AccountResponse create(UUID clinicId, AccountInput input) {
        if (accountRepository.existsByEmail(input.email().trim().toLowerCase())) {
            throw new AppBusinessException("An account with this email already exists.");
        }
        Clinic clinic = clinicRepository.findById(clinicId)
                .orElseThrow(() -> new ResourceNotFoundException("Clinic", "id", clinicId.toString()));
        Staff staff = input.staffId() == null ? null : staffRepository.findByIdAndClinicId(input.staffId(), clinicId)
                .orElseThrow(() -> new ResourceNotFoundException("Staff", "id", input.staffId().toString()));
        Account account = accountRepository.save(Account.builder()
                .clinic(clinic)
                .staff(staff)
                .email(input.email().trim().toLowerCase())
                .passwordHash(passwordEncoder.encode(input.password()))
                .role(input.role())
                .active(input.active() == null || input.active())
                .build());
        return response(account);
    }

    @Transactional
    public AccountResponse update(UUID clinicId, UUID id, AccountInput input) {
        Account account = accountRepository.findByIdAndClinicId(id, clinicId)
                .orElseThrow(() -> new ResourceNotFoundException("Account", "id", id.toString()));
        if (!account.getEmail().equalsIgnoreCase(input.email()) &&
                accountRepository.existsByEmail(input.email().trim().toLowerCase())) {
            throw new AppBusinessException("An account with this email already exists.");
        }
        account.setEmail(input.email().trim().toLowerCase());
        if (input.password() != null && !input.password().isBlank()) {
            account.setPasswordHash(passwordEncoder.encode(input.password()));
        }
        account.setRole(input.role());
        account.setActive(input.active() == null || input.active());
        account.setStaff(input.staffId() == null ? null : staffRepository.findByIdAndClinicId(input.staffId(), clinicId)
                .orElseThrow(() -> new ResourceNotFoundException("Staff", "id", input.staffId().toString())));
        return response(account);
    }

    private AccountResponse response(Account account) {
        return new AccountResponse(account.getId(), account.getEmail(), account.getRole(), account.getActive(),
                account.getStaff() == null ? null : account.getStaff().getId());
    }
}
