package com.clinic.demo.service;

import com.clinic.demo.entity.Account;
import com.clinic.demo.exception.ResourceNotFoundException;
import com.clinic.demo.repo.AccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TenantAccessService {
    private final AccountRepository accountRepository;

    public Account require(String email, UUID clinicId) {
        Account account = accountRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("Account", "email", email));
        if (!account.getClinic().getId().equals(clinicId)) {
            throw new AccessDeniedException("The account cannot access this clinic.");
        }
        return account;
    }
}
