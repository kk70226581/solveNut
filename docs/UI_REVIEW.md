# Workspace and calling refresh

## Comparison and design direction

This review uses publicly documented product flows, not access to competitors' private dashboards.

| Reference | Relevant pattern | Applied in SolveNut |
| --- | --- | --- |
| [MentorCruise mentorship](https://mentorcruise.com/teams/info/) | Calls and ongoing chat form one relationship with an expert. | Existing conversations are accessible from the client dashboard; expert messages are a primary action. |
| [Clarity booking flow](https://clarity.fm/help/articles/2/how-does-clarity-work) | Clear expert selection, session context, and price before the conversation. | Retained explicit session prices and payment access checks; removed the invented fallback price. |
| [MentorCruise matching](https://help.mentorcruise.com/article/117-tailoring-your-matching-process) | A clear next action helps users move from discovery to a session. | Reduced repeated dashboard marketing, added conversation shortcuts, and made the preparation checklist interactive. |

The visual direction is a consistent slate workspace with mint actions, quieter surfaces, readable message text, restrained card borders, and clear navigation. Public discovery pages receive lighter typography and control refinements. The home page now treats backend metrics and expert profiles as live data: it shows a loading or unavailable state instead of invented counts, and uses product outcomes in place of unattributed testimonials.

## Fixed behavior

- Client decisions and the preparation checklist persist per account in this browser. The board explicitly describes its local storage; it is not automatically shared with experts or synced across devices.
- Client settings now have a protected route and an authenticated, allowlisted profile update API. Placeholder contact details and fabricated recent activity were removed.
- Sessions show paid records rather than a fabricated minimum. Profile completeness is calculated from entered fields.
- Both dashboards, authentication pages, expert discovery, and call signaling use the same API configuration. Development defaults to localhost:3000; production retains the existing hosted API fallback. Set `VITE_API_BASE` for an explicit deployment target.
- Chat panels use viewport space with independent message scrolling. Mobile clients can switch between the conversation and expert details. The assistant launcher no longer covers the chat composer.
- Offline send attempts preserve drafts. Enter respects input-method composition; expert textareas grow for multiline messages. Dashboard/history request failures are surfaced instead of silently treated as empty results.
- Remote audio has a persistent audio element for voice and video calls. Video previews remain mounted across layout changes. Browser autoplay denial has an explicit enable-audio action.
- Missing cameras can fall back to audio. Failed setup releases media. Cancelling a call while camera permission is pending stops the subsequently returned stream.
- Floating calls use border-box measurements, clamp to the viewport, and release their backdrop so the workspace remains usable. Fullscreen has an in-page fallback. Local preview size stays bounded; landscape controls fit on screen.
- The home page includes a direct Experts navigation action, a responsive mobile drawer, a consistent help launcher, and a fallback message when public expert data cannot be loaded. The help bot uses the shared API base so local and deployed builds reach the same backend.
- The demo marketplace seed now includes 22 detailed profiles across six domains. The seed command upserts all profiles with `status: "approved"`; ten new profiles include hosted portrait images, summaries, locations, languages, skills, prices, and availability so the public directory has a complete first-run roster.

## Verification

Run `npm ci`, `npm run lint`, `npm test`, and `npm run build`. To populate a development database with the approved marketplace roster, run `npm run seed:experts` with `MONGO_URI` configured.

For browser checks, run `npx playwright install chromium` once, then `npm run test:ui`. An installed Chromium browser can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

The browser suite covers the home page at desktop and mobile widths, live metric rendering, expert navigation, help chat, and the mobile drawer, plus client and expert chat at 390, 768, and 1440 pixels; profile saving and decision persistence; error/retry states; offline drafts; real WebRTC connections between two browser pages; remote audio and video playback; mute, floating, dock, and fullscreen controls; portrait/landscape call layouts; and permission cancellation cleanup. Screen-share track switching uses a synthetic display stream. Dashboard API responses and signaling transport are fixtures; backend signaling authorization is tested separately.

Screenshots and failure traces are written to `test-results/` and excluded from Git.

## Deployment boundary

These checks do not validate live MongoDB records, production payments, native screen-picker behavior, physical devices, or calls between separate mobile networks. Deploy both frontend and backend for the client profile endpoint. Cross-network call reliability still requires valid TURN configuration from `.env.example` and HTTPS. No deployment credentials were added to the repository.
