# VillageWatch — Backlog & Improvements Tracker

**Last updated:** 27 July 2026 (T3, T4, T7 closed)
**Repo:** https://github.com/jdell/villagewatch

---

## Running Tasks (in progress)

| Task | Status | Notes |
|------|--------|-------|
| Village activation flow | Running | Admin village management, join codes, coordinator appointment, share invite link |
| Copy to WhatsApp button | Running | Formatted alert copy + open WhatsApp for coordinators |
| Fix mobile menu height | Running | Sidebar unreachable on mobile — needs fixed overlay z-1100+, dvh, backdrop |

---

## Bugs (must fix)

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| B1 | Mobile menu unreachable | High | Sidebar opens behind Leaflet map. Needs z-index 1100+, fixed positioning, backdrop overlay, slide-from-left, 100dvh, compact items. |
| B2 | Face blurring too weak | Medium | MediaPipe client-side blur is not blurring faces enough. Increase Gaussian blur radius/sigma significantly. Faces should be completely unrecognisable. |
| B3 | OneSignal not sending push notifications | High | Verify: (1) OneSignal app ID correct, (2) service worker at /onesignal/OneSignalSDKWorker.js, (3) all 3 env vars set in Vercel, (4) browser permission granted, (5) user registered with OneSignal via OneSignal.login(userId). |
| B4 | CSV download not working | Medium | Export CSV button on coordinator dashboard fails. Debug: check export route, verify data query, test response headers. |
| B5 | Test data / stubs present | Medium | Audit codebase for remaining test data, placeholder content, or stubs. |

---

## Improvements (next sprint)

| # | Feature | Priority | Details |
|---|---------|----------|---------|
| I1 | Share summary with police/council | High | Generate formatted incident summary (PDF or email) for police/parish council. Include incident details, map, pattern analysis, anonymised description. One-click share button. |
| I2 | Stronger face blurring | High | Increase blur to heavy pixelation or solid block. Default to redact (black box) for maximum safety. |
| I3 | Coordinator share invite link | High | Share join URL via copy/WhatsApp/QR code from coordinator dashboard. Public /join/[slug] page pre-fills registration. |

---

## Launch Blockers (remaining)

| # | Blocker | Status | Details |
|---|---------|--------|---------|
| L1 | DPIA | Not started | UK GDPR Article 35 requires this before production. |
| L2 | Privacy policy — real controller name | Not started | DATA_CONTROLLER placeholder needs real parish council name. |
| L3 | Village activation from cold | In progress | Need: activate, mint join code, appoint first coordinator. |
| L4 | OneSignal push not working | Not started | See B3. |
| L5 | Verify coordinator flow end-to-end | Not started | Confirm submit to PENDING_REVIEW to approve to PUBLISHED to notification. |
| L6 | Apply pending migrations | Manual | Apply in order, then re-run rls_policies.sql. |

---

## Can launch without

Everything here is real work that makes the product better. None of it stops
the first parish going live, and treating any of it as a blocker is how a
launch date slips for reasons nobody can defend to a parish clerk.

| Item | Why it can wait |
|------|-----------------|
| Heatmap overlay | Pins on the map already answer "where is this happening". Density is a nicer way to read the same data, not a missing one. |
| CSV export | Coordinator convenience for a council meeting. The dashboard and the reports page both show the same figures on screen. (B4 says the button is broken — fix or hide it, but neither blocks launch.) |
| Email digest | Push-only is fine. Push works, has no transport dependency, and the digest already reaches coordinators through it. Email needs a provider, a DPA and a sender domain. |
| WhatsApp Channel | Extra reach, not core. A village with no channel loses nothing it had — residents are alerted in the app, and the coordinator can paste an alert anywhere. |
| Notification radius filtering | Village-wide is fine at 200 people. A radius is a way to hear *less*; at parish scale there is not enough to filter. Most residents have no home location captured anyway (T8). |
| Severity filter | Same reasoning. Every report in a village of 200 is worth a resident's attention. |
| Time-range filters | The list shows the most recent 30 and the map the last 500. That is the whole history for a village in its first months. |
| Full WCAG audit | The obvious things are in place — labels, focus rings, 44px targets, `aria-current`, reduced motion. A formal AA audit is a launch-plus-one, not a launch gate. |
| PWA offline resilience | The offline page and the shell cache exist. A resident with no signal cannot file a report to a server they cannot reach, and queueing one for later is a feature, not a fix. |
| ONS seed beyond your village | The first parish needs one row. Seeding England's other 10,400 is what makes the picker need a server-side search endpoint — cost, not benefit, until there is a second village. |

---

## Technical Debt

| # | Item | Priority | Details |
|---|------|----------|---------|
| T1 | CLAUDE.md push rule | Low | Still blocking automation. Change to allow direct push. |
| T2 | Stale CLAUDE.md entries | Low | Update false statements about OneSignal and migrations. |
| T3 | ~~No automated tests~~ | Done | Vitest over `tests/` — rate limiter, auth guards, AI failure modes, Zod schemas, channel code, alert format. `npm run test`. Unit only: no route, action, component or RLS coverage yet. |
| T4 | ~~No CI quality gate~~ | Done | `.github/workflows/ci.yml` runs lint → typecheck → test → build on every PR and every push to main. |
| T5 | Retention cron untested | Low | Never run against real data. |
| T6 | Audit log expiry | Low | Stated but not enforceable. |
| T7 | ~~Slack DPA~~ | Done (as a disclosure) | `/privacy` §6 now names Slack (Salesforce) separately: admin-only notifications to a private channel, no resident-facing dependency, and it says plainly that there is no separate agreement beyond Slack's standard terms. The blanket "every processor under a written DPA" claim was untrue and is gone. A signed agreement is still the answer past a single parish. |
| T8 | homeLat/homeLng not captured | Medium | Radius filtering needs home location in registration. |

---

## Nice-to-Have (future)

| # | Feature | Details |
|---|---------|---------|
| N1 | Heatmap overlay | Incident density on map. |
| N2 | Email digest | Weekly digest via email. |
| N3 | Notification radius filtering | Alert within X metres. |
| N4 | Severity filter | Alert on Moderate+ or High+. |
| N5 | WCAG 2.1 AA audit | Accessibility pass. |
| N6 | ONS seed all England | ~10,000 parishes. |
| N7 | Telegram Channel | Free official Bot API. |
| N8 | Auto-posting via WAHA/Whapi | When manual copy-paste becomes painful. |
| N9 | QR code for village invite | For printed flyers. |
| N10 | Police API integration | Direct feed to police systems. |
| N11 | Multi-language support | Welsh, Polish, other community languages. |

---

## Completed Features

| Date | Feature |
|------|---------|
| 24 Jul | Scaffold, schema, landing page |
| 25 Jul | MediaPipe face blur, incident form, Claude AI, map, pattern detection |
| 25 Jul | Push notifications, coordinator dashboard, weekly digest |
| 26 Jul | RLS, rate limiting, privacy/terms, security headers |
| 26 Jul | Deploy config, seed, retention cron, README, PWA, onboarding |
| 26 Jul | WhatsApp Channel alerts, ONS village seed |
| 27 Jul | Coordinator approval flow, per-village channels, admin sidebar |
| 27 Jul | Slack webhooks, right to erasure, persistent rate limiting |
| 27 Jul | Auto-extract channel code, auto-approve setting, z-index fix |
| 27 Jul | Vitest suite (T3), CI test gate (T4), Slack disclosure in /privacy (T7) |

---

*Maintained by Yakasista Ltd*
