package com.clinic.demo.security;

import com.clinic.demo.entity.Account;
import com.clinic.demo.exception.SecurityExceptionHandler;
import com.clinic.demo.exception.TokenInvalidException;
import com.clinic.demo.repo.AccountRepository;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private final JwtService jwtService;
    private final AccountRepository accountRepository;
    private final SecurityExceptionHandler exceptionHandler;

    public JwtAuthenticationFilter(JwtService jwtService, AccountRepository accountRepository,
                                   SecurityExceptionHandler exceptionHandler) {
        this.jwtService = jwtService;
        this.accountRepository = accountRepository;
        this.exceptionHandler = exceptionHandler;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String authorization = request.getHeader("Authorization");
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }
        try {
            Claims claims = jwtService.parseAccessToken(authorization.substring(7).trim());
            UUID accountId = UUID.fromString(claims.getSubject());
            Account account = accountRepository.findById(accountId)
                    .filter(a -> Boolean.TRUE.equals(a.getActive()))
                    .orElseThrow(() -> new TokenInvalidException("JWT account is missing or disabled."));
            String claimedRole = claims.get("role", String.class);
            String claimedClinic = claims.get("clinic_id", String.class);
            if (!account.getRole().name().equals(claimedRole) ||
                    !account.getClinic().getId().toString().equals(claimedClinic)) {
                throw new TokenInvalidException("JWT authorization claims are stale.");
            }
            var authentication = UsernamePasswordAuthenticationToken.authenticated(
                    account.getEmail(), null,
                    List.of(new SimpleGrantedAuthority("ROLE_" + account.getRole().name())));
            SecurityContextHolder.getContext().setAuthentication(authentication);
        } catch (Exception ex) {
            SecurityContextHolder.clearContext();
            var authenticationException = ex instanceof org.springframework.security.core.AuthenticationException auth
                    ? auth : new TokenInvalidException("JWT is invalid.", ex);
            exceptionHandler.commence(request, response, authenticationException);
            return;
        }
        filterChain.doFilter(request, response);
    }
}
