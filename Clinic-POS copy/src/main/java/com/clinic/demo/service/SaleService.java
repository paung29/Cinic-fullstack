package com.clinic.demo.service;

import com.clinic.demo.controller.dto.ClinicApi.*;
import com.clinic.demo.entity.*;
import com.clinic.demo.entity.enums.*;
import com.clinic.demo.exception.AppBusinessException;
import com.clinic.demo.exception.ResourceNotFoundException;
import com.clinic.demo.repo.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class SaleService {
    private final SaleRepository saleRepository;
    private final PatientRepository patientRepository;
    private final StaffRepository staffRepository;
    private final ServiceRepository serviceRepository;
    private final ProductRepository productRepository;
    private final StockMoveRepository stockMoveRepository;
    private final ClinicRepository clinicRepository;

    @Transactional(readOnly = true)
    public List<SaleResponse> list(UUID clinicId) {
        return saleRepository.findAllByClinicIdOrderByCreatedAtDesc(clinicId).stream()
                .map(s -> response(s, false)).toList();
    }

    @Transactional(readOnly = true)
    public SaleResponse get(UUID clinicId, UUID id) {
        return response(require(clinicId, id), false);
    }

    /**
     * Outbox endpoint. License state is intentionally not consulted: a completed
     * sale is always accepted. Business validation issues are stored for review
     * and still return a successful representation.
     */
    @Transactional
    public SaleResponse sync(UUID clinicId, SaleInput input) {
        Sale replay = saleRepository.findByClinicIdAndIdempotencyKey(clinicId, input.idempotencyKey())
                .orElseGet(() -> saleRepository.findByIdAndClinicId(input.id(), clinicId).orElse(null));
        if (replay != null) {
            return response(replay, true);
        }

        Clinic clinic = clinicRepository.findById(clinicId)
                .orElseThrow(() -> new ResourceNotFoundException("Clinic", "id", clinicId.toString()));
        List<String> issues = new ArrayList<>();
        Patient patient = resolvePatient(clinic, input.patient(), issues);
        Staff staff = staffRepository.findByIdAndClinicId(input.staffId(), clinicId).orElse(null);
        if (staff == null) issues.add("Staff record is missing or belongs to another clinic");

        Sale sale = Sale.builder()
                .id(input.id())
                .clinic(clinic)
                .patient(patient)
                .staff(staff)
                .saleNumber(input.saleNumber())
                .idempotencyKey(input.idempotencyKey())
                .followUpDate(input.followUpDate())
                .createdOffline(Boolean.TRUE.equals(input.createdOffline()))
                .createdAt(input.createdAt())
                .status(SaleStatus.COMPLETED)
                .build();

        BigDecimal total = BigDecimal.ZERO;
        for (SaleLineInput item : input.lines()) {
            SaleLine line = buildLine(clinic, sale, item, issues);
            total = total.add(line.getLineTotal());
            sale.addSaleLine(line);
        }
        sale.setTotal(total);

        BigDecimal paid = BigDecimal.ZERO;
        for (PaymentInput item : input.payments()) {
            BigDecimal amount = item.amount() == null ? BigDecimal.ZERO : item.amount();
            if (amount.signum() < 0) issues.add("A payment amount is negative");
            paid = paid.add(amount);
            sale.addPayment(Payment.builder()
                    .clinic(clinic).method(item.method()).amount(amount)
                    .referenceNumber(item.referenceNumber()).paidAt(item.paidAt()).build());
        }
        if (paid.compareTo(total) != 0) {
            issues.add("Payment total does not equal sale total");
        }
        if (input.createdAt() != null && input.createdAt().isBefore(LocalDateTime.now().minusDays(90))) {
            issues.add("Sale timestamp is more than 90 days old");
        }
        if (!issues.isEmpty()) {
            sale.setStatus(SaleStatus.NEEDS_REVIEW);
            sale.setValidationMessage(String.join("; ", issues));
        }

        saleRepository.saveAndFlush(sale);
        createSaleStockMoves(sale, issues);
        if (!issues.isEmpty() && sale.getStatus() != SaleStatus.NEEDS_REVIEW) {
            sale.setStatus(SaleStatus.NEEDS_REVIEW);
            sale.setValidationMessage(String.join("; ", issues));
        } else if (!issues.isEmpty()) {
            sale.setValidationMessage(String.join("; ", issues));
        }
        return response(sale, false);
    }

    @Transactional
    public SaleResponse voidSale(UUID clinicId, UUID id, String note) {
        Sale sale = require(clinicId, id);
        if (sale.getStatus() == SaleStatus.VOIDED) return response(sale, true);
        for (SaleLine line : sale.getSaleLines()) {
            if (line.getProduct() == null) continue;
            Product product = line.getProduct();
            product.setCurrentStock(product.getCurrentStock() + line.getQuantity().intValue());
            stockMoveRepository.save(StockMove.builder()
                    .clinic(sale.getClinic()).sale(sale).product(product)
                    .delta(line.getQuantity()).reason(StockMoveReason.VOID).note(note).build());
        }
        sale.setStatus(SaleStatus.VOIDED);
        return response(sale, false);
    }

    private Patient resolvePatient(Clinic clinic, PatientRef input, List<String> issues) {
        if (input == null) return null;
        if (input.id() != null) {
            Patient exact = patientRepository.findByIdAndClinicId(input.id(), clinic.getId()).orElse(null);
            if (exact != null) return exact;
        }
        String phone = PatientService.normalizePhone(input.phone());
        if (phone != null && !phone.isBlank()) {
            Patient byPhone = patientRepository.findByClinicIdAndPhone(clinic.getId(), phone).orElse(null);
            if (byPhone != null) return byPhone;
        }
        if (input.name() == null || input.name().isBlank() || phone == null || phone.isBlank()) {
            issues.add("Patient could not be reconciled");
            return null;
        }
        return patientRepository.save(Patient.builder()
                .id(input.id()).clinic(clinic).name(input.name().trim()).phone(phone)
                .allergies(input.allergies()).alertNote(input.alertNote()).build());
    }

    private SaleLine buildLine(Clinic clinic, Sale sale, SaleLineInput input, List<String> issues) {
        String name = input.nameSnapshot();
        BigDecimal price = input.unitPrice();
        com.clinic.demo.entity.Service service = null;
        Product product = null;
        if (input.kind() == SaleLineKind.SERVICE && input.catalogId() != null) {
            service = serviceRepository.findByIdAndClinicId(input.catalogId(), clinic.getId()).orElse(null);
            if (service != null) {
                name = service.getName();
                price = service.getPrice();
                if (!Boolean.TRUE.equals(service.getActive())) issues.add("Inactive service was sold: " + name);
            }
        } else if (input.kind() == SaleLineKind.PRODUCT && input.catalogId() != null) {
            product = productRepository.findByIdAndClinicId(input.catalogId(), clinic.getId()).orElse(null);
            if (product != null) {
                name = product.getName();
                price = product.getPrice();
                if (!Boolean.TRUE.equals(product.getActive())) issues.add("Inactive product was sold: " + name);
            }
        }
        if (input.catalogId() != null && service == null && product == null) {
            issues.add("Catalog item is missing: " + input.catalogId());
        }
        if (name == null || name.isBlank()) {
            name = "Unknown item";
            issues.add("A sale line has no item name");
        }
        if (price == null) {
            price = BigDecimal.ZERO;
            issues.add("A sale line has no price");
        }
        int quantity = input.quantity() == null || input.quantity() < 1 ? 1 : input.quantity();
        if (input.quantity() == null || input.quantity() < 1) issues.add("A sale line has an invalid quantity");
        BigDecimal lineTotal = price.multiply(BigDecimal.valueOf(quantity));
        return SaleLine.builder().clinic(clinic).sale(sale).kind(input.kind())
                .service(service).product(product).nameSnapshot(name).unitPrice(price)
                .quantity(BigDecimal.valueOf(quantity)).lineTotal(lineTotal).build();
    }

    private void createSaleStockMoves(Sale sale, List<String> issues) {
        for (SaleLine line : sale.getSaleLines()) {
            Product product = line.getProduct();
            if (product == null) continue;
            if (BigDecimal.valueOf(product.getCurrentStock()).compareTo(line.getQuantity()) < 0) {
                issues.add("Insufficient stock for " + product.getName());
            }
            product.setCurrentStock(product.getCurrentStock() - line.getQuantity().intValue());
            stockMoveRepository.save(StockMove.builder()
                    .clinic(sale.getClinic()).sale(sale).product(product)
                    .delta(line.getQuantity().negate()).reason(StockMoveReason.SALE)
                    .note("Sale " + sale.getSaleNumber()).build());
        }
    }

    private Sale require(UUID clinicId, UUID id) {
        return saleRepository.findByIdAndClinicId(id, clinicId)
                .orElseThrow(() -> new ResourceNotFoundException("Sale", "id", id.toString()));
    }

    public SaleResponse response(Sale sale, boolean replay) {
        List<SaleLineResponse> lines = sale.getSaleLines().stream().map(line ->
                new SaleLineResponse(line.getId(), line.getKind(),
                        line.getService() != null ? line.getService().getId() :
                                line.getProduct() != null ? line.getProduct().getId() : null,
                        line.getNameSnapshot(), line.getUnitPrice(), line.getQuantity().intValue(), line.getLineTotal())
        ).toList();
        List<PaymentResponse> payments = sale.getPayments().stream().map(payment ->
                new PaymentResponse(payment.getId(), payment.getMethod(), payment.getAmount(),
                        payment.getReferenceNumber(), payment.getPaidAt())).toList();
        return new SaleResponse(sale.getId(), sale.getIdempotencyKey(), sale.getSaleNumber(),
                sale.getPatient() == null ? null : sale.getPatient().getId(),
                sale.getStaff() == null ? null : sale.getStaff().getId(),
                sale.getFollowUpDate(), sale.getTotal(), sale.getStatus(), sale.getValidationMessage(),
                Boolean.TRUE.equals(sale.getCreatedOffline()), sale.getCreatedAt(), lines, payments, replay);
    }
}
