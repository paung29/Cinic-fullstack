package com.clinic.demo.controller;

import com.clinic.demo.controller.dto.ClinicApi.StockAdjustment;
import com.clinic.demo.controller.dto.ClinicApi.StockMoveResponse;
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
@RequestMapping("/api/clinics/{clinicId}/inventory/products/{productId}")
@RequiredArgsConstructor
public class InventoryController {
    private final InventoryService inventoryService;
    private final TenantAccessService tenantAccessService;
    private final LicenseService licenseService;

    @GetMapping("/moves")
    public List<StockMoveResponse> moves(@PathVariable UUID clinicId, @PathVariable UUID productId,
                                         Authentication auth) {
        tenantAccessService.require(auth.getName(), clinicId);
        return inventoryService.moves(clinicId, productId);
    }

    @PostMapping("/moves")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('ADMIN')")
    public StockMoveResponse adjust(@PathVariable UUID clinicId, @PathVariable UUID productId,
                                    Authentication auth, @Valid @RequestBody StockAdjustment input) {
        tenantAccessService.require(auth.getName(), clinicId);
        licenseService.requireAdministrativeWrite(clinicId);
        return inventoryService.adjust(clinicId, productId, input);
    }
}
