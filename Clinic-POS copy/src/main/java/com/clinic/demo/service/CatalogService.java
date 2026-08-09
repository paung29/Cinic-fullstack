package com.clinic.demo.service;

import com.clinic.demo.controller.dto.ClinicApi.CatalogInput;
import com.clinic.demo.controller.dto.ClinicApi.CatalogItem;
import com.clinic.demo.entity.Clinic;
import com.clinic.demo.entity.Product;
import com.clinic.demo.entity.enums.SaleLineKind;
import com.clinic.demo.exception.AppBusinessException;
import com.clinic.demo.exception.ResourceNotFoundException;
import com.clinic.demo.repo.ClinicRepository;
import com.clinic.demo.repo.ProductRepository;
import com.clinic.demo.repo.ServiceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

@Service
@RequiredArgsConstructor
public class CatalogService {
    private final ServiceRepository serviceRepository;
    private final ProductRepository productRepository;
    private final ClinicRepository clinicRepository;

    @Transactional(readOnly = true)
    public List<CatalogItem> list(UUID clinicId) {
        Stream<CatalogItem> services = serviceRepository.findAllByClinicIdOrderByName(clinicId).stream()
                .map(this::response);
        Stream<CatalogItem> products = productRepository.findAllByClinicIdOrderByName(clinicId).stream()
                .map(this::response);
        return Stream.concat(services, products)
                .sorted(Comparator.comparing(CatalogItem::name))
                .toList();
    }

    @Transactional
    public CatalogItem createService(UUID clinicId, CatalogInput input) {
        Clinic clinic = requireClinic(clinicId);
        return response(serviceRepository.save(com.clinic.demo.entity.Service.builder()
                .id(UUID.randomUUID())
                .clinic(clinic).name(input.name().trim()).price(input.price())
                .active(input.active() == null || input.active()).build()));
    }

    @Transactional
    public CatalogItem updateService(UUID clinicId, UUID id, CatalogInput input) {
        com.clinic.demo.entity.Service item = requireService(clinicId, id);
        item.setName(input.name().trim());
        item.setPrice(input.price());
        item.setActive(input.active() == null || input.active());
        return response(item);
    }

    @Transactional
    public CatalogItem createProduct(UUID clinicId, CatalogInput input) {
        if (input.sku() != null && productRepository.existsByClinicIdAndSku(clinicId, input.sku())) {
            throw new AppBusinessException("A product with this SKU already exists.");
        }
        return response(productRepository.save(Product.builder()
                .clinic(requireClinic(clinicId)).name(input.name().trim()).sku(input.sku())
                .price(input.price()).currentStock(0)
                .active(input.active() == null || input.active()).build()));
    }

    @Transactional
    public CatalogItem updateProduct(UUID clinicId, UUID id, CatalogInput input) {
        Product item = requireProduct(clinicId, id);
        if (input.sku() != null && !input.sku().equals(item.getSku()) &&
                productRepository.existsByClinicIdAndSku(clinicId, input.sku())) {
            throw new AppBusinessException("A product with this SKU already exists.");
        }
        item.setName(input.name().trim());
        item.setSku(input.sku());
        item.setPrice(input.price());
        item.setActive(input.active() == null || input.active());
        return response(item);
    }

    public com.clinic.demo.entity.Service requireService(UUID clinicId, UUID id) {
        return serviceRepository.findByIdAndClinicId(id, clinicId)
                .orElseThrow(() -> new ResourceNotFoundException("Service", "id", id.toString()));
    }

    public Product requireProduct(UUID clinicId, UUID id) {
        return productRepository.findByIdAndClinicId(id, clinicId)
                .orElseThrow(() -> new ResourceNotFoundException("Product", "id", id.toString()));
    }

    private Clinic requireClinic(UUID id) {
        return clinicRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Clinic", "id", id.toString()));
    }

    private CatalogItem response(com.clinic.demo.entity.Service s) {
        return new CatalogItem(s.getId(), SaleLineKind.SERVICE, s.getName(), null, s.getPrice(), null,
                Boolean.TRUE.equals(s.getActive()));
    }

    private CatalogItem response(Product p) {
        return new CatalogItem(p.getId(), SaleLineKind.PRODUCT, p.getName(), p.getSku(), p.getPrice(),
                p.getCurrentStock(), Boolean.TRUE.equals(p.getActive()));
    }
}
