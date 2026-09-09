# Solvenut: 100 SDE Interview Questions and Answers

This guide is based on the implementation in this repository. The strongest interview answers should explain the trade-off, name the actual code boundary, and mention what you would improve next. Avoid claiming that a future improvement already exists.

## Product and architecture

### 1. What problem does Solvenut solve?

Solvenut helps a client move from an uncertain decision to practical expert guidance. The user can begin with an AI consultation, browse approved human experts, pay for a session, and then use private chat or audio/video calling. The platform also gives experts a moderated marketplace profile and tools to communicate with clients.

### 2. What is the high-level architecture?

It is a modular monolith: a React/Vite frontend communicates with one Node/Express backend over REST and Socket.IO. MongoDB stores durable product data, Razorpay handles payment processing, an AI provider generates streamed advice, and Redis is optional for caching and shared presence. Keeping the backend together simplifies deployment while route and service modules preserve separation of responsibility.

### 3. Why choose a modular monolith instead of microservices?

The product has related workflows that share identity, payment access, expert moderation, and conversation data. A modular monolith keeps transactions and local development simple, avoids distributed tracing and network failure between small services, and is appropriate for the current scale. The route modules and dependency injection in `server.cjs` leave a path to extract high-load areas later.

### 4. How does a request move through the backend?

Express receives the request, applies CORS, body parsing, cookies, global rate limiting, and then dispatches to a registered route module. Protected routes run JWT or admin authentication before business logic. The handler validates input, queries MongoDB or an external provider, and returns a deliberately shaped response; realtime events follow a similar authentication and authorization path in Socket.IO handlers.

### 5. How are roles represented?

Normal accounts have a `role` such as `client` or `expert`, while expert records also carry a moderation `status`. Admin access uses a separate session token and does not rely on a normal user role. The frontend hides routes with `ProtectedRoute`, but the backend repeats every authorization decision so a user cannot bypass the UI.

### 6. Which parts are synchronous and which are asynchronous?

Login, profile reads, payment verification, and ordinary history requests are request/response operations. Chat messages, presence, typing, and call signaling are realtime Socket.IO events. AI responses can be streamed as server-sent events, while Razorpay webhooks arrive asynchronously and update payment state after checkout.

### 7. What is the most important trust boundary?

The browser is untrusted. It may request an expert, room, amount, or conversation ID, but the backend must derive identity from the authenticated token and re-check ownership, expert approval, and payment access. This is why client-supplied email parameters are never enough to authorize private chat or profile updates.

### 8. How would you scale the current architecture?

First I would add database indexes and measure slow queries, then cache safe public reads and move uploads to object storage. Multiple Node instances would need a Socket.IO adapter and shared presence store, such as Redis. AI work could move to a queue or dedicated worker if provider latency and concurrency become a bottleneck; the public and payment APIs should remain independently rate-limited.

### 9. What is the most likely single point of failure?

MongoDB is the source of truth for identities, payments, messages, and AI history, so its availability is critical. The application handles optional Redis failure by falling back to local behavior, but it cannot create durable consultations without MongoDB. Production should therefore use managed MongoDB backups, health checks, alerting, and tested restore procedures.

### 10. What would you monitor in production?

I would track request latency and error rates by route, authentication failures, payment verification failures, AI provider latency and token usage, Socket.IO disconnects, WebRTC setup failures, MongoDB query duration, cache hit rate, and upload failures. I would also log correlation IDs, user role, route, and outcome without logging passwords, tokens, payment secrets, or private message content.

### 11. How is configuration managed?

Configuration comes from environment variables documented in `.env.example`. The frontend uses `VITE_API_BASE`, while the backend reads database, JWT, rate-limit, Redis, email, Razorpay, AI, Google, and admin security settings. Defaults exist for local development, but production should set strong explicit secrets and provider credentials.

### 12. Why does production use HashRouter?

The frontend can be hosted where arbitrary SPA history paths are not rewritten to `index.html`. `HashRouter` keeps the route after `#`, so a refresh does not ask the host for a server file such as `/experts`. Development uses `BrowserRouter` for cleaner URLs, and a future deployment with correct rewrite rules could use history routing everywhere.

### 13. What is the role of the shared API helper?

`src/utils/api.js` centralizes the API base selection and removes hard-coded backend URLs from pages. This prevents one page from accidentally calling localhost while another calls production. It also makes tests and deployment configuration more predictable.

### 14. How would you introduce API versioning?

I would place externally consumed routes under `/api/v1` and keep response contracts stable within a version. Shared schemas or validation helpers would define required and optional fields, and deprecation headers could guide clients to a newer version. The current app is small enough that versioning can be introduced before external integrations multiply.

### 15. What is a good first architectural refactor?

I would extract shared request validation, response error formatting, and observability helpers so every route has the same behavior. Next I would split large frontend pages into feature components and lazy-load public, dashboard, and AI routes. These changes improve maintainability without changing the product’s core boundaries.

## React and frontend engineering

### 16. How is the React application organized?

`src/pages` contains route-level screens, `src/components` contains reusable interaction units such as `VideoCall` and `HelpBot`, and `src/utils` contains browser-safe helpers. Each page has focused CSS, while `workspace.css` provides cross-page refinements. `App.jsx` owns route composition and protected boundaries.

### 17. How does `ProtectedRoute` improve security?

It prevents an unauthenticated or wrong-role user from rendering a protected page and redirects them to the appropriate login path. It is a user-experience and navigation guard, not the true security layer. The backend still validates the JWT and role on every protected request.

### 18. How does the AI page manage state?

It stores the selected domain, initial problem, draft, conversation ID, messages, streaming state, escalation state, errors, copy state, and history-loading state with React hooks. `useCallback` keeps network and message helpers stable, while `useMemo` derives the selected domain metadata. This is sufficient for one active consultation; a larger product could use a server-state library and a conversation store.

### 19. Why use controlled textareas?

Controlled inputs keep the draft in React state, so character counts, disabled states, retries, and reset actions remain consistent. The AI page can clear the input after a send and restore a failed request’s text for retry. The trade-off is more renders, which are acceptable for these small text fields.

### 20. How does the AI page handle Enter and Shift+Enter?

Enter submits a follow-up message, while Shift+Enter inserts a newline. The handler calls `preventDefault()` only for the submit case. This gives desktop users a quick send action without removing multiline composition.

### 21. What happens when a user starts an AI consultation?

The page sends an authenticated `POST /api/ai/start` to create the conversation, then sends the first problem through the streaming message endpoint. The user’s message and an empty assistant message render immediately, so the UI feels responsive while tokens arrive. If the provider fails, the assistant bubble becomes an error state with escalation guidance and retry support.

### 22. How are streaming responses rendered?

The browser requests `text/event-stream`, reads the response body with a `ReadableStream` reader, splits events on blank lines, and appends each `token` payload to the assistant message. A final `done` event supplies the durable message ID, final text, confidence, and escalation metadata. The server persists the complete assistant message independently of the visual stream.

### 23. How does the page restore a saved AI conversation?

When the URL includes `conversationId`, the page calls `GET /api/ai/conversation/:id`. It maps stored messages into the same render model used for live messages, sets the domain, restores escalation state, and scrolls to the latest message. The backend filters by both conversation ID and authenticated email.

### 24. Why is safe markdown rendering important?

AI text is external content and should not be inserted with unsanitized `dangerouslySetInnerHTML`. The page now parses a small subset of bold, italic, code, headings, and list syntax into React elements, which keeps the content text-safe. A richer markdown renderer would still need an allowlist and sanitization policy.

### 25. What accessibility work exists on the AI page?

Buttons have labels for navigation, sending, copying, and human escalation. The message area uses `role="log"` and `aria-live`, loading states are visible, and inputs have labels or meaningful placeholders. Further improvements could add focus management after starting a conversation and announce the end of a stream explicitly.

### 26. How does responsive behavior work?

The AI layout becomes one column below the desktop breakpoint, moves domain selection below the chat, and compresses the header and composer on narrow screens. Browser tests verify a 390-pixel viewport has no horizontal overflow. CSS media queries preserve touch-sized controls rather than merely shrinking desktop content.

### 27. How would you prevent unnecessary rerenders?

I would keep derived values in `useMemo`, event handlers in `useCallback`, and split frequently changing message rows into memoized components. Streaming updates should ideally update only the active assistant row instead of recreating every message subtree. Profiling with React DevTools should guide this rather than adding memoization everywhere.

### 28. How are optimistic UI updates used in chat?

The user message and a typing assistant bubble are appended before the AI stream completes. This makes the interaction immediate, while the final SSE event replaces the temporary ID and content. If the request fails, the assistant bubble records the failed text and exposes a retry path.

### 29. What frontend error states matter here?

The app distinguishes loading, empty, provider failure, failed send, permission denial, payment failure, and unavailable data. A failed API request must not silently look like an empty dashboard or an empty expert directory. The AI page keeps the conversation visible and offers retry or human escalation rather than forcing a full reload.

### 30. How would you add conversation history navigation?

I would add a protected `GET /api/ai/conversations` endpoint returning the user’s recent conversations with title, domain, status, and updated time. The frontend could display a collapsible history rail and navigate using the existing `conversationId` query parameter. Pagination and an index on `(userEmail, updatedAt)` would keep it efficient.

## Backend and API design

### 31. Why are route modules injected with dependencies?

`server.cjs` passes models, helpers, rate limiters, and configuration into `registerAuthRoutes`, `registerPublicRoutes`, `registerAdminPaymentRoutes`, and `registerAIExpertRoutes`. This reduces hidden global state and makes route behavior easier to test with fakes. It also gives a clear boundary for later extraction into services.

### 32. How does the backend validate AI domains?

The AI route normalizes the requested domain and checks it against a fixed `VALID_DOMAINS` set. Unknown values fall back to career rather than being used to construct arbitrary provider prompts. The escalation route maps user-facing domains to the matching approved expert field.

### 33. How are request sizes limited?

Express JSON parsing has a ten-megabyte limit, AI messages are sanitized to six thousand characters, and uploads are limited to five megabytes by Multer. Domain and feedback values are allowlisted. These limits reduce accidental memory pressure and reject obvious abuse before provider or database work.

### 34. What is the purpose of the global rate limiter?

It limits overall `/api` traffic by a configured window and count. Authentication routes and AI routes receive stricter, separate limiters because credential and provider abuse are more expensive. The server trusts one Render proxy hop so rate limiting can use the actual client IP safely in deployment.

### 35. How should errors be exposed to clients?

Clients receive a stable HTTP status and concise public error message, while server logs retain diagnostic details. A provider exception should not expose a stack trace, key, prompt, or database URI. A mature implementation would add a request ID to both the response and structured log entry.

### 36. How does `GET /api/experts` enforce moderation?

Its default status query is `approved`, and the database filter uses the requested status and optional field. The route excludes passwords, adds rating statistics, and returns profiles sorted by experience and creation time before rating data is attached. Public escalation queries also explicitly filter approved experts.

### 37. Why cache public expert data?

The expert directory and home metrics are read-heavy and change less frequently than chat messages. Optional Redis caching reduces repeated MongoDB aggregation and improves public response latency. The cache must have a short TTL or explicit invalidation after moderation changes so approval updates become visible.

### 38. How does the help endpoint differ from AI Expert?

Help is a lightweight product-support flow that answers how to use booking, messaging, calls, accounts, dashboards, troubleshooting, and payments. AI Expert is a persisted domain consultation with an AI provider, confidence metadata, feedback, and escalation. Keeping the flows separate avoids mixing product support with user-specific decision advice.

### 39. How would you validate a profile update?

First authenticate the caller and derive the target account from `req.user.email`. Then allow only documented fields, trim strings, reject objects or oversized values, and validate enumerated values such as role or status. Finally update the specific record and return a safe projection without password or reset-token fields.

### 40. What is idempotency and where is it needed?

Idempotency means repeating a request produces one logical result instead of duplicate side effects. Payment order creation and webhook processing need it because browsers and providers retry. The payment model’s unique order ID and verified signature, plus webhook event handling, should be combined with explicit duplicate checks.

### 41. How does the API protect conversation history?

The conversation route queries by both the requested conversation ID and the normalized authenticated email. A valid ID belonging to another user therefore returns not found. The same ownership rule is used before writing messages, feedback, or escalation state.

### 42. How would you add pagination to expert discovery?

Use a stable sort such as `createdAt` plus `_id`, then accept a cursor rather than a large page number. Return `items` and `nextCursor`; preserve filters in the cursor context or query. Add indexes matching the approved status, field, sort, and search strategy.

### 43. How would you add request validation libraries?

I would define schemas with Zod, Joi, or Ajv at each public route boundary and convert validation failures into a consistent 400 response. The schema would constrain strings, arrays, lengths, enums, and nested payment data. Manual checks already exist in several routes, so migration should be incremental and tested against current clients.

### 44. How would you make API responses backward-compatible?

Add fields rather than changing the meaning or type of existing fields, and keep absent optional values safe for old clients. For breaking changes, version the route or negotiate a response version. Contract tests should serialize representative responses so a frontend change cannot silently remove required data.

### 45. What should a health check verify?

The public health endpoint should prove the process is running without exposing secrets. A deeper internal readiness check can verify MongoDB connectivity, Redis status, and provider configuration separately. Liveness should remain fast; readiness should fail traffic routing when the database is unavailable.

## Data modeling and MongoDB

### 46. Why use MongoDB for this product?

Expert profiles and AI metadata have flexible fields, while messages and payments are naturally document-shaped. Mongoose provides schemas, timestamps, casting, and model reuse without requiring a rigid relational migration for every profile field. MongoDB is still a database, not a replacement for access-control design or indexes.

### 47. What indexes would you add?

Unique indexes belong on normalized user and expert emails. Useful query indexes include expert `(status, field, experience)`, payment `(clientEmail, expertEmail, status, verified, createdAt)`, message `(room, createdAt)`, AI conversation `(userEmail, updatedAt)`, AI message `(conversationId, createdAt)`, and ratings `(expertEmail, clientEmail)`. Actual indexes should be confirmed with explain plans and production cardinality.

### 48. How do timestamps help?

Mongoose timestamps add `createdAt` and `updatedAt` to messages, payments, ratings, and AI records. They support sorting, relative-time display, TTL or retention policies, audit investigation, and cache freshness decisions. Client-provided timestamps should not replace server timestamps for security-sensitive ordering.

### 49. How would you model a conversation room?

The current message model stores a deterministic room string based on client and expert emails. That is simple for direct chat, but a stronger model would store a Conversation document with participant IDs, status, payment relationship, and last message metadata, then reference it from messages. This would make group chat and durable conversation lists easier later.

### 50. What are the risks of using email as an identifier?

Email is convenient and normalized, but it can change and is less stable than an immutable user ID. The current code normalizes email consistently and scopes access by it. A future migration should use ObjectId references as the primary relationship while retaining normalized email for display and migration compatibility.

### 51. How do you avoid leaking sensitive fields?

Public routes use projections such as `.select("-password")`, and profile responses explicitly omit password and reset metadata. Sensitive payment signatures, provider responses, and private AI metadata should be returned only where needed. A centralized serializer would make this guarantee easier to audit.

### 52. How should ratings be aggregated?

Ratings can be grouped by `expertEmail` with average score and count, then joined to the approved expert list in application code. The public route already uses aggregation helpers for this. At scale, a denormalized rating summary updated transactionally or asynchronously can reduce repeated aggregation cost.

### 53. How should the seed script be designed?

`seed-experts.cjs` uses `bulkWrite` with `updateOne`, filters by unique email, sets the profile fields, and upserts. That makes it safe to rerun without duplicate demo experts. Every seeded record is written with approved status, and tests verify count, unique emails, images, and profile completeness.

### 54. What is a transaction candidate?

A payment verification and access record update may need a transaction if multiple collections must change atomically. Creating a user and expert profile together could also be transactional if the product requires both records. MongoDB transactions add operational cost, so they should be used for invariants that cannot tolerate partial state.

### 55. How would you retain or delete messages?

Define a product retention policy, communicate it to users, and delete or archive by conversation ownership and timestamp. Attachments need separate storage cleanup. AI provider raw responses should have a shorter and more restricted retention period than user-visible messages if they contain sensitive prompt context.

## Security and identity

### 56. How are passwords stored?

The backend hashes passwords with bcrypt using a configurable minimum salt-round policy. Plain passwords are never returned in API responses or stored in the database. Password policy validation happens before hashing, and reset tokens are stored as hashes with expiration metadata.

### 57. What does a JWT provide and what does it not provide?

A JWT provides a signed statement of identity and role that the server can verify without a database lookup on every request. It does not automatically revoke a compromised token, prove payment access, or make browser storage safe. Short expirations, refresh-token rotation, revocation strategy, HTTPS, and backend authorization are still needed.

### 58. Why normalize emails?

Email comparisons are case-insensitive in product behavior, so the backend lowercases and trims them before database filters, socket identity, payment access, and conversation ownership checks. This prevents duplicate accounts such as `User@example.com` and `user@example.com` from bypassing authorization logic.

### 59. How does rate limiting help authentication?

The auth limiter reduces brute-force and reset abuse by limiting login, registration, and password-reset traffic more aggressively than ordinary API reads. The global limiter provides a second layer. Distributed deployments should use a shared store rather than process-local counters.

### 60. How would you protect password reset links?

Generate a random single-use token, store only a hash with a short expiration, send the raw token through a trusted email channel, and invalidate it after successful use. Never log the raw token or reveal whether an account exists. The reset handler should enforce the same strong password policy as registration.

### 61. What is the admin threat model?

Admins can approve experts and affect payments or visibility, so account takeover has a high blast radius. The implementation restricts allowed admin emails, verifies Google identity when configured, and uses TOTP for a second factor. Production should also use audit logs, least privilege, reauthentication for sensitive actions, and alerting on moderation/payment changes.

### 62. What CSRF concerns exist?

Bearer-token API calls are less exposed to ambient-cookie CSRF than cookie-only sessions, but any cookie-based admin or reset flow still needs SameSite and CSRF considerations. CORS is not a CSRF defense. State-changing routes should validate origin or use CSRF tokens when credentials are sent automatically.

### 63. How do you handle file upload security?

Multer limits file size and checks the expected field and MIME type. Production should additionally inspect file signatures, generate safe server filenames, strip metadata where appropriate, scan files, prevent path traversal, and store objects outside the application filesystem. Uploaded files must never be treated as executable content.

### 64. What security risk existed in AI markdown rendering?

Rendering model output with `dangerouslySetInnerHTML` could allow markup injection if provider output ever contained malicious HTML or an attacker influenced the text. The AI page now converts a small markdown subset into React elements and treats all remaining text as text nodes. A full markdown feature would require a trusted sanitization library and strict HTML allowlist.

### 65. How do you avoid logging secrets?

Redact authorization headers, cookies, passwords, reset tokens, payment signatures, API keys, database URIs, and provider raw payloads before logging. Log IDs, status, timing, and safe error categories instead. Structured logging makes redaction and alert rules easier to enforce.

### 66. What would you do after a JWT secret leak?

Rotate the secret, invalidate or shorten existing tokens, inspect logs and account activity, and force reauthentication if necessary. If provider or database credentials were exposed, rotate those independently and audit access. The repository should then be scanned to confirm the secret was not committed again.

### 67. How do backend and frontend security responsibilities differ?

The frontend improves navigation, input guidance, and visibility of permissions. The backend owns identity, access checks, validation, rate limits, payment verification, and data projection. Any rule implemented only in React is a convenience, not a security control.

## Realtime chat and WebRTC

### 68. Why use Socket.IO instead of polling?

Chat, typing, presence, and call signaling are event-driven and benefit from a persistent connection. Socket.IO handles reconnection, event semantics, and fallback transports more conveniently than manually polling REST endpoints. It is not a database; durable messages still need MongoDB writes.

### 69. How is a socket authenticated?

The socket handshake includes an auth token, and the server verifies it before allowing identity-sensitive events. The authenticated normalized email and role are attached to the socket context. Event payloads cannot override the authenticated sender identity.

### 70. How is a chat message delivered safely?

The server validates the room participants, checks client–expert payment access, writes the message with the authenticated author, and emits it to the permitted room. A sender-provided `author` field is ignored or replaced by the verified identity. Clients should use a message ID or client message ID to deduplicate reconnect/retry deliveries.

### 71. How do you handle reconnects?

The client can reload recent history through REST and then resume Socket.IO events. Draft text should remain in local state when a send fails. The server must tolerate duplicate client message IDs and should send a consistent delivery acknowledgment if exactly-once user experience is required.

### 72. What is presence consistency?

Single-process presence can be maintained with an in-memory map. Multiple instances require Redis or another shared store plus a Socket.IO adapter, otherwise users connected to different instances will see incomplete presence. Presence should be treated as eventually consistent and expire stale heartbeats.

### 73. How does WebRTC fit with Socket.IO?

Socket.IO carries signaling messages such as offers, answers, ICE candidates, and decline events. Once the peers negotiate, browser media flows through WebRTC and does not pass through the Node server. The server still authorizes who may initiate or accept the call before forwarding signaling.

### 74. What is an SDP offer and answer?

An offer describes the caller’s media capabilities and session parameters. The answer describes the recipient’s accepted parameters, after which ICE candidates help both peers discover a viable network path. SDP exchange is signaling data; it is not the media stream itself.

### 75. Why are TURN servers important?

STUN can discover public addresses, but symmetric NATs, enterprise firewalls, and restrictive mobile networks may block direct paths. TURN relays media when direct connectivity fails. The application supports `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, and `VITE_TURN_CREDENTIAL` for this reason.

### 76. How are media permissions handled?

The browser requests microphone/camera access only when a call starts. If camera access fails, the UI can continue as audio where possible, and permission errors remain visible. A cancellation guard stops a late-resolving stream so denied or abandoned requests do not leave the microphone active.

### 77. How does screen sharing work?

The caller requests a display track, replaces the camera sender track, and updates the local preview style. Stopping share restores the camera track and releases the display track. Browser tests use a synthetic display stream to verify the track switch without a human selecting a monitor.

### 78. What WebRTC cleanup is required?

Call end must stop every local media track, detach remote streams, close peer connections, clear listeners, cancel pending permission state, and notify the other participant. Missing cleanup can leave microphones active, leak memory, or cause the next call to attach stale tracks. The browser suite explicitly checks device release and pending cancellation.

## Payments and expert access

### 79. Why should the backend create the Razorpay order?

The server owns the canonical session price and expert identity. If the browser could choose the amount or create an order directly, it could underpay or associate a payment with another expert. The backend creates the order and returns only the checkout data needed by Razorpay.

### 80. How is a Razorpay payment verified?

The browser sends Razorpay order ID, payment ID, and signature to the backend. The server verifies the signature using the secret key before marking the payment verified. Webhooks provide a second asynchronous reconciliation path, but a webhook must also validate provider signatures and event idempotency.

### 81. How is a 24-hour access window enforced?

The access helper looks for a verified paid record for the authenticated client and target expert, then compares its access expiration with server time. The chat and call paths call this helper before allowing private interaction. The frontend may display hours remaining, but it cannot extend or grant access.

### 82. What happens if a payment succeeds but the browser closes?

The provider webhook and verified payment record preserve the server-side result. On the next visit, the client can call the payment/access endpoint and continue if the record is valid. This is why access cannot depend only on React state or a local success flag.

### 83. What payment states should be modeled?

At minimum: created/order initialized, paid or captured, verified, failed, refunded, and webhook-reconciled. The exact Razorpay event mapping should be explicit and idempotent. User-facing UI should distinguish “checkout did not complete” from “payment is awaiting confirmation.”

### 84. How would you prevent duplicate orders?

Use a client-side disabled state for immediate feedback, but rely on server-side idempotency for correctness. Accept a client request ID or derive an idempotency key, store it with the order, and return the existing order on retry. A unique Razorpay order ID protects the database from duplicate inserts but does not by itself prevent duplicate creation requests.

### 85. How should expert approval interact with payment?

The order route should verify that the selected expert is currently approved before creating a new order. Public discovery, escalation, and call authorization should apply the same moderation rule. If an expert is later rejected, existing payment records need a clear support/refund policy rather than silently granting new access.

## AI, provider integration, and reliability

### 86. How is an AI prompt scoped to a domain?

The backend normalizes the domain and sends it to the AI service along with conversation history and the latest user message. The service can apply domain-specific instructions and return text, confidence, escalation recommendation, reason, and token usage. The user-facing domain is not allowed to become arbitrary system instructions.

### 87. Why stream AI responses?

Streaming reduces perceived latency because the user sees the answer as it is generated. It also lets the UI show progress and keep a long response readable. The server still persists the final complete answer after provider completion, so a stream is a presentation optimization rather than the source of truth.

### 88. What if the AI provider fails midway?

The route catches provider errors, stores a safe fallback assistant message with low confidence and service-unavailable escalation, sends a final SSE event, and closes the response. The browser displays the fallback, preserves context, and offers retry or a verified human expert. A production implementation should also classify provider timeouts separately from quota or authentication failures.

### 89. How do you control AI cost?

Limit message length, cap history sent to the model, configure maximum output tokens, apply per-user rate limits, and record token usage. Summarizing older history can preserve context without sending every message. Provider routing can choose a cheaper model for low-risk tasks and reserve stronger models for approved high-value workflows.

### 90. How do you evaluate AI quality?

Create a domain-labeled evaluation set covering helpfulness, factuality, uncertainty, tone, refusal behavior, and escalation decisions. Track user feedback and human-review outcomes separately from raw confidence. Regression tests should pin expected safety behavior without requiring a live provider in every CI run.

### 91. Why record confidence and escalation reason?

A numeric confidence alone is difficult to interpret. The reason distinguishes low confidence, high-stakes topics, explicit human requests, provider failure, and an AI recommendation. Persisting both makes the UI explainable and gives product teams data for improving escalation thresholds.

### 92. How do you protect user privacy in AI history?

Store only what the product needs, scope every read by authenticated owner, avoid logging prompt content, and define deletion/retention behavior. Provider requests should use the minimum necessary context and documented data-processing settings. Sensitive domains such as medical guidance need careful disclaimers and human escalation rather than overconfident automation.

### 93. How would you add tool use to AI Expert?

Define narrow server-side tools with typed inputs, authorization, timeouts, and audit records. The model should request a tool through a validated action, never call arbitrary URLs or databases. Results must be labeled as tool data, bounded in size, and included in the final response with appropriate uncertainty.

## Testing, operations, and delivery

### 94. What testing layers does the project use?

ESLint catches static and React-hook issues. Node tests cover API behavior, authorization, profiles, rate limits, sockets, storage, and seed data. Playwright tests mock API boundaries for deterministic UI checks and use real browser media for two-party audio/video scenarios.

### 95. Why mock API responses in browser tests?

Mocking makes UI tests deterministic and avoids depending on production databases, payment providers, or AI quotas. The tests can deliberately trigger success, error, retry, and streaming states. Separate backend tests and controlled staging smoke tests are still required to validate real integration.

### 96. How would you test an SSE endpoint?

At the backend layer, send a fake provider stream and assert event order, headers, final persistence, and error closure. At the browser layer, fulfill a response with `ready`, `token`, and `done` events and assert incremental/final rendering. Include malformed events, disconnects, and provider failures.

### 97. How do you test payment code without charging money?

Unit-test signature verification and webhook idempotency with known fixtures. Browser-test the order UI with a mocked checkout SDK and API responses. Use Razorpay test mode in a staging environment for end-to-end confirmation, never production credentials in CI.

### 98. What does the build warning mean?

Vite reports that the main JavaScript bundle is above its recommended post-minification size. It does not mean the build failed, but it can increase first-load time on mobile. Route-level `import()` lazy loading and vendor chunking are the next improvements.

### 99. What is the deployment checklist?

Run lint, Node tests, build, focused browser tests, and the full browser suite. Confirm environment variables, MongoDB connectivity, Redis behavior, Razorpay webhook URL/signing, AI provider credentials, CORS/frontend URL, HTTPS, TURN servers, upload persistence, and health checks. After deploy, verify public experts, login, a test payment, a chat message, an AI stream, and a call in staging.

### 100. What would you improve next in Solvenut?

I would add route-level code splitting, durable object storage, shared Socket.IO scaling, conversation history navigation, structured observability, stronger upload scanning, payment reconciliation dashboards, and a formal expert moderation audit trail. I would also add staging smoke tests for Razorpay, AI provider failure modes, and TURN-assisted calls. These improvements address scale and operational confidence without changing the core consultation model.

## A strong closing answer

“I built Solvenut as a modular-monolith consultation platform. React handles public discovery, AI consultation, dashboards, chat, and calling; Express and Socket.IO provide authenticated APIs and realtime signaling; MongoDB stores the durable product state; Razorpay controls payment-gated access; and the AI service streams advice with confidence and human escalation. The important engineering decisions are repeated backend authorization, verified payment access, ownership-scoped conversations, safe AI rendering, cleanup of WebRTC resources, and layered testing. The next scale steps are indexes, object storage, shared realtime infrastructure, lazy loading, and observability.”
