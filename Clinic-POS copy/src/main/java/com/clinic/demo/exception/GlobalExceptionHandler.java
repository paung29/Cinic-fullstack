package com.clinic.demo.exception;

import com.clinic.demo.controller.dto.EdenApi.ErrorResponse;
import org.springframework.http.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.*;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class,
            MethodArgumentTypeMismatchException.class, IllegalArgumentException.class})
    ResponseEntity<ErrorResponse> malformed(Exception e) { return error(HttpStatus.BAD_REQUEST, "MALFORMED", message(e)); }

    @ExceptionHandler(AppBusinessException.class)
    ResponseEntity<ErrorResponse> business(AppBusinessException e) {
        String code = e.getMessage() != null && e.getMessage().startsWith("barcode already") ? "DUPLICATE_BARCODE" : "BUSINESS_RULE";
        return error(HttpStatus.BAD_REQUEST, code, message(e));
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    ResponseEntity<ErrorResponse> missing(ResourceNotFoundException e) { return error(HttpStatus.NOT_FOUND, "NOT_FOUND", message(e)); }

    @ExceptionHandler(TokenExpirationException.class)
    ResponseEntity<ErrorResponse> expired(TokenExpirationException e) { return error(HttpStatus.UNAUTHORIZED, "TOKEN_EXPIRED", message(e)); }

    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<ErrorResponse> auth(AuthenticationException e) {
        String message = switch (e) {
            case DisabledException ignored -> "Your account is disabled.";
            case TokenInvalidException ex -> ex.getMessage();
            default -> "Authentication failed.";
        };
        return error(HttpStatus.UNAUTHORIZED, "TOKEN_INVALID", message);
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ErrorResponse> denied(AccessDeniedException e) { return error(HttpStatus.FORBIDDEN, "ELEVATION_REQUIRED", message(e)); }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ErrorResponse> unexpected(Exception e) { return error(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "The server could not complete the request."); }

    private static ResponseEntity<ErrorResponse> error(HttpStatus status, String code, String message) {
        return ResponseEntity.status(status).body(new ErrorResponse(status.value(), code, message));
    }
    private static String message(Exception e) { return e.getMessage() == null || e.getMessage().isBlank() ? "Request could not be processed." : e.getMessage(); }
}
