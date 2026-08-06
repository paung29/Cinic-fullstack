package com.clinic.demo;

import com.clinic.demo.controller.dto.ClinicApi.*;
import com.clinic.demo.entity.enums.*;
import com.clinic.demo.repo.*;
import com.clinic.demo.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class ArchitectureRequirementsTests {

    @Autowired AccountService accountService;
    @Autowired CatalogService catalogService;
    @Autowired InventoryService inventoryService;
    @Autowired SaleService saleService;
    @Autowired LicenseService licenseService;
    @Autowired ElevationService elevationService;
    @Autowired ClinicalRecordService clinicalRecordService;
    @Autowired ExportService exportService;
    @Autowired StaffRepository staffRepository;
    @Autowired PatientRepository patientRepository;
    @Autowired SaleRepository saleRepository;
    @Autowired StockMoveRepository stockMoveRepository;

    UUID clinicId;
    UUID staffId;
    String adminEmail;
    String adminPassword;

    @BeforeEach
    void setupClinic() {
        adminEmail = "owner@clinic.test";
        adminPassword = "safe-password";
        SetupResponse setup = accountService.setup(new SetupRequest(
                "Eden Aesthetic Clinic", "09-100", "Lashio", "Asia/Yangon",
                "Owner", "09-101", adminEmail, adminPassword, "1234"));
        clinicId = setup.clinicId();
        staffId = staffRepository.findAllByClinicIdOrderByName(clinicId).getFirst().getId();
    }

    @Test
    void completedSaleIsAtomicIdempotentAndAcceptedWhileSuspended() {
        CatalogItem product = catalogService.createProduct(clinicId,
                new CatalogInput("Serum", "SER-1", new BigDecimal("25.00"), true));
        inventoryService.adjust(clinicId, product.id(),
                new StockAdjustment(10, StockMoveReason.RECEIVE, "opening stock"));
        licenseService.set(clinicId, new LicenseInput(
                LicenseStatus.SUSPENDED, LocalDate.now().plusMonths(1), null, "manual hold"), adminEmail);

        UUID clientSaleId = UUID.randomUUID();
        SaleInput input = sale(clientSaleId, "outbox-1", staffId,
                new PatientRef(UUID.randomUUID(), "May", "09 222 333", null, "latex"),
                product.id(), new BigDecimal("50.00"));

        SaleResponse first = saleService.sync(clinicId, input);
        SaleResponse replay = saleService.sync(clinicId, input);

        assertThat(first.status()).isEqualTo(SaleStatus.COMPLETED);
        assertThat(replay.replay()).isTrue();
        assertThat(replay.id()).isEqualTo(clientSaleId);
        assertThat(saleRepository.findAllByClinicIdOrderByCreatedAtDesc(clinicId)).hasSize(1);
        assertThat(stockMoveRepository.findAllByClinicIdAndProductIdOrderByCreatedAtDesc(clinicId, product.id()))
                .filteredOn(move -> move.getReason() == StockMoveReason.SALE)
                .hasSize(1);
        assertThat(catalogService.requireProduct(clinicId, product.id()).getCurrentStock()).isEqualTo(8);
    }

    @Test
    void validationProblemIsStoredForReviewAndPatientMergesByPhone() {
        CatalogItem service = catalogService.createService(clinicId,
                new CatalogInput("Consultation", null, new BigDecimal("30.00"), true));
        PatientRef firstPatient = new PatientRef(UUID.randomUUID(), "Nang", "09-555-777", null, null);
        SaleResponse first = saleService.sync(clinicId,
                sale(UUID.randomUUID(), "outbox-a", staffId, firstPatient, service.id(), new BigDecimal("1.00")));

        PatientRef duplicatePhone = new PatientRef(UUID.randomUUID(), "Nang duplicate", "09555777", null, null);
        SaleResponse second = saleService.sync(clinicId,
                sale(UUID.randomUUID(), "outbox-b", UUID.randomUUID(), duplicatePhone,
                        service.id(), new BigDecimal("1.00")));

        assertThat(first.status()).isEqualTo(SaleStatus.NEEDS_REVIEW);
        assertThat(second.status()).isEqualTo(SaleStatus.NEEDS_REVIEW);
        assertThat(second.validationMessage()).contains("Staff record is missing");
        assertThat(second.patientId()).isEqualTo(first.patientId());
        assertThat(patientRepository.findAllByClinicIdOrderByName(clinicId)).hasSize(1);
    }

    @Test
    void clinicalDataNeedsElevationButExportWorksInPunishingLicenseState() {
        var patient = patientRepository.save(com.clinic.demo.entity.Patient.builder()
                .clinic(staffRepository.findById(staffId).orElseThrow().getClinic())
                .name("Su").phone("09999").allergies("Penicillin").build());

        ElevationResponse elevation = elevationService.elevate(clinicId, adminEmail, adminPassword);
        ClinicalRecordResponse record = clinicalRecordService.create(
                clinicId, patient.getId(), adminEmail, elevation.token(),
                new ClinicalRecordInput(staffId, "visit", "rx", "map", "consent", "media/a", "called"));
        licenseService.set(clinicId, new LicenseInput(
                LicenseStatus.RESTRICTED, LocalDate.now().plusMonths(1), null, "manual"), adminEmail);

        assertThat(record.patientId()).isEqualTo(patient.getId());
        assertThat(clinicalRecordService.list(
                clinicId, patient.getId(), adminEmail, elevation.token())).hasSize(1);
        assertThat(exportService.export(clinicId, adminPassword))
                .containsKeys("patients", "staff", "catalogue", "sales");
    }

    private SaleInput sale(UUID id, String key, UUID saleStaffId, PatientRef patient,
                           UUID catalogId, BigDecimal paid) {
        return new SaleInput(
                id, key, "S-" + key, patient, saleStaffId, null, true, LocalDateTime.now(),
                List.of(new SaleLineInput(
                        catalogId == null ? SaleLineKind.PRODUCT :
                                catalogService.list(clinicId).stream()
                                        .filter(item -> item.id().equals(catalogId))
                                        .findFirst().orElseThrow().kind(),
                        catalogId, null, null, 2)),
                List.of(new PaymentInput(PaymentMethod.CASH, paid, null, LocalDateTime.now())));
    }
}
