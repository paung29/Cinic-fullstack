package com.clinic.demo.service;

import com.clinic.demo.controller.dto.ClinicApi.StockAdjustment;
import com.clinic.demo.controller.dto.ClinicApi.StockMoveResponse;
import com.clinic.demo.entity.Product;
import com.clinic.demo.entity.StockMove;
import com.clinic.demo.entity.enums.StockMoveReason;
import com.clinic.demo.exception.AppBusinessException;
import com.clinic.demo.repo.StockMoveRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class InventoryService {
    private final StockMoveRepository stockMoveRepository;
    private final CatalogService catalogService;

    @Transactional(readOnly = true)
    public List<StockMoveResponse> moves(UUID clinicId, UUID productId) {
        catalogService.requireProduct(clinicId, productId);
        return stockMoveRepository.findAllByClinicIdAndProductIdOrderByCreatedAtDesc(clinicId, productId)
                .stream().map(this::response).toList();
    }

    @Transactional
    public StockMoveResponse adjust(UUID clinicId, UUID productId, StockAdjustment input) {
        if (input.reason() == StockMoveReason.SALE || input.reason() == StockMoveReason.VOID) {
            throw new AppBusinessException("Manual stock changes must use ADJUST or RECEIVE.");
        }
        Product product = catalogService.requireProduct(clinicId, productId);
        product.setCurrentStock(product.getCurrentStock() + input.delta());
        StockMove move = stockMoveRepository.save(StockMove.builder()
                .clinic(product.getClinic()).product(product).delta(java.math.BigDecimal.valueOf(input.delta()))
                .reason(input.reason()).note(input.note()).build());
        return response(move);
    }

    public StockMoveResponse response(StockMove m) {
        return new StockMoveResponse(m.getId(), m.getProduct().getId(), m.getDelta().intValue(), m.getReason(),
                m.getSale() == null ? null : m.getSale().getId(), m.getNote(), m.getCreatedAt());
    }
}
