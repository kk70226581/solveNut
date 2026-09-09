# Solvent Dashboard

Full-stack app with React (Vite) frontend and Express backend.

## Scripts

- `npm run dev` - frontend dev server
- `npm run server` - backend server
- `npm run start` - run frontend + backend together
- `npm run build` - production frontend build
- `npm run test` - basic automated API tests
- `npm run test:ui` - responsive workspace and two-participant call regression tests

See [UI review and verification](docs/UI_REVIEW.md) for the dashboard refresh, platform comparison, and browser test setup.

## Security Additions

- Route protection on frontend via `ProtectedRoute`:
  - `/client-dashboard`, `/chat` -> client only
  - `/expert-dashboard` -> expert only
  - `/admin-dashboard` -> admin session token required
- Password hashing with bcrypt (`PASSWORD_SALT_ROUNDS`, default `12`)
- Strong password policy (`/api/password-policy`)
- Forgot/reset password flow with signed reset token
- In-memory rate limiting:
  - Global API limiter on `/api/*`
  - Stricter auth limiter on login/register/reset endpoints
- Optional Redis caching:
  - `/api/experts`
  - `/api/public-home-data`

## API Docs

- Human-readable docs: `GET /api/docs`
- OpenAPI JSON: `GET /api/docs/openapi.json`
- Public health check: `GET /api/health-public`

## Environment

See `.env.example` for required variables.
