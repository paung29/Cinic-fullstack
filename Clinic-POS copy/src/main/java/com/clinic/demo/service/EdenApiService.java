package com.clinic.demo.service;

import com.clinic.demo.controller.dto.ClinicApi.TokenResponse;
import com.clinic.demo.controller.dto.EdenApi.*;
import com.clinic.demo.entity.*;
import com.clinic.demo.entity.enums.*;
import com.clinic.demo.exception.*;
import com.clinic.demo.repo.*;
import com.clinic.demo.security.JwtService;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
@RequiredArgsConstructor
public class EdenApiService {
    private final StaffRepository staff;
    private final AccountRepository accounts;
    private final ServiceRepository services;
    /**
     * Generous next to the 640px JPEG the device actually sends, but it stops
     * a broken or hostile client parking arbitrary payloads in the clinic's
     * database through an endpoint any signed-in staff member can reach.
     */
    private static final int MAX_PHOTO_BYTES = 2_000_000;

    private final ProductRepository products;
    private final ProductPhotoRepository productPhotos;
    private final PatientRepository patients;
    private final SaleRepository sales;
    private final PaymentRepository payments;
    private final StockMoveRepository stockMoves;
    private final AppointmentRepository appointments;
    private final ContactRepository contacts;
    private final SyncEventRepository events;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final ElevationService elevationService;
    private final ObjectMapper objectMapper;
    private final BarcodeLookupService barcodeLookupService;
    private final LicenseService licenseService;

    @Transactional
    public LoginResponse login(LoginRequest input, String clientIp) {
        Staff member = staff.findById(input.staffId())
                .orElseThrow(() -> new TokenInvalidException("Staff ID or PIN is incorrect."));
        if (!Boolean.TRUE.equals(member.getActive()) || !passwordEncoder.matches(input.pin(), member.getPinHash())) {
            throw new TokenInvalidException("Staff ID or PIN is incorrect.");
        }
        Account account = accounts.findByStaffId(member.getId())
                .filter(a -> Boolean.TRUE.equals(a.getActive()))
                .orElseThrow(() -> new TokenInvalidException("This staff member has no active login account."));
        TokenResponse pair = jwtService.issueTokens(account, clientIp);
        return new LoginResponse(pair.accessToken(), pair.refreshToken(), staffDto(member), clinicDto(member.getClinic()), now());
    }

    /**
     * Pair a device from the owner's email and password rather than a staff
     * UUID nobody can be expected to type. The PIN is still verified against
     * the staff record, so the device ends up holding a PIN the server agrees
     * with and offline unlock keeps working afterwards.
     *
     * Every failure returns the same message on purpose. Telling a caller that
     * the email was right but the password wrong turns this into an account
     * enumeration oracle on an endpoint that must stay unauthenticated.
     */
    @Transactional
    public LoginResponse loginWithEmail(EmailLoginRequest input, String clientIp) {
        String email = input.email().trim().toLowerCase();
        Account account = accounts.findByEmail(email)
                .filter(candidate -> Boolean.TRUE.equals(candidate.getActive()))
                .orElseThrow(() -> new TokenInvalidException("Email, password or PIN is incorrect."));
        if (!passwordEncoder.matches(input.password(), account.getPasswordHash())) {
            throw new TokenInvalidException("Email, password or PIN is incorrect.");
        }
        Staff member = account.getStaff();
        if (member == null || !Boolean.TRUE.equals(member.getActive())
                || !passwordEncoder.matches(input.pin(), member.getPinHash())) {
            throw new TokenInvalidException("Email, password or PIN is incorrect.");
        }
        TokenResponse pair = jwtService.issueTokens(account, clientIp);
        return new LoginResponse(pair.accessToken(), pair.refreshToken(), staffDto(member), clinicDto(member.getClinic()), now());
    }

    public TokenPair refresh(String refresh, String clientIp) {
        TokenResponse pair = jwtService.rotateRefreshToken(refresh, clientIp);
        return new TokenPair(pair.accessToken(), pair.refreshToken());
    }

    public void logout(String refresh) {
        jwtService.revokeRefreshToken(refresh);
    }

    @Transactional
    public ElevationResponse elevate(Account account, ElevationRequest input) {
        var result = elevationService.elevate(account.getClinic().getId(), account.getEmail(), input.password());
        return new ElevationResponse(result.token(), utc(result.expiresAt()));
    }

    @Transactional(readOnly = true)
    public Bootstrap bootstrap(Account account) {
        UUID clinicId = account.getClinic().getId();
        return new Bootstrap(clinicDto(account.getClinic()),
                staff.findAllByClinicIdOrderByName(clinicId).stream().map(this::staffDto).toList(),
                services.findAllByClinicIdOrderByName(clinicId).stream().map(this::serviceDto).toList(),
                products.findAllByClinicIdOrderByName(clinicId).stream().map(this::productDto).toList(),
                patients.findAllByClinicIdOrderByName(clinicId).stream().map(this::patientDto).toList(),
                appointments.findAllByClinicIdOrderByDateAscTimeAsc(clinicId).stream().map(this::appointmentDto).toList(),
                sales.findAllByClinicIdOrderByCreatedAtDesc(clinicId).stream().limit(100).map(this::saleDto).toList(),
                now(), events.cursor(clinicId));
    }

    @Transactional(readOnly = true)
    public Delta delta(Account account, long since) {
        UUID clinicId = account.getClinic().getId();
        List<SyncEvent> found = events.findAllByClinicIdAndIdGreaterThanOrderByIdAsc(clinicId, since);
        List<DeltaChange> changes = found.stream().map(event -> new DeltaChange(event.getEntity(), event.getOp(), readMap(event.getRowJson()))).toList();
        long cursor = found.isEmpty() ? Math.max(since, events.cursor(clinicId)) : found.get(found.size() - 1).getId();
        return new Delta(changes, cursor, now());
    }

    @Transactional
    public ClinicDto patchClinic(Account account, ClinicPatch input, UUID elevationToken) {
        requireElevation(account, elevationToken);
        Clinic c = account.getClinic();
        if (input.name() != null) c.setName(input.name().trim());
        if (input.phone() != null) c.setPhone(input.phone());
        if (input.address() != null) c.setAddress(input.address());
        if (input.receiptFooter() != null) c.setReceiptFooter(input.receiptFooter());
        if (input.logoUrl() != null) c.setLogoUrl(input.logoUrl());
        if (input.roundingStep() != null) c.setRoundingStep(input.roundingStep());
        if (input.creditLimitMmk() != null) c.setCreditLimitMmk(input.creditLimitMmk());
        if (input.consentMode() != null) c.setConsentMode(input.consentMode());
        if (input.receiptQr() != null) c.setReceiptQr(input.receiptQr());
        if (input.receiptNextVisit() != null) c.setReceiptNextVisit(input.receiptNextVisit());
        if (input.receiptTemplate() != null) c.setReceiptTemplate(input.receiptTemplate());
        if (input.telegramHandle() != null) c.setTelegramHandle(input.telegramHandle());
        if (input.receiptHeader() != null) c.setReceiptHeader(input.receiptHeader());
        if (input.receiptHeaderFont() != null) c.setReceiptHeaderFont(input.receiptHeaderFont());
        if (input.receiptDivider() != null) c.setReceiptDivider(input.receiptDivider());
        ClinicDto result = clinicDto(c);
        emit(c, "clinic", result);
        return result;
    }

    @Transactional
    public PatientEnvelope createPatient(Account account, PatientDto input) {
        UUID clinicId = account.getClinic().getId();
        Patient replay = patients.findByIdAndClinicId(input.id(), clinicId).orElse(null);
        if (replay != null) return new PatientEnvelope(patientDto(replay), null, true);
        String phone = PatientService.normalizePhone(input.phone());
        Patient matched = patients.findByClinicIdAndPhone(clinicId, phone).orElse(null);
        if (matched != null) return new PatientEnvelope(patientDto(matched), matched.getId().toString(), false);
        Patient p = patients.save(Patient.builder().id(input.id()).clinic(account.getClinic())
                .code(input.code()).name(input.name().trim()).phone(phone).sex(input.sex())
                .allergies(input.allergies()).alertNote(input.alertNote()).telegramLinked(input.telegramLinked())
                .followupDate(input.followupDate()).build());
        PatientDto result = patientDto(p);
        emit(account.getClinic(), "patient", result);
        return new PatientEnvelope(result, null, false);
    }

    @Transactional
    public PatientDto patchPatient(Account account, UUID id, PatientDto input) {
        Patient p = requirePatient(account, id);
        String phone = PatientService.normalizePhone(input.phone());
        patients.findByClinicIdAndPhone(account.getClinic().getId(), phone).filter(other -> !other.getId().equals(id))
                .ifPresent(other -> { throw new AppBusinessException("phone already belongs to patient " + other.getId()); });
        p.setCode(input.code()); p.setName(input.name().trim()); p.setPhone(phone); p.setSex(input.sex());
        p.setAllergies(input.allergies()); p.setAlertNote(input.alertNote()); p.setTelegramLinked(input.telegramLinked());
        p.setFollowupDate(input.followupDate());
        PatientDto result = patientDto(p); emit(account.getClinic(), "patient", result); return result;
    }

    @Transactional
    public ProductEnvelope createProduct(Account account, ProductInput input) {
        UUID clinicId = account.getClinic().getId();
        Product replay = products.findByIdAndClinicId(input.id(), clinicId).orElse(null);
        if (replay != null) return new ProductEnvelope(productDto(replay), null, true);
        if (input.barcode() != null && !input.barcode().isBlank()) {
            Product matched = products.findByClinicIdAndBarcode(clinicId, input.barcode()).orElse(null);
            if (matched != null) return new ProductEnvelope(productDto(matched), matched.getId().toString(), false);
        }
        Product p = products.save(Product.builder().id(input.id()).clinic(account.getClinic()).name(input.name().trim())
                .category(input.category()).subcategory(input.subcategory()).sortOrder(or(input.sortOrder(), 0))
                .barcode(input.barcode()).sku(input.barcode()).cost(money(input.cost())).price(money(input.price()))
                .currentStock(or(input.stockQty(), BigDecimal.ZERO).intValue()).stockQty(or(input.stockQty(), BigDecimal.ZERO))
                .lowStockAt(or(input.lowStockAt(), BigDecimal.ZERO))
                .reorderAt(or(input.reorderAt(), BigDecimal.ZERO)).stockType(input.stockType()).soldBy(input.soldBy())
                .requiresLot(Boolean.TRUE.equals(input.requiresLot())).requiresConsent(Boolean.TRUE.equals(input.requiresConsent()))
                .unitLabel(input.unitLabel()).photoKey(input.photoKey()).active(input.active() == null || input.active()).build());
        ProductDto result = productDto(p);
        emit(account.getClinic(), "product", result);
        return new ProductEnvelope(result, null, false);
    }

    @Transactional
    public ServiceEnvelope createService(Account account, ServiceInput input, UUID elevationToken) {
        requireElevation(account, elevationToken);
        UUID clinicId = account.getClinic().getId();
        com.clinic.demo.entity.Service replay = services.findByIdAndClinicId(input.id(), clinicId).orElse(null);
        if (replay != null) return new ServiceEnvelope(serviceDto(replay), true);
        com.clinic.demo.entity.Service s = services.save(com.clinic.demo.entity.Service.builder()
                .id(input.id()).clinic(account.getClinic())
                .name(input.nameMm().trim())
                .nameEn(input.nameEn() == null || input.nameEn().isBlank() ? null : input.nameEn().trim())
                .category(or(input.category(), "Other"))
                .price(money(input.price()))
                .durationMin(input.durationMin())
                .requiresLot(Boolean.TRUE.equals(input.requiresLot()))
                .defaultFollowupDays(input.defaultFollowupDays())
                .active(input.active() == null || input.active())
                .build());
        ServiceDto dto = serviceDto(s);
        emit(account.getClinic(), "service", dto);
        return new ServiceEnvelope(dto, false);
    }

    @Transactional
    public ServiceDto patchService(Account account, UUID id, ServicePatch input, UUID elevationToken) {
        requireElevation(account, elevationToken);
        com.clinic.demo.entity.Service s = requireService(account, id);
        if (input.nameMm() != null) s.setName(input.nameMm().trim());
        if (input.nameEn() != null) s.setNameEn(input.nameEn().isBlank() ? null : input.nameEn().trim());
        if (input.category() != null) s.setCategory(input.category());
        if (input.price() != null) s.setPrice(money(input.price()));
        if (input.durationMin() != null) s.setDurationMin(input.durationMin());
        if (input.requiresLot() != null) s.setRequiresLot(input.requiresLot());
        if (input.defaultFollowupDays() != null) s.setDefaultFollowupDays(input.defaultFollowupDays());
        if (input.active() != null) s.setActive(input.active());
        services.save(s);
        ServiceDto dto = serviceDto(s);
        emit(account.getClinic(), "service", dto);
        return dto;
    }

    @Transactional
    public ProductDto patchProduct(Account account, UUID id, ProductPatch input, UUID elevationToken) {
        requireElevation(account, elevationToken);
        Product p = requireProduct(account, id);
        if (input.barcode() != null) {
            products.findByClinicIdAndBarcode(account.getClinic().getId(), input.barcode())
                    .filter(other -> !other.getId().equals(id))
                    .ifPresent(other -> { throw new AppBusinessException("barcode already belongs to product " + other.getId()); });
            p.setBarcode(input.barcode()); p.setSku(input.barcode());
        }
        if (input.name() != null) p.setName(input.name().trim());
        if (input.category() != null) p.setCategory(input.category());
        if (input.subcategory() != null) p.setSubcategory(input.subcategory());
        if (input.sortOrder() != null) p.setSortOrder(input.sortOrder());
        if (input.cost() != null) p.setCost(money(input.cost()));
        if (input.price() != null) p.setPrice(money(input.price()));
        if (input.lowStockAt() != null) p.setLowStockAt(input.lowStockAt());
        if (input.reorderAt() != null) p.setReorderAt(input.reorderAt());
        if (input.stockType() != null) p.setStockType(input.stockType());
        if (input.soldBy() != null) p.setSoldBy(input.soldBy());
        if (input.requiresLot() != null) p.setRequiresLot(input.requiresLot());
        if (input.requiresConsent() != null) p.setRequiresConsent(input.requiresConsent());
        if (input.unitLabel() != null) p.setUnitLabel(input.unitLabel());
        if (input.photoKey() != null) p.setPhotoKey(input.photoKey());
        if (input.active() != null) p.setActive(input.active());
        ProductDto result = productDto(p);
        emit(account.getClinic(), "product", result);
        return result;
    }

    /**
     * Replace a product's shelf photo. Storing it bumps Product.photoKey, and
     * that change rides the normal product sync event, so other devices learn
     * a new photo exists without polling for one.
     */
    @Transactional
    public ProductDto putProductPhoto(Account account, UUID productId, ProductPhotoInput input) {
        Product product = requireProduct(account, productId);
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(input.data());
        } catch (IllegalArgumentException error) {
            throw new AppBusinessException("The photo payload is not valid base64.");
        }
        if (bytes.length == 0 || bytes.length > MAX_PHOTO_BYTES) {
            throw new AppBusinessException("A product photo must be between 1 byte and 2 MB.");
        }
        String key = fingerprint(bytes);
        productPhotos.save(ProductPhoto.builder()
                .productId(product.getId())
                .clinicId(account.getClinic().getId())
                .contentType(input.contentType())
                .photoKey(key)
                .bytes(bytes)
                .updatedAt(now())
                .build());
        product.setPhotoKey(key);
        ProductDto result = productDto(product);
        emit(account.getClinic(), "product", result);
        return result;
    }

    @Transactional(readOnly = true)
    public ProductPhotoResponse productPhoto(Account account, UUID productId) {
        requireProduct(account, productId);
        ProductPhoto photo = productPhotos.findById(productId)
                .filter(row -> row.getClinicId().equals(account.getClinic().getId()))
                .orElseThrow(() -> new ResourceNotFoundException("Product photo", "productId", productId.toString()));
        return new ProductPhotoResponse(productId, photo.getPhotoKey(), photo.getContentType(),
                Base64.getEncoder().encodeToString(photo.getBytes()));
    }

    @Transactional
    public ProductDto deleteProductPhoto(Account account, UUID productId) {
        Product product = requireProduct(account, productId);
        productPhotos.findById(productId)
                .filter(row -> row.getClinicId().equals(account.getClinic().getId()))
                .ifPresent(productPhotos::delete);
        product.setPhotoKey(null);
        ProductDto result = productDto(product);
        emit(account.getClinic(), "product", result);
        return result;
    }

    /**
     * Half a SHA-256 over the bytes. Long enough that two different photos will
     * not collide in any clinic's catalogue, short enough to sit on every
     * product row that goes over the wire.
     */
    private static String fingerprint(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder hex = new StringBuilder(32);
            for (int index = 0; index < 16; index += 1) {
                hex.append(String.format("%02x", digest[index]));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 is unavailable in this runtime.", error);
        }
    }

    @Transactional
    public ProductEnvelope receive(Account account, StockReceive input) {
        StockMove replay = stockMoves.findById(input.id()).orElse(null);
        if (replay != null) {
            if (!replay.getClinic().getId().equals(account.getClinic().getId())) throw new AccessDeniedException("Stock move belongs to another clinic.");
            return new ProductEnvelope(productDto(replay.getProduct()), null, true);
        }
        Product p = requireProduct(account, input.productId());
        p.setStockQty(stock(p).add(input.qty()));
        p.setCurrentStock(p.getStockQty().intValue());
        if (input.cost() != null) p.setCost(money(input.cost()));
        stockMoves.save(StockMove.builder().id(input.id()).clinic(account.getClinic()).product(p).delta(input.qty())
                .reason(StockMoveReason.RECEIVE).lotNo(input.lotNo()).lotExpiry(input.lotExpiry()).build());
        ProductDto result = productDto(p);
        emit(account.getClinic(), "product", result);
        return new ProductEnvelope(result, null, false);
    }

    @Transactional
    public ProductDto adjust(Account account, StockAdjust input, UUID elevationToken) {
        requireElevation(account, elevationToken);
        Product p = requireProduct(account, input.productId());
        p.setStockQty(stock(p).add(input.delta()));
        p.setCurrentStock(p.getStockQty().intValue());
        stockMoves.save(StockMove.builder().clinic(account.getClinic()).product(p).delta(input.delta())
                .reason(StockMoveReason.ADJUST).note(input.reason()).build());
        ProductDto result = productDto(p);
        emit(account.getClinic(), "product", result);
        return result;
    }

    @Transactional
    public AppointmentEnvelope createAppointment(Account account, AppointmentDto input) {
        UUID clinicId = account.getClinic().getId();
        Appointment replay = appointments.findByIdAndClinicId(input.id(), clinicId).orElse(null);
        if (replay != null) return new AppointmentEnvelope(appointmentDto(replay), replay.getConflict(), true);
        boolean conflict = appointments.existsByClinicIdAndStaffIdAndDateAndTimeAndStatusNot(
                clinicId, input.staffId(), input.date(), LocalTime.parse(input.time()), "cancelled");
        Appointment a = appointments.save(Appointment.builder().id(input.id()).clinic(account.getClinic())
                .staff(requireStaff(account, input.staffId())).patient(requirePatient(account, input.patientId()))
                .service(requireService(account, input.serviceId())).date(input.date()).time(LocalTime.parse(input.time()))
                .status(input.status() == null ? "booked" : input.status()).conflict(conflict).build());
        AppointmentDto result = appointmentDto(a);
        emit(account.getClinic(), "appointment", result);
        return new AppointmentEnvelope(result, conflict, false);
    }

    @Transactional
    public AppointmentDto patchAppointment(Account account, UUID id, AppointmentPatch input) {
        Appointment a = appointments.findByIdAndClinicId(id, account.getClinic().getId())
                .orElseThrow(() -> new ResourceNotFoundException("Appointment", "id", id.toString()));
        a.setStatus(input.status());
        AppointmentDto result = appointmentDto(a);
        emit(account.getClinic(), "appointment", result);
        return result;
    }

    @Transactional
    public ContactEnvelope createContact(Account account, ContactDto input) {
        UUID clinicId = account.getClinic().getId();
        Contact replay = contacts.findByIdAndClinicId(input.id(), clinicId).orElse(null);
        if (replay != null) return new ContactEnvelope(contactDto(replay), true);
        Sale sale = input.saleId() == null ? null : sales.findByIdAndClinicId(input.saleId(), clinicId)
                .orElseThrow(() -> new ResourceNotFoundException("Sale", "id", input.saleId().toString()));
        Contact c = contacts.save(Contact.builder().id(input.id()).clinic(account.getClinic())
                .patient(requirePatient(account, input.patientId())).sale(sale).at(input.at()).channel(input.channel())
                .direction(input.direction()).outcome(input.outcome()).note(input.note())
                .automated(Boolean.TRUE.equals(input.automated())).build());
        ContactDto result = contactDto(c);
        emit(account.getClinic(), "contact", result);
        return new ContactEnvelope(result, false);
    }

    @Transactional
    public SaleEnvelope createSale(Account account, SaleDto input) {
        UUID clinicId = account.getClinic().getId();
        Sale replay = sales.findByIdAndClinicId(input.id(), clinicId).orElse(null);
        if (replay != null) return new SaleEnvelope(saleDto(replay), true);
        List<String> issues = new ArrayList<>();
        Staff member = staff.findByIdAndClinicId(input.staffId(), clinicId).orElse(null);
        if (member == null) issues.add("staff record is missing");
        Patient patient = input.patientId() == null ? null : patients.findByIdAndClinicId(input.patientId(), clinicId).orElse(null);
        if (input.patientId() != null && patient == null) issues.add("patient record is missing");
        // Receipt numbers are a per-clinic sequence — a global count would leak
        // volume across tenants and drift after another clinic trades.
        String saleNo = "R-" + String.format("%06d", sales.countByClinicId(clinicId) + 1);
        Sale sale = Sale.builder().id(input.id()).clinic(account.getClinic()).patient(patient).staff(member)
                .saleNumber(saleNo).idempotencyKey(input.id().toString()).followUpDate(input.followupDate())
                .createdOffline(Boolean.TRUE.equals(input.createdOffline())).createdAt(local(input.at()))
                .receivedAt(now()).staffIdSnapshot(input.staffId()).practitionerId(input.practitionerId()).appointmentId(input.appointmentId())
                .subtotal(money(input.subtotal())).discountPct(input.discountPct()).discountApprovedBy(input.discountApprovedBy())
                .total(money(input.total())).credit(money(input.credit())).creditApprovedBy(input.creditApprovedBy())
                .deviceId(input.deviceId()).status(SaleStatus.COMPLETED).build();
        sale = sales.save(sale);
        BigDecimal calculated = BigDecimal.ZERO;
        for (SaleLineDto item : input.lines()) {
            com.clinic.demo.entity.Service service = null; Product product = null;
            if ("product".equals(item.kind())) product = products.findByIdAndClinicId(item.itemId(), clinicId).orElse(null);
            else service = services.findByIdAndClinicId(item.itemId(), clinicId).orElse(null);
            if (product == null && service == null) issues.add("catalog item " + item.itemId() + " is missing");
            BigDecimal expected = money(item.unitPrice()).multiply(item.qty());
            if (expected.compareTo(money(item.lineTotal())) != 0) issues.add("line total mismatch for " + item.id());
            SaleLine line = SaleLine.builder().id(item.id()).clinic(account.getClinic()).sale(sale)
                    .kind("product".equals(item.kind()) ? SaleLineKind.PRODUCT : SaleLineKind.SERVICE).itemIdSnapshot(item.itemId())
                    .product(product).service(service).nameSnapshot(item.nameSnapshot()).quantity(item.qty())
                    .unitPrice(money(item.unitPrice())).lineTotal(money(item.lineTotal())).discountPct(item.discountPct())
                    .note(item.note()).lotNo(item.lotNo()).lotExpiry(item.lotExpiry()).build();
            sale.addSaleLine(line); calculated = calculated.add(money(item.lineTotal()));
            if (product != null) {
                if (Boolean.TRUE.equals(product.getRequiresLot()) && (item.lotNo() == null || item.lotNo().isBlank())) issues.add("lot missing for " + product.getName());
                product.setStockQty(stock(product).subtract(item.qty()));
                product.setCurrentStock(product.getStockQty().intValue());
                stockMoves.save(StockMove.builder().clinic(account.getClinic()).sale(sale).product(product)
                        .delta(item.qty().negate()).reason(StockMoveReason.SALE).lotNo(item.lotNo()).lotExpiry(item.lotExpiry()).build());
            }
        }
        if (calculated.compareTo(money(input.total())) != 0) issues.add("sale total does not equal line totals");
        if (input.at().isBefore(now().minusDays(90)) || input.at().isAfter(now().plusHours(1))) issues.add("sale timestamp is outside the accepted clock window");
        for (PaymentDto item : or(input.payments(), List.<PaymentDto>of())) sale.addPayment(paymentEntity(account.getClinic(), sale, item));
        if (patient != null && input.followupDate() != null) {
            patient.setFollowupDate(input.followupDate());
            emit(account.getClinic(), "patient", patientDto(patient));
        }
        if (!issues.isEmpty()) { sale.setStatus(SaleStatus.NEEDS_REVIEW); sale.setValidationMessage(String.join("; ", issues)); }
        sales.flush();
        SaleDto result = saleDto(sale);
        emit(account.getClinic(), "sale", result);
        return new SaleEnvelope(result, false);
    }

    @Transactional
    public SaleEnvelope voidSale(Account account, UUID id, UUID elevationToken, String reason) {
        requireElevation(account, elevationToken);
        Sale sale = sales.findByIdAndClinicId(id, account.getClinic().getId())
                .orElseThrow(() -> new ResourceNotFoundException("Sale", "id", id.toString()));
        if (sale.getStatus() == SaleStatus.VOIDED) return new SaleEnvelope(saleDto(sale), true);
        for (SaleLine line : sale.getSaleLines()) if (line.getProduct() != null) {
            Product p = line.getProduct(); p.setStockQty(stock(p).add(line.getQuantity())); p.setCurrentStock(p.getStockQty().intValue());
            stockMoves.save(StockMove.builder().clinic(account.getClinic()).sale(sale).product(p)
                    .delta(line.getQuantity()).reason(StockMoveReason.VOID).build());
            emit(account.getClinic(), "product", productDto(p));
        }
        sale.setStatus(SaleStatus.VOIDED);
        sale.setVoidReason(reason == null || reason.isBlank() ? "No reason supplied" : reason.trim());
        SaleDto result = saleDto(sale); emit(account.getClinic(), "sale", result);
        return new SaleEnvelope(result, false);
    }

    @Transactional(readOnly = true)
    public List<Map<String,Object>> followups(Account account, LocalDate from, LocalDate to) {
        LocalDate start = from == null ? LocalDate.now() : from, end = to == null ? start.plusDays(30) : to;
        return patients.findAllByClinicIdOrderByName(account.getClinic().getId()).stream()
                .filter(p -> p.getFollowupDate() != null && !p.getFollowupDate().isBefore(start) && !p.getFollowupDate().isAfter(end))
                .map(p -> { Map<String,Object> row = new LinkedHashMap<>(); row.put("patient_id", p.getId()); row.put("date", p.getFollowupDate()); row.put("service", ""); return row; }).toList();
    }

    @Transactional(readOnly = true)
    public Map<String,Object> dailyReport(Account account, LocalDate date, UUID elevationToken) {
        requireElevation(account, elevationToken);
        // Sale timestamps are stored in UTC; the clinic's report day runs on its
        // own wall clock (Asia/Yangon is UTC+6:30 — a UTC day boundary would put
        // every early-morning sale on yesterday's report).
        ZoneId clinicZone = clinicZone(account.getClinic());
        List<Sale> day = sales.findAllByClinicIdOrderByCreatedAtDesc(account.getClinic().getId()).stream()
                .filter(s -> s.getCreatedAt().atOffset(ZoneOffset.UTC).atZoneSameInstant(clinicZone).toLocalDate().equals(date)
                        && s.getStatus() != SaleStatus.VOIDED).toList();
        long delivered = day.stream().mapToLong(s -> whole(s.getTotal())).sum();
        long collected = day.stream().flatMap(s -> s.getPayments().stream()).mapToLong(p -> whole(p.getAmount())).sum();
        Map<String,Object> report = new LinkedHashMap<>(); report.put("date", date); report.put("collected", collected);
        report.put("delivered", delivered); report.put("new_credit", Math.max(0, delivered - collected));
        report.put("outstanding", Math.max(0, delivered - collected)); report.put("sales", day.size()); return report;
    }

    @Transactional
    public PaymentEnvelope addPayment(Account account, UUID saleId, PaymentDto input) {
        Payment replay = payments.findByIdAndClinicId(input.id(), account.getClinic().getId()).orElse(null);
        if (replay != null) return new PaymentEnvelope(paymentDto(replay), true);
        Sale sale = sales.findByIdAndClinicId(saleId, account.getClinic().getId())
                .orElseThrow(() -> new ResourceNotFoundException("Sale", "id", saleId.toString()));
        Payment payment = paymentEntity(account.getClinic(), sale, input);
        sale.addPayment(payment);
        Payment saved = payments.save(payment);
        emit(account.getClinic(), "sale", saleDto(sale));
        return new PaymentEnvelope(paymentDto(saved), false);
    }

    public BarcodeLookup barcode(Account account, String code) {
        return products.findByClinicIdAndBarcode(account.getClinic().getId(), code)
                .map(p -> new BarcodeLookup(true, p.getName(), null, p.getCategory(), null, "clinic"))
                .orElseGet(() -> barcodeLookupService.lookup(code));
    }

    public Account account(String email) {
        return accounts.findByEmail(email).orElseThrow(() -> new TokenInvalidException("Account does not exist."));
    }

    @Transactional
    public StaffDto createStaffAccount(Account requester, StaffAccountInput input) {
        if (requester.getRole() != Role.ADMIN) throw new AccessDeniedException("Administrator role is required.");
        UUID clinicId = requester.getClinic().getId();
        licenseService.requireAdministrativeWrite(clinicId);
        String email = input.email().trim().toLowerCase();
        if (accounts.existsByEmail(email)) throw new AppBusinessException("An account with this email already exists.");
        Staff member = staff.save(Staff.builder().clinic(requester.getClinic()).name(input.name().trim())
                .phone(input.phone().trim()).pinHash(passwordEncoder.encode(input.pin()))
                .takesBookings(Boolean.TRUE.equals(input.takesBookings())).active(true).build());
        accounts.save(Account.builder().clinic(requester.getClinic()).staff(member).email(email)
                .passwordHash(passwordEncoder.encode(input.password()))
                .role("admin".equals(input.role()) ? Role.ADMIN : Role.STAFF).active(true).build());
        StaffDto result = staffDto(member);
        emit(requester.getClinic(), "staff", result);
        return result;
    }

    private void requireElevation(Account account, UUID token) {
        if (token == null) throw new AccessDeniedException("Admin elevation is required.");
        elevationService.requireValid(account.getClinic().getId(), account.getEmail(), token);
    }

    private Product requireProduct(Account a, UUID id) { return products.findByIdAndClinicId(id, a.getClinic().getId()).orElseThrow(() -> new ResourceNotFoundException("Product", "id", id.toString())); }
    private Patient requirePatient(Account a, UUID id) { return patients.findByIdAndClinicId(id, a.getClinic().getId()).orElseThrow(() -> new ResourceNotFoundException("Patient", "id", id.toString())); }
    private Staff requireStaff(Account a, UUID id) { return staff.findByIdAndClinicId(id, a.getClinic().getId()).orElseThrow(() -> new ResourceNotFoundException("Staff", "id", id.toString())); }
    private com.clinic.demo.entity.Service requireService(Account a, UUID id) { return services.findByIdAndClinicId(id, a.getClinic().getId()).orElseThrow(() -> new ResourceNotFoundException("Service", "id", id.toString())); }

    private ClinicDto clinicDto(Clinic c) {
        Map<String,Object> receipt = new LinkedHashMap<>();
        receipt.put("header", c.getName()); receipt.put("phone", or(c.getPhone(), "")); receipt.put("footer", or(c.getReceiptFooter(), ""));
        receipt.put("logo", or(c.getLogoUrl(), "")); receipt.put("qr", Boolean.TRUE.equals(c.getReceiptQr())); receipt.put("fu", Boolean.TRUE.equals(c.getReceiptNextVisit())); receipt.put("width", 80);
        return new ClinicDto(c.getId(), c.getName(), or(c.getPhone(), ""), or(c.getAddress(), ""), or(c.getRoundingStep(), 500),
                or(c.getCreditLimitMmk(), 0), receipt, or(c.getReceiptFooter(), ""), or(c.getReceiptHeader(), ""), or(c.getTelegramHandle(), ""), or(c.getLogoUrl(), ""),
                Boolean.TRUE.equals(c.getReceiptQr()), Boolean.TRUE.equals(c.getReceiptNextVisit()), or(c.getReceiptTemplate(), "classic"),
                or(c.getReceiptHeaderFont(), "sans"), or(c.getReceiptDivider(), "line"), or(c.getConsentMode(), "warn"),
                DEFAULT_ADDONS, DEFAULT_FEATURE_FLAGS);
    }

    // Empty maps read as "every add-on off" in the PWA and silently hide the
    // recall card and other billable surfaces. Until per-tenant toggles get
    // their own columns, mirror the executable contract (mock-server seed).
    private static final Map<String,Object> DEFAULT_ADDONS = Map.of(
            "brief", true, "careloop", true, "recall", true, "outcomes", true, "insights", true);
    private static final Map<String,Object> DEFAULT_FEATURE_FLAGS = Map.of("calendar", true, "leads", true);

    private static ZoneId clinicZone(Clinic clinic) {
        try { return ZoneId.of(clinic.getTimeZone()); } catch (Exception ignored) { return ZoneOffset.UTC; }
    }
    private StaffDto staffDto(Staff s) {
        String role = accounts.findByStaffId(s.getId()).map(a -> a.getRole().name().toLowerCase()).orElse("staff");
        return new StaffDto(s.getId(), s.getName(), role, Boolean.TRUE.equals(s.getTakesBookings()), Boolean.TRUE.equals(s.getActive()));
    }
    private ServiceDto serviceDto(com.clinic.demo.entity.Service s) { return new ServiceDto(s.getId(), or(s.getCategory(), ""), s.getName(), s.getNameEn(), whole(s.getPrice()), s.getDurationMin(), Boolean.TRUE.equals(s.getRequiresLot()), s.getDefaultFollowupDays(), Boolean.TRUE.equals(s.getActive())); }
    private ProductDto productDto(Product p) { return new ProductDto(p.getId(), p.getName(), or(p.getCategory(), ""), p.getSubcategory(), or(p.getSortOrder(), 0), p.getBarcode(), whole(p.getCost()), whole(p.getPrice()), stock(p), or(p.getLowStockAt(), BigDecimal.ZERO), or(p.getReorderAt(), BigDecimal.ZERO), or(p.getStockType(), "retail"), or(p.getSoldBy(), "each"), Boolean.TRUE.equals(p.getRequiresLot()), Boolean.TRUE.equals(p.getRequiresConsent()), p.getUnitLabel(), p.getPhotoKey(), Boolean.TRUE.equals(p.getActive())); }
    private PatientDto patientDto(Patient p) { return new PatientDto(p.getId(), p.getCode(), p.getName(), p.getPhone(), p.getSex(), p.getAllergies(), p.getAlertNote(), Boolean.TRUE.equals(p.getTelegramLinked()), p.getFollowupDate()); }
    private AppointmentDto appointmentDto(Appointment a) { return new AppointmentDto(a.getId(), a.getDate(), a.getTime().format(DateTimeFormatter.ofPattern("HH:mm")), a.getStaff().getId(), a.getPatient().getId(), a.getService().getId(), a.getStatus()); }
    private ContactDto contactDto(Contact c) { return new ContactDto(c.getId(), c.getPatient().getId(), c.getSale() == null ? null : c.getSale().getId(), c.getAt(), c.getChannel(), c.getDirection(), c.getOutcome(), c.getNote(), c.getAutomated()); }
    private PaymentDto paymentDto(Payment p) { return new PaymentDto(p.getId(), paymentName(p.getMethod()), whole(p.getAmount()), utc(p.getPaidAt())); }
    private SaleDto saleDto(Sale s) {
        List<SaleLineDto> lines = s.getSaleLines().stream().map(l -> new SaleLineDto(l.getId(), l.getKind().name().toLowerCase(), l.getItemIdSnapshot() != null ? l.getItemIdSnapshot() : l.getProduct() != null ? l.getProduct().getId() : l.getService().getId(), l.getNameSnapshot(), l.getQuantity(), whole(l.getUnitPrice()), whole(l.getLineTotal()), l.getDiscountPct(), l.getNote(), l.getLotNo(), l.getLotExpiry())).toList();
        List<PaymentDto> paid = s.getPayments().stream().map(this::paymentDto).toList();
        boolean review = s.getStatus() == SaleStatus.NEEDS_REVIEW;
        return new SaleDto(s.getId(), s.getPatient() == null ? null : s.getPatient().getId(), s.getStaff() == null ? s.getStaffIdSnapshot() : s.getStaff().getId(), s.getPractitionerId(), s.getAppointmentId(), utc(s.getCreatedAt()), lines, paid, nullableWhole(s.getSubtotal()), s.getDiscountPct(), s.getDiscountApprovedBy(), whole(s.getTotal()), nullableWhole(s.getCredit()), s.getCreditApprovedBy(), s.getFollowUpDate(), s.getDeviceId(), s.getCreatedOffline(), s.getSaleNumber(), s.getStatus() == SaleStatus.VOIDED ? "voided" : "completed", review, s.getValidationMessage(), or(s.getReceivedAt(), utc(s.getCreatedAt())));
    }
    private Payment paymentEntity(Clinic clinic, Sale sale, PaymentDto item) { return Payment.builder().id(item.id()).clinic(clinic).sale(sale).method(paymentMethod(item.method())).amount(money(item.amount())).paidAt(item.at() == null ? local(now()) : local(item.at())).build(); }
    private PaymentMethod paymentMethod(String value) { return switch (value) { case "cash" -> PaymentMethod.CASH; case "kbzpay" -> PaymentMethod.KBZPAY; case "wave" -> PaymentMethod.WAVE; case "bank" -> PaymentMethod.BANK; case "writeoff" -> PaymentMethod.WRITEOFF; default -> PaymentMethod.OTHER; }; }
    private String paymentName(PaymentMethod value) { return switch (value) { case WAVEPAY, WAVE -> "wave"; case BANK_TRANSFER, BANK -> "bank"; default -> value.name().toLowerCase(); }; }

    private void emit(Clinic clinic, String entity, Object row) { try { events.save(new SyncEvent(null, clinic, entity, "upsert", objectMapper.writeValueAsString(row))); } catch (Exception e) { throw new IllegalStateException("Could not create sync event", e); } }
    private Map<String,Object> readMap(String json) { try { return objectMapper.readValue(json, new TypeReference<>() {}); } catch (Exception e) { throw new IllegalStateException("Could not read sync event", e); } }
    private static BigDecimal money(Long value) { return value == null ? BigDecimal.ZERO : BigDecimal.valueOf(value); }
    private static BigDecimal stock(Product product) { return product.getStockQty() == null ? BigDecimal.valueOf(or(product.getCurrentStock(), 0)) : product.getStockQty(); }
    private static long whole(BigDecimal value) { return value == null ? 0 : value.longValue(); }
    private static Long nullableWhole(BigDecimal value) { return value == null ? null : value.longValue(); }
    private static OffsetDateTime now() { return OffsetDateTime.now(ZoneOffset.UTC); }
    private static OffsetDateTime utc(LocalDateTime value) { return value.atOffset(ZoneOffset.UTC); }
    private static LocalDateTime local(OffsetDateTime value) { return value.withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime(); }
    private static <T> T or(T value, T fallback) { return value == null ? fallback : value; }
}
