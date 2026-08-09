package com.clinic.demo.service;

import com.clinic.demo.controller.dto.ClinicApi.ElevationResponse;
import com.clinic.demo.entity.Account;
import com.clinic.demo.entity.ElevationGrant;
import com.clinic.demo.entity.enums.Role;
import com.clinic.demo.exception.AppBusinessException;
import com.clinic.demo.repo.AccountRepository;
import com.clinic.demo.repo.ElevationGrantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ElevationService {
    private final ElevationGrantRepository elevationGrantRepository;
    private final AccountRepository accountRepository;
    private final PasswordEncoder passwordEncoder;
    private final TenantAccessService tenantAccessService;

    @Transactional
    public ElevationResponse elevate(UUID clinicId, String requesterEmail, String adminPassword) {
        Account requester = tenantAccessService.require(requesterEmail, clinicId);
        verifyAdminPassword(clinicId, adminPassword);
        ElevationGrant grant = elevationGrantRepository.save(ElevationGrant.builder()
                .account(requester).clinic(requester.getClinic()).build());
        return new ElevationResponse(grant.getToken(), grant.getExpiresAt());
    }

    @Transactional(readOnly = true)
    public Account requireValid(UUID clinicId, String requesterEmail, UUID token) {
        Account requester = tenantAccessService.require(requesterEmail, clinicId);
        ElevationGrant grant = elevationGrantRepository.findByToken(token)
                .orElseThrow(() -> new AccessDeniedException("Clinical elevation is required."));
        if (!grant.getClinic().getId().equals(clinicId) ||
                !grant.getAccount().getId().equals(requester.getId()) ||
                grant.isRevoked() || !grant.getExpiresAt().isAfter(LocalDateTime.now(java.time.ZoneOffset.UTC))) {
            throw new AccessDeniedException("Clinical elevation is invalid or expired.");
        }
        return requester;
    }

    public void verifyAdminPassword(UUID clinicId, String password) {
        boolean matches = accountRepository.findAllByClinicIdAndRoleAndActiveTrue(clinicId, Role.ADMIN).stream()
                .anyMatch(a -> passwordEncoder.matches(password, a.getPasswordHash()));
        if (!matches) throw new AppBusinessException("Admin password is incorrect.");
    }
}
