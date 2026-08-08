package com.clinic.demo;

import com.clinic.demo.controller.dto.ClinicApi.*;
import com.clinic.demo.controller.dto.EdenApi;
import com.clinic.demo.entity.Account;
import com.clinic.demo.repo.AccountRepository;
import com.clinic.demo.service.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class EdenFrontendContractTests {
    @Autowired MockMvc mvc;
    @Autowired AccountService accountService;
    @Autowired AccountRepository accounts;
    @Autowired EdenApiService api;
    @Autowired CatalogService catalog;

    @Test
    void pinLoginAndBootstrapUseFrontendRoutesAndSnakeCaseContract() throws Exception {
        accountService.setup(new SetupRequest("Eden", "09123", "Yangon", "Asia/Yangon",
                "Owner", "09456", "owner@eden.test", "safe-password", "1234"));
        Account account = accounts.findByEmail("owner@eden.test").orElseThrow();
        var login = api.login(new EdenApi.LoginRequest(account.getStaff().getId(), "1234"), "127.0.0.1");

        mvc.perform(post("/auth/login").contentType("application/json")
                        .content("{\"staff_id\":\"" + account.getStaff().getId() + "\",\"pin\":\"1234\"}"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("\"server_time\"")))
                .andExpect(content().string(containsString("\"rounding_step\"")))
                .andExpect(content().string(containsString("\"token\"")));

        mvc.perform(get("/bootstrap").header("Authorization", "Bearer " + login.token()))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("\"recent_sales\"")))
                .andExpect(content().string(containsString("\"appointments\"")))
                .andExpect(content().string(containsString("\"cursor\"")));
    }

    @Test
    void malformedFrontendRequestUsesStableErrorShape() throws Exception {
        mvc.perform(post("/auth/login").contentType("application/json").content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().string(containsString("\"status\":400")))
                .andExpect(content().string(containsString("\"code\":\"MALFORMED\"")))
                .andExpect(content().string(containsString("\"message\"")));
    }

    @Test
    void offlineWritesAreIdempotentAndAppearInDelta() {
        var setup = accountService.setup(new SetupRequest("Sync Eden", "09123", "Yangon", "Asia/Yangon",
                "Owner", "09456", "sync@eden.test", "safe-password", "1234"));
        Account account = accounts.findByEmail("sync@eden.test").orElseThrow();
        var service = catalog.createService(setup.clinicId(), new CatalogInput("Consultation", null, BigDecimal.valueOf(10_000), true));
        UUID patientId = UUID.randomUUID(), productId = UUID.randomUUID(), appointmentId = UUID.randomUUID(), saleId = UUID.randomUUID();

        api.createPatient(account, new EdenApi.PatientDto(patientId, null, "Mya", "09 777", null, null, null, false, null));
        api.createProduct(account, new EdenApi.ProductInput(productId, "Cream", "Skin", null, 0, "8851",
                3_000L, 5_000L, BigDecimal.TEN, BigDecimal.ONE, BigDecimal.valueOf(3), "retail", "each",
                false, false, null, null, true));
        var appointment = new EdenApi.AppointmentDto(appointmentId, LocalDate.now(), "10:30",
                account.getStaff().getId(), patientId, service.id(), "booked");
        assertThat(api.createAppointment(account, appointment).replayed()).isFalse();
        assertThat(api.createAppointment(account, appointment).replayed()).isTrue();

        var line = new EdenApi.SaleLineDto(UUID.randomUUID(), "product", productId, "Cream", BigDecimal.ONE,
                5_000L, 5_000L, null, null, null, null);
        var payment = new EdenApi.PaymentDto(UUID.randomUUID(), "cash", 5_000L, OffsetDateTime.now(ZoneOffset.UTC));
        var sale = new EdenApi.SaleDto(saleId, patientId, account.getStaff().getId(), null, appointmentId,
                OffsetDateTime.now(ZoneOffset.UTC), List.of(line), List.of(payment), 5_000L, null, null,
                5_000L, 0L, null, null, "test-device", true, null, null, null, null, null);
        assertThat(api.createSale(account, sale).replayed()).isFalse();
        assertThat(api.createSale(account, sale).replayed()).isTrue();
        assertThat(api.delta(account, 0).changes()).extracting(EdenApi.DeltaChange::entity)
                .contains("patient", "product", "appointment", "sale");
    }

    @Test
    void logoutAndClinicalRecordsCompleteTheFrontendSecurityContract() throws Exception {
        accountService.setup(new SetupRequest("Clinical Eden", "09123", "Yangon", "Asia/Yangon",
                "Owner", "09456", "clinical@eden.test", "safe-password", "1234"));
        Account account = accounts.findByEmail("clinical@eden.test").orElseThrow();
        var login = api.login(new EdenApi.LoginRequest(account.getStaff().getId(), "1234"), "127.0.0.1");
        UUID patientId = UUID.randomUUID();
        api.createPatient(account, new EdenApi.PatientDto(patientId, null, "Mya", "09 888", null, null, null, false, null));
        var elevation = api.elevate(account, new EdenApi.ElevationRequest("safe-password", "clinical"));

        mvc.perform(post("/patients/{id}/clinical-records", patientId)
                        .header("Authorization", "Bearer " + login.token())
                        .header("X-Elevation", elevation.elevationToken())
                        .contentType("application/json")
                        .content("{\"staff_id\":\"" + account.getStaff().getId() + "\",\"visit_notes\":\"Consulted\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.visit_notes").value("Consulted"));

        mvc.perform(get("/patients/{id}/clinical-records", patientId)
                        .header("Authorization", "Bearer " + login.token())
                        .header("X-Elevation", elevation.elevationToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].visit_notes").value("Consulted"));

        mvc.perform(post("/auth/logout").contentType("application/json")
                        .content("{\"refresh\":\"" + login.refresh() + "\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/auth/refresh").contentType("application/json")
                        .content("{\"refresh\":\"" + login.refresh() + "\"}"))
                .andExpect(status().isUnauthorized());
    }
}
