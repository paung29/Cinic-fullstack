package com.clinic.demo.controller;

import com.clinic.demo.controller.dto.ClinicApi.*;
import com.clinic.demo.service.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/clinics/{clinicId}")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {
    private final StaffService staffService;
    private final AccountService accountService;
    private final LicenseService licenseService;
    private final TenantAccessService tenantAccessService;

    @GetMapping("/staff")
    public List<StaffResponse> staff(@PathVariable UUID clinicId, Authentication auth) {
        access(clinicId, auth, false);
        return staffService.list(clinicId);
    }

    @PostMapping("/staff")
    @ResponseStatus(HttpStatus.CREATED)
    public StaffResponse createStaff(@PathVariable UUID clinicId, Authentication auth,
                                     @Valid @RequestBody StaffInput input) {
        access(clinicId, auth, true);
        return staffService.create(clinicId, input);
    }

    @PutMapping("/staff/{id}")
    public StaffResponse updateStaff(@PathVariable UUID clinicId, @PathVariable UUID id,
                                     Authentication auth, @Valid @RequestBody StaffInput input) {
        access(clinicId, auth, true);
        return staffService.update(clinicId, id, input);
    }

    @GetMapping("/accounts")
    public List<AccountResponse> accounts(@PathVariable UUID clinicId, Authentication auth) {
        access(clinicId, auth, false);
        return accountService.list(clinicId);
    }

    @PostMapping("/accounts")
    @ResponseStatus(HttpStatus.CREATED)
    public AccountResponse createAccount(@PathVariable UUID clinicId, Authentication auth,
                                         @Valid @RequestBody AccountInput input) {
        access(clinicId, auth, true);
        return accountService.create(clinicId, input);
    }

    @PutMapping("/accounts/{id}")
    public AccountResponse updateAccount(@PathVariable UUID clinicId, @PathVariable UUID id,
                                         Authentication auth, @Valid @RequestBody AccountInput input) {
        access(clinicId, auth, true);
        return accountService.update(clinicId, id, input);
    }

    private void access(UUID clinicId, Authentication auth, boolean write) {
        tenantAccessService.require(auth.getName(), clinicId);
        if (write) licenseService.requireAdministrativeWrite(clinicId);
    }
}
