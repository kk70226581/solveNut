# Solvenut Project Deep Dive

Solvenut is a full-stack expert consultation platform. A client can describe a decision, browse approved experts, unlock a consultation with Razorpay, chat in real time, and use audio or video calling. An expert can maintain a public profile, manage conversations, and respond to clients. An administrator approves experts, monitors platform activity, and completes protected admin sign-in.

This document describes the implementation that exists in this repository. It is intended for onboarding, code reviews, interviews, and future maintenance.

## Product model

The product has two connected consultation paths:

1. **AI first**: a signed-in user chooses a domain and starts an AI Expert conversation. The service streams the response, records confidence and feedback, and can recommend a human expert.
2. **Human expert**: the user browses approved expert profiles, chooses a session, pays through Razorpay, and receives a time-limited chat and calling relationship with that expert.

The platform separates discovery from access. Public users can view approved profiles and home-page metrics, but authenticated payment access is required before private client–expert messaging and calls are enabled.

## Technology choices

| Area | Technology | Reason in this project |
| --- | --- | --- |
| UI | React 19 | Component-based pages and stateful consultation flows |
| Build | Vite | Fast development server and production bundling |
| Routing | React Router DOM | Public, client, expert, and admin route boundaries |
| API | Express 5 on Node.js | Small modular monolith with straightforward deployment |
| Database | MongoDB with Mongoose | Flexible profiles, messages, payments, ratings, and AI history |
| Realtime | Socket.IO | Authenticated chat, presence, typing, and WebRTC signaling |
| Calls | Browser WebRTC | Media stays peer-to-peer after signaling |
| Payments | Razorpay | Order creation, signature verification, access windows, and webhook support |
| AI | Bedrock-compatible service | Domain-specific AI consultation with streaming and escalation metadata |
| Cache/presence | Redis, optional | Public response caching and cross-instance presence support |
| Uploads | Multer | Expert photos and resumes |
| Validation | ESLint, Node test runner, Playwright | Static, API, and browser regression checks |

## Repository map

```text
src/
  App.jsx                 Route table and protected route boundaries
  main.jsx                React entry point and global stylesheet loading
  pages/                  Home, experts, AI, dashboards, auth, chat, settings
  components/             VideoCall, help, assistants, protected routes
  utils/                  API base, storage, call layout, attachments, auth helpers
  styles/                 Page-level CSS and shared workspace refinements

routes/
  auth-routes.cjs         Registration, login, profiles, password reset, admin auth
  public-routes.cjs       Public data, profiles, chat history, ratings, help endpoint
  admin-payment-routes.cjs Admin operations, Razorpay order/payment/webhooks
  ai-expert-routes.cjs    AI conversations, streaming, feedback, escalation

socket/
  realtime-handlers.cjs  Socket authentication, chat, call signaling, access checks
  presence-store.cjs     Local and optional Redis-backed online presence

models/
  app-models.cjs         Mongoose schemas and database connection helper

middleware/
  auth-middleware.cjs    JWT and admin session checks
  cache-middleware.cjs   Rate limiting and optional Redis JSON cache
  admin-totp.cjs         TOTP verification and secret lookup

scripts/
  seed-experts.cjs       Idempotent approved demo expert roster

tests/
  *.test.cjs             API, security, socket, storage, and seed tests
  browser/*.spec.js      Playwright UI, chat, AI, dashboard, and WebRTC tests
```

## Runtime architecture

```text
Browser
  ├─ React pages and CSS
  ├─ REST requests ───────────────┐
  ├─ Socket.IO connection ────────┤
  └─ WebRTC media after signaling  │
                                   ▼
                         Express + Socket.IO
                          ├─ JWT/auth middleware
                          ├─ route modules
                          ├─ realtime handlers
                          ├─ rate limits
                          └─ optional Redis cache/presence
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
           MongoDB              Razorpay            AI provider
       users and experts      orders/webhooks       streamed advice
```

`server.cjs` creates the HTTP server, attaches Socket.IO, configures CORS and parsers, initializes uploads and optional Redis, connects MongoDB, and injects shared dependencies into each route module. The route modules do not create separate servers; they form one modular monolith.

## Frontend route boundaries

`src/App.jsx` uses a `HashRouter` in production so a refresh on a static host does not require a server-side SPA rewrite. Development uses `BrowserRouter` for a cleaner local URL.

Public routes are `/`, `/experts`, and `/ai-expert`. Login and signup routes are also public. Client routes are protected for the `client` role, expert routes are protected for the `expert` role, and the admin dashboard uses a separate admin session token.

The frontend reads one shared API base from `src/utils/api.js`:

```text
VITE_API_BASE, when explicitly configured
        ↓
localhost:3000 in development
        ↓
https://solutionhub66.onrender.com in production fallback
```

This prevents each page from inventing a different backend URL. It is especially important for chat, help, AI streaming, and profile updates.

## Home and expert discovery

The home page fetches `/api/public-home-data` and falls back to the approved expert list if that endpoint is unavailable. Live counts are shown only when the backend supplies them; unavailable metrics render an explicit loading or unavailable state instead of fabricated numbers.

The expert directory fetches `/api/experts?status=approved`. It supports:

- domain filters for programming, DevOps, academics, career, business, and medical guidance;
- search by name, field, and headline;
- rating, price, and experience sorting;
- grid and list presentation;
- profile images with initials fallback;
- session pricing and availability;
- payment-gated chat and consultation access.

The seed command currently upserts 22 detailed demo profiles and marks every profile `status: "approved"`. A deployed database may contain additional manually created profiles; the live directory therefore can show more than the seed count.

## Authentication and authorization

Client and expert registration create role-specific records. Passwords are hashed with bcrypt. Login creates a JWT containing the authenticated identity and role. The frontend stores the token and role for route gating, while the backend remains the authority for every protected operation.

The backend `authMiddleware` validates the bearer token and attaches the user identity to `req.user`. Routes use that identity rather than trusting an email supplied by the browser. For example, profile updates are scoped to the authenticated account and allowlisted fields; a client cannot update another client by changing a query parameter.

Admin authentication is separate. Google token validation can identify an allowed admin email, and TOTP verification provides a second factor. The admin dashboard requires `adminSessionToken`, not an ordinary client or expert token.

Additional protections include:

- a strong password policy;
- global API and stricter authentication rate limits;
- normalized email comparisons;
- payment and conversation ownership checks;
- Socket.IO identity checks before room operations;
- upload type and size checks;
- sanitized AI message length and domain values;
- no secrets committed to the repository.

## MongoDB model overview

`models/app-models.cjs` defines the primary collections.

### User

Stores client or general account identity: name, normalized unique email, password hash, role, contact fields, focus area, and password-reset token metadata.

### Expert

Stores public and private expert profile data: name, unique email, password when applicable, field, experience, headline, summary, skills, languages, availability, session count, location, LinkedIn URL, resume path, avatar, role, moderation status, price, and reset-token metadata.

Only experts with `status: "approved"` are returned by public discovery and considered for escalation. This is the moderation boundary.

### Message

Stores a chat room, author, author role, optional client message ID, text, message type, and attachment metadata. Supported attachments include image, audio, PDF, and generic file records.

### Payment

Stores Razorpay order/payment IDs, signature information, amount, currency, status, client and expert identities, expert field, client name, verification state, and notes.

### Rating

Stores a client’s score and review for an expert, along with the expert email, client email, and room. Rating aggregates drive public expert sorting and home metrics.

### AIConversation, AIMessage, AIUserFeedback

AI conversations belong to one normalized user email. Messages preserve the domain, role, content, confidence, escalation recommendation, escalation reason, token usage, and provider metadata when available. Feedback records connect a user’s helpfulness signal to a conversation and optional message.

## Payment-gated consultation flow

1. The client chooses an approved expert and clicks **Pay & talk**.
2. The backend creates a Razorpay order using the server-side amount and expert identity.
3. Razorpay returns a checkout result to the browser.
4. The browser sends the payment response to the backend.
5. The backend verifies the Razorpay signature before marking access as valid.
6. The webhook handler supports asynchronous provider events and updates payment state.
7. The client can chat and call only while the payment access window is valid.

The browser never decides that a payment is valid by itself. `getClientExpertChatAccess` checks the verified payment record and the time window before protected messages or call signaling are accepted.

## Chat and realtime architecture

REST is used for initial history and conversation lists. Socket.IO is used for new messages, typing indicators, read-style updates, presence, and call signaling.

The socket handshake carries authentication. The server normalizes the user identity, verifies expert approval where required, and checks payment access for client–expert rooms. Room names are parsed and validated rather than accepted as arbitrary cross-user channels.

Offline-friendly behavior is implemented in the client UI: a failed send preserves the draft, displays the reconnecting state, and lets the user retry. Message attachments are validated before encoding or transmission. Long messages remain readable through independent message scrolling and mobile pane switching.

## Audio and video calling

The `VideoCall` component uses WebRTC for media. Socket.IO exchanges offers, answers, and ICE candidates; media itself is negotiated peer-to-peer by the browsers.

The call lifecycle is:

1. Caller requests microphone and optionally camera access.
2. Caller emits an authenticated offer to the intended peer.
3. Recipient sees an incoming call and accepts or declines.
4. Both peers exchange SDP and ICE candidates through the socket.
5. Remote tracks attach to persistent media elements.
6. Controls mute, stop camera, switch to screen sharing, dock/floating layout, and fullscreen fallback.
7. Ending or cancelling releases every local and remote track.

The implementation handles camera permission failure by falling back to audio where possible. It also stops a stream that resolves after a user has cancelled a pending permission request. TURN URLs can be supplied through environment variables for networks where direct peer connectivity is not enough.

## AI Expert flow

The AI page begins with a domain selection and starter prompts. Starting a consultation creates an authenticated `AIConversation`. Follow-up messages are sent to `/api/ai/message` with `stream: true` and parsed as server-sent events.

The server:

- validates the domain against a fixed set;
- loads only the caller’s conversation;
- limits history sent to the model;
- persists the user message;
- streams tokens from the provider;
- stores the assistant result and confidence;
- records token usage;
- recommends escalation when confidence or provider policy requires it.

The browser displays streaming text, confidence, feedback controls, copy/retry actions, and a human-expert escalation card. `/api/ai/escalate` selects approved experts in the mapped domain and returns a filtered directory URL.

AI output is rendered as safe React text and simple markdown elements. It is never inserted as unsanitized HTML.

## Uploads and profile images

Multer stores resumes under `uploads/resumes` and photos under `uploads/photos`. The upload filter accepts images for photos and PDF for resumes, with a five-megabyte limit. Existing local paths are served through `/uploads`; data URLs and absolute URLs are also supported for profile display.

For production, object storage is a better long-term choice than local disk because ephemeral service files can disappear during redeploys or instance replacement.

## Caching and presence

Redis is optional. When configured, it caches public expert and home responses and can store presence across instances. When Redis is unavailable, the application continues with local memory behavior and logs that Redis is disabled.

Cache TTLs are controlled by `CACHE_EXPERTS_TTL_SEC` and `CACHE_HOME_TTL_SEC`. After moderation or seed changes, the cache should expire or be invalidated before expecting every client to see the new roster immediately.

## Deployment model

The backend is deployed as the Render `solutionhub66` Node service. The frontend can be built by Vite and hosted separately or served through the configured deployment setup. Render auto-deploys the `main` branch in the current service configuration.

Required production configuration includes MongoDB, JWT secret, Razorpay keys, the frontend URL, and AI provider credentials. Reliable cross-network calls additionally require HTTPS and valid TURN configuration.

The repository intentionally keeps secret values in environment variables. `.env.example` documents names and safe placeholders only.

## Verification strategy

Run the following checks before a release:

```bash
npm ci
npm run lint
npm test
npm run build
npm run test:ui
```

The Node tests cover API authorization, profile update scoping, rate limiting, socket identity, call cleanup, decision storage, and the expert seed roster. Playwright covers AI Expert at desktop/mobile widths, home-page interaction, client and expert chat at 390/768/1440 pixels, dashboard persistence, API error/retry states, two-party audio/video calls, screen sharing, fullscreen, and permission cancellation.

## Known boundaries and next improvements

- The public expert seed uses hosted portrait URLs for demo profiles; production profiles should use reviewed images and durable object storage.
- The current frontend bundle is large enough for Vite to emit a chunk-size warning. Route-level lazy loading would improve first load.
- Socket presence is local when Redis is not configured; multiple backend instances need Redis or another shared presence layer.
- WebRTC reliability across restrictive networks depends on TURN configuration.
- Payment and AI provider behavior still needs live-provider smoke tests in a controlled staging environment.
- A production deployment should add structured logs, error tracking, database indexes review, backup/restore drills, and a formal moderation audit trail.

## A concise interview explanation

“Solvenut is a modular-monolith consultation platform. React and Vite provide role-aware client, expert, admin, discovery, AI, chat, and calling interfaces. Express exposes modular REST routes and Socket.IO handles authenticated realtime messaging and WebRTC signaling. MongoDB stores identities, expert profiles, messages, payments, ratings, and AI history. Razorpay verifies access before private chat and calls. The AI Expert uses streamed provider responses with confidence and escalation metadata. Security is enforced again on the backend through JWT, role checks, payment ownership, moderation status, rate limits, and input validation. The project is tested with Node and Playwright and deployed as a Render Node service.”
