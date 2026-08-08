package com.clinic.demo.service;

import com.clinic.demo.controller.dto.EdenApi.BarcodeLookup;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
public class BarcodeLookupService {
    private final ObjectMapper objectMapper;
    private final Map<String, BarcodeLookup> cache = new ConcurrentHashMap<>();
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

    @Value("${app.barcode.base-url:https://world.openfoodfacts.org/api/v2/product}")
    private String baseUrl;

    public BarcodeLookup lookup(String code) {
        return cache.computeIfAbsent(code, this::fetch);
    }

    private BarcodeLookup fetch(String code) {
        if (!code.matches("[A-Za-z0-9._-]{4,64}")) return miss();
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/" + code + ".json"))
                    .timeout(Duration.ofSeconds(5)).header("User-Agent", "EdenClinicPOS/1.0").GET().build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) return miss();
            JsonNode root = objectMapper.readTree(response.body());
            if (root.path("status").asInt(0) != 1) return miss();
            JsonNode product = root.path("product");
            return new BarcodeLookup(true, text(product, "product_name"), text(product, "brands"),
                    text(product, "categories"), text(product, "image_url"), "open-food-facts");
        } catch (Exception ignored) {
            return miss();
        }
    }

    private static String text(JsonNode node, String field) {
        String value = node.path(field).asText("").trim();
        return value.isEmpty() ? null : value;
    }

    private static BarcodeLookup miss() {
        return new BarcodeLookup(false, null, null, null, null, null);
    }
}
