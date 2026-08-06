package com.clinic.demo.controller;

import com.clinic.demo.controller.dto.ClinicApi.SetupRequest;
import com.clinic.demo.controller.dto.ClinicApi.SetupResponse;
import com.clinic.demo.service.AccountService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/setup")
@RequiredArgsConstructor
public class SetupController {
    private final AccountService accountService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SetupResponse setup(@Valid @RequestBody SetupRequest input) {
        return accountService.setup(input);
    }
}
