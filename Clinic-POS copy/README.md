# Clinic POS backend

Spring Boot API for the offline-first clinic POS architecture.

## Architectural guarantees

- Every business query is scoped by `clinicId`; authenticated accounts cannot cross clinic boundaries.
- A client-minted sale UUID and clinic-scoped idempotency key make outbox replay safe.
- Sale, lines, payments, product quantities, and stock ledger entries are committed in one transaction.
- Completed sales are accepted even when business validation fails or the license is restricted/suspended. Problems are stored as `NEEDS_REVIEW`.
- Patients are reconciled by normalized phone number and the API returns the canonical patient UUID.
- Clinical records require a server-tracked, 15-minute elevation token and every clinical read/write is audited.
- License `RESTRICTED` and `SUSPENDED` states are only set by a human. Sale sync and data export are never license-gated.
- Data export always re-prompts for an admin password.

## Frontend connection

The Spring API now implements the frontend contract from
`eden-clinic-pos-main/docs/reference/openapi.yaml` at the server root. The local
frontend is configured for `http://127.0.0.1:8080` in `apps/pos/.env.local`.

Start the backend with `./mvnw spring-boot:run`, then start the frontend from
`eden-clinic-pos-main/apps/pos` with `npm run dev`. On a fresh in-memory database,
call `POST /api/setup` once. Its response includes `staff_id`; enter that value
and the setup PIN on the frontend's first-device screen.

Frontend routes include `/auth/login`, `/auth/refresh`, `/auth/elevate`,
`/bootstrap`, `/delta`, `/sales`, `/patients`, `/products`, `/stock/receive`,
`/appointments`, `/contact-log`, `/followups`, and `/reports/daily`. Offline
create endpoints are idempotent on their client UUID and mutations are published
through the delta cursor.

## Authentication and setup

Run the one-time anonymous `POST /api/setup` to create the clinic, its first
admin/staff identity, and annual license. Then authenticate with
`POST /api/auth/login`. Protected endpoints require:

```text
Authorization: Bearer <accessToken>
```

Access tokens expire after 15 minutes. Refresh tokens expire after 30 days,
are stored only as SHA-256 hashes, rotate on every refresh, and can be revoked
with `POST /api/auth/logout`. Staff PINs and account/admin passwords are BCrypt
hashes.

JWT routes:

| Route | Authentication | Purpose |
| --- | --- | --- |
| `POST /api/auth/login` | Public | Exchange email/password for access and refresh tokens |
| `POST /api/auth/refresh` | Public | Rotate a valid refresh token and issue a new token pair |
| `POST /api/auth/logout` | Bearer | Revoke the submitted refresh token |

For production, set `JWT_SECRET` to a private Base64-encoded value containing at
least 32 random bytes. The default in `application.yaml` is for local development
only.

## API routes

All clinic routes start with `/api/clinics/{clinicId}`.

| Area | Routes |
| --- | --- |
| Clinic | `GET /` |
| Patients | `GET/POST /patients`, `GET/PUT /patients/{patientId}` |
| Clinical | `GET/POST /patients/{patientId}/clinical-records` with `X-Elevation-Token` |
| Catalogue | `GET /catalog`, `POST/PUT /catalog/services`, `POST/PUT /catalog/products` |
| Sales/outbox | `POST /sync/sales`, `GET /sales`, `GET /sales/{saleId}`, `POST /sales/{saleId}/void` |
| Inventory | `GET/POST /inventory/products/{productId}/moves` |
| Staff/accounts | `GET/POST/PUT /staff`, `GET/POST/PUT /accounts` |
| Authorization | `POST /auth/pin/verify`, `POST /auth/elevate` |
| License | `GET/PUT /license` |
| Export | `POST /export` |

Administrative mutations require the `ADMIN` role. Catalogue, inventory, staff, and account mutations are disabled in restricted/suspended license states; sales, patient safety data, and export remain available.

Run verification with:

```bash
./mvnw test
```

## Postman

Import `postman/Clinic-POS.postman_collection.json` into Postman. The collection
contains all API requests, automatically logs in, saves both JWTs, applies Bearer
authentication, rotates refresh tokens, and saves IDs returned by setup and
create requests. Run the numbered folders in order against a freshly started
in-memory database.
