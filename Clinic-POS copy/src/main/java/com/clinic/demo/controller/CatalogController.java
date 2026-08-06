package com.clinic.demo.controller;

import com.clinic.demo.controller.dto.ClinicApi.CatalogInput;
import com.clinic.demo.controller.dto.ClinicApi.CatalogItem;
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
@RequestMapping("/api/clinics/{clinicId}/catalog")
@RequiredArgsConstructor
public class CatalogController {
    private final CatalogService catalogService;
    private final TenantAccessService tenantAccessService;
    private final LicenseService licenseService;

    @GetMapping
    public List<CatalogItem> list(@PathVariable UUID clinicId, Authentication auth) {
        tenantAccessService.require(auth.getName(), clinicId);
        return catalogService.list(clinicId);
    }

    @PostMapping("/services")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('ADMIN')")
    public CatalogItem createService(@PathVariable UUID clinicId, Authentication auth,
                                     @Valid @RequestBody CatalogInput input) {
        adminWrite(clinicId, auth);
        return catalogService.createService(clinicId, input);
    }

    @PutMapping("/services/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public CatalogItem updateService(@PathVariable UUID clinicId, @PathVariable UUID id,
                                     Authentication auth, @Valid @RequestBody CatalogInput input) {
        adminWrite(clinicId, auth);
        return catalogService.updateService(clinicId, id, input);
    }

    @PostMapping("/products")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('ADMIN')")
    public CatalogItem createProduct(@PathVariable UUID clinicId, Authentication auth,
                                     @Valid @RequestBody CatalogInput input) {
        adminWrite(clinicId, auth);
        return catalogService.createProduct(clinicId, input);
    }

    @PutMapping("/products/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public CatalogItem updateProduct(@PathVariable UUID clinicId, @PathVariable UUID id,
                                     Authentication auth, @Valid @RequestBody CatalogInput input) {
        adminWrite(clinicId, auth);
        return catalogService.updateProduct(clinicId, id, input);
    }

    private void adminWrite(UUID clinicId, Authentication auth) {
        tenantAccessService.require(auth.getName(), clinicId);
        licenseService.requireAdministrativeWrite(clinicId);
    }
}
