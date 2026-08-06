package com.clinic.demo.service;

import com.clinic.demo.controller.dto.ClinicApi.LoginRequest;
import com.clinic.demo.controller.dto.ClinicApi.TokenResponse;
import com.clinic.demo.entity.Account;
import com.clinic.demo.exception.TokenInvalidException;
import com.clinic.demo.repo.AccountRepository;
import com.clinic.demo.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {
    private final AuthenticationProvider authenticationProvider;
    private final AccountRepository accountRepository;
    private final JwtService jwtService;

    @Transactional
    public TokenResponse login(LoginRequest input, String clientIp) {
        String email = input.email().trim().toLowerCase();
        authenticationProvider.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(email, input.password()));
        Account account = accountRepository.findByEmail(email)
                .orElseThrow(() -> new TokenInvalidException("Account does not exist."));
        return jwtService.issueTokens(account, clientIp);
    }

    public TokenResponse refresh(String refreshToken, String clientIp) {
        return jwtService.rotateRefreshToken(refreshToken, clientIp);
    }

    public void logout(String refreshToken) {
        jwtService.revokeRefreshToken(refreshToken);
    }
}
