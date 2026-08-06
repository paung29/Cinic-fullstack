package com.clinic.demo.security;

import com.clinic.demo.controller.dto.ClinicApi.TokenResponse;
import com.clinic.demo.entity.Account;
import com.clinic.demo.entity.RefreshToken;
import com.clinic.demo.exception.TokenExpirationException;
import com.clinic.demo.exception.TokenInvalidException;
import com.clinic.demo.repo.RefreshTokenRepository;
import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.Date;
import java.util.HexFormat;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class JwtService {
    private static final String TOKEN_TYPE = "token_type";
    private static final String ACCESS = "access";
    private static final String REFRESH = "refresh";

    private final RefreshTokenRepository refreshTokenRepository;

    @Value("${app.jwt.secret}")
    private String encodedSecret;

    @Value("${app.jwt.issuer}")
    private String issuer;

    @Value("${app.jwt.access-token-minutes}")
    private long accessTokenMinutes;

    @Value("${app.jwt.refresh-token-days}")
    private long refreshTokenDays;

    private SecretKey signingKey;

    @PostConstruct
    void initializeKey() {
        byte[] keyBytes;
        try {
            keyBytes = Decoders.BASE64.decode(encodedSecret);
        } catch (RuntimeException ex) {
            throw new IllegalStateException("app.jwt.secret must be valid Base64.", ex);
        }
        if (keyBytes.length < 32) {
            throw new IllegalStateException("app.jwt.secret must decode to at least 32 bytes.");
        }
        signingKey = Keys.hmacShaKeyFor(keyBytes);
    }

    @Transactional
    public TokenResponse issueTokens(Account account, String clientIp) {
        requireActive(account);
        Instant now = Instant.now();
        Instant accessExpiry = now.plus(Duration.ofMinutes(accessTokenMinutes));
        Instant refreshExpiry = now.plus(Duration.ofDays(refreshTokenDays));
        UUID refreshId = UUID.randomUUID();

        String accessToken = Jwts.builder()
                .issuer(issuer)
                .subject(account.getId().toString())
                .id(UUID.randomUUID().toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(accessExpiry))
                .claim(TOKEN_TYPE, ACCESS)
                .claim("email", account.getEmail())
                .claim("role", account.getRole().name())
                .claim("clinic_id", account.getClinic().getId().toString())
                .signWith(signingKey)
                .compact();

        String refreshToken = Jwts.builder()
                .issuer(issuer)
                .subject(account.getId().toString())
                .id(refreshId.toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(refreshExpiry))
                .claim(TOKEN_TYPE, REFRESH)
                .signWith(signingKey)
                .compact();

        refreshTokenRepository.save(RefreshToken.builder()
                .id(refreshId)
                .account(account)
                .tokenHash(hash(refreshToken))
                .expiresAt(toLocalDateTime(refreshExpiry))
                .createdByIp(clientIp)
                .build());

        return response(account, accessToken, refreshToken, accessExpiry, refreshExpiry);
    }

    @Transactional
    public TokenResponse rotateRefreshToken(String encodedToken, String clientIp) {
        Claims claims = parse(encodedToken, REFRESH);
        UUID tokenId = uuid(claims.getId(), "Refresh token ID is invalid.");
        RefreshToken stored = refreshTokenRepository.findById(tokenId)
                .orElseThrow(() -> new TokenInvalidException("Refresh token is not recognized."));
        if (!stored.isUsable() || !secureEquals(stored.getTokenHash(), hash(encodedToken))) {
            throw new TokenInvalidException("Refresh token is expired, revoked, or already used.");
        }
        Account account = stored.getAccount();
        if (!account.getId().toString().equals(claims.getSubject())) {
            throw new TokenInvalidException("Refresh token subject does not match its account.");
        }
        requireActive(account);

        stored.setRevokedAt(LocalDateTime.now());
        TokenResponse replacement = issueTokens(account, clientIp);
        Claims replacementClaims = parse(replacement.refreshToken(), REFRESH);
        stored.setReplacedByTokenId(uuid(replacementClaims.getId(), "Replacement token ID is invalid."));
        return replacement;
    }

    @Transactional
    public void revokeRefreshToken(String encodedToken) {
        Claims claims = parse(encodedToken, REFRESH);
        UUID tokenId = uuid(claims.getId(), "Refresh token ID is invalid.");
        refreshTokenRepository.findById(tokenId).ifPresent(stored -> {
            if (!secureEquals(stored.getTokenHash(), hash(encodedToken))) {
                throw new TokenInvalidException("Refresh token is invalid.");
            }
            if (stored.getRevokedAt() == null) stored.setRevokedAt(LocalDateTime.now());
        });
    }

    public Claims parseAccessToken(String token) {
        return parse(token, ACCESS);
    }

    private Claims parse(String token, String expectedType) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(signingKey)
                    .requireIssuer(issuer)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            if (!expectedType.equals(claims.get(TOKEN_TYPE, String.class))) {
                throw new TokenInvalidException("The supplied token has the wrong type.");
            }
            return claims;
        } catch (ExpiredJwtException ex) {
            throw new TokenExpirationException("JWT has expired.");
        } catch (TokenInvalidException | TokenExpirationException ex) {
            throw ex;
        } catch (JwtException | IllegalArgumentException ex) {
            throw new TokenInvalidException("JWT is invalid.", ex);
        }
    }

    private void requireActive(Account account) {
        if (!Boolean.TRUE.equals(account.getActive())) {
            throw new TokenInvalidException("The account is disabled.");
        }
    }

    private TokenResponse response(Account account, String accessToken, String refreshToken,
                                   Instant accessExpiry, Instant refreshExpiry) {
        return new TokenResponse(accessToken, refreshToken, "Bearer",
                toLocalDateTime(accessExpiry), toLocalDateTime(refreshExpiry),
                account.getClinic().getId(), account.getRole());
    }

    private static UUID uuid(String value, String message) {
        try {
            return UUID.fromString(value);
        } catch (RuntimeException ex) {
            throw new TokenInvalidException(message, ex);
        }
    }

    private static String hash(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception ex) {
            throw new IllegalStateException("SHA-256 is unavailable.", ex);
        }
    }

    private static boolean secureEquals(String left, String right) {
        return MessageDigest.isEqual(
                left.getBytes(StandardCharsets.US_ASCII),
                right.getBytes(StandardCharsets.US_ASCII));
    }

    private static LocalDateTime toLocalDateTime(Instant instant) {
        return LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }
}
