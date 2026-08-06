package com.clinic.demo.exception;

import org.jspecify.annotations.Nullable;
import org.springframework.security.core.AuthenticationException;

public class TokenExpirationException extends AuthenticationException {

    private static final long serialVersionUID = 1L;

    public TokenExpirationException(@Nullable String msg) {
        super(msg);
    }
}
