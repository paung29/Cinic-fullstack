package com.clinic.demo;

import com.clinic.demo.controller.dto.ClinicApi.*;
import com.clinic.demo.entity.Account;
import com.clinic.demo.entity.enums.Role;
import com.clinic.demo.exception.TokenInvalidException;
import com.clinic.demo.repo.AccountRepository;
import com.clinic.demo.security.JwtService;
import com.clinic.demo.service.AccountService;
import com.clinic.demo.service.AuthService;
import com.clinic.demo.service.StaffService;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class JwtAuthenticationTests {
    @Autowired AccountService accountService;
    @Autowired AccountRepository accountRepository;
    @Autowired AuthService authService;
    @Autowired JwtService jwtService;
    @Autowired MockMvc mockMvc;
    @Autowired StaffService staffService;

    String email;
    String password;
    UUID clinicId;

    @BeforeEach
    void setupAccount() {
        email = "jwt-owner@clinic.test";
        password = "safe-password";
        SetupResponse setup = accountService.setup(new SetupRequest(
                "JWT Clinic", "09-100", "Lashio", "Asia/Yangon",
                "Owner", "09-101", email, password, "1234"));
        clinicId = setup.clinicId();
    }

    @Test
    void loginIssuesSignedAccessAndRefreshTokensWithAuthorizationClaims() {
        Account account = accountRepository.findByEmail(email).orElseThrow();

        TokenResponse tokens = authService.login(new LoginRequest(email, password), "127.0.0.1");
        Claims claims = jwtService.parseAccessToken(tokens.accessToken());

        assertThat(tokens.tokenType()).isEqualTo("Bearer");
        assertThat(tokens.refreshToken()).isNotBlank();
        assertThat(claims.getSubject()).isEqualTo(account.getId().toString());
        assertThat(claims.get("role", String.class)).isEqualTo("ADMIN");
        assertThat(claims.get("clinic_id", String.class)).isEqualTo(account.getClinic().getId().toString());
    }

    @Test
    void refreshTokenRotatesOnceAndReplayIsRejected() {
        TokenResponse initial = authService.login(new LoginRequest(email, password), "127.0.0.1");

        TokenResponse replacement = authService.refresh(initial.refreshToken(), "127.0.0.2");

        assertThat(replacement.accessToken()).isNotEqualTo(initial.accessToken());
        assertThat(replacement.refreshToken()).isNotEqualTo(initial.refreshToken());
        assertThatThrownBy(() -> authService.refresh(initial.refreshToken(), "127.0.0.3"))
                .isInstanceOf(TokenInvalidException.class)
                .hasMessageContaining("already used");
    }

    @Test
    void logoutRevokesRefreshToken() {
        TokenResponse tokens = authService.login(new LoginRequest(email, password), "127.0.0.1");

        authService.logout(tokens.refreshToken());

        assertThatThrownBy(() -> authService.refresh(tokens.refreshToken(), "127.0.0.1"))
                .isInstanceOf(TokenInvalidException.class);
    }

    @Test
    void bearerTokenAuthenticatesAndRoleClaimAuthorizesRequests() throws Exception {
        mockMvc.perform(get("/api/clinics/{clinicId}", clinicId))
                .andExpect(status().isUnauthorized());

        TokenResponse adminTokens = authService.login(new LoginRequest(email, password), "127.0.0.1");
        mockMvc.perform(get("/api/clinics/{clinicId}", clinicId)
                        .header("Authorization", "Bearer " + adminTokens.accessToken()))
                .andExpect(status().isOk());

        StaffResponse staff = staffService.create(clinicId,
                new StaffInput("JWT Staff", "099999", "5678", true));
        accountService.create(clinicId,
                new AccountInput("jwt-staff@clinic.test", "staff-password", Role.STAFF, staff.id(), true));
        TokenResponse staffTokens = authService.login(
                new LoginRequest("jwt-staff@clinic.test", "staff-password"), "127.0.0.1");

        mockMvc.perform(get("/api/clinics/{clinicId}/accounts", clinicId)
                        .header("Authorization", "Bearer " + staffTokens.accessToken()))
                .andExpect(status().isForbidden());
    }
}
