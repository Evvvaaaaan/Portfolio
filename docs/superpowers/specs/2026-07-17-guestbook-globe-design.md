# Guestbook Globe — Design Spec

Date: 2026-07-17
Status: Approved by Evan (chat, 2026-07-17)

## Goal

Add a guestbook page (`/guestbook`) where visitors pick their location on an
interactive 3D globe, leave a short message, and browse other visitors'
messages as glowing star pins. Entries persist in Supabase.

## Decisions (confirmed with user)

- **Globe**: 3D interactive globe (three/@react-three/fiber/drei — already
  installed). Continents rendered as a dot matrix to match the site's
  SpaceBackground space theme.
- **Location**: visitor clicks directly on the globe surface. Coordinates are
  rounded server-side to 1 decimal place (~10 km) for privacy. No browser
  geolocation permission, no IP-based auto-location.
- **Entry fields**: nickname (≤20 chars) + message (≤200 chars) + optional
  emoji (1 from a curated set of ~24). No login.
- **Spam defense**: server-side only — honeypot field, input validation,
  per-IP rate limit (3 entries/hour via hashed IP).
- **Extra feature**: pins are glowing star particles; the newest entry's pin
  is larger and pulses, and on page entry the camera eases toward it.
- **Out of scope** (explicitly not selected): Supabase Realtime updates,
  per-country stats panel, timeline list view, approval/moderation queue UI.

## Architecture

**Approach A — Vercel serverless API (chosen).** The client never talks to
Supabase directly. `api/guestbook.js` handles GET/POST using the existing
`insertSupabase()` pattern from `api/_utils.js` with the service-role key
(already in env). No new client dependency, no RLS setup, and spam defense is
enforced server-side. Rejected alternatives: direct `@supabase/supabase-js` +
anon key + RLS (weaker spam control, new dependency); hybrid read-direct /
write-API (added complexity, no benefit at this scale).

## Components

### 1. Route & navigation

- Add `/guestbook` route in `src/App.jsx`.
- Add a Navbar link, localized via existing `LangContext` (KR/EN).

### 2. Guestbook page — `src/pages/Guestbook/`

- `Guestbook.jsx` + `Guestbook.css` following the existing page structure
  (`Gallery`, `ExperimentPage` pattern).
- Full-screen R3F `<Canvas>` with the globe, a page title, and a bottom-right
  hint ("지구를 클릭해 흔적을 남겨보세요" / EN equivalent).

### 3. Globe rendering

- Dark translucent sphere + **continent dot matrix**: a small bundled
  equirectangular land-mask PNG (~500×250) is sampled via an offscreen canvas
  at runtime; land pixels become point particles on the sphere.
- OrbitControls: drag rotate, wheel/pinch zoom, inertia, slow auto-spin when
  idle.
- **Pins = glowing star particles** (additive blending). Newest pin is larger
  with a pulse animation. On page entry, the camera eases to face the newest
  pin.

### 4. Interaction flow

- Click empty surface → raycast intersection → convert to lat/lng → show
  temporary pin + entry form (desktop: side card; mobile: bottom sheet).
- Form: nickname, message, emoji picker (~24 curated emoji, optional), hidden
  honeypot input.
- Click existing pin → popup card: nickname, emoji, message, relative time
  ("3일 전").
- On successful submit, the new pin appears immediately on the globe with a
  sparkle.

## Data — Supabase table `guestbook_entries`

```sql
id          uuid primary key default gen_random_uuid()
created_at  timestamptz default now()
nickname    text not null
message     text not null
emoji       text          -- nullable
lat         numeric not null   -- rounded to 1 decimal server-side
lng         numeric not null   -- rounded to 1 decimal server-side
ip_hash     text               -- sha256(ip + salt); never exposed publicly
is_hidden   boolean default false  -- manual takedown flag
```

## API — `api/guestbook.js`

- **GET**: newest 300 rows where `is_hidden = false`; public fields only
  (`id, nickname, message, emoji, lat, lng, created_at`); `Cache-Control`
  with 60 s max-age.
- **POST**: reject if honeypot filled → validate lengths, emoji against the
  curated set, lat ∈ [-90, 90], lng ∈ [-180, 180] → round coords to 1
  decimal → compute `ip_hash` → reject 429 if ≥3 entries from the same
  `ip_hash` in the past hour → insert → return the public fields of the new
  row.

## Error handling

- GET failure: page shows the globe without pins plus a small retry notice.
- POST failure: inline form error (validation 400, rate-limit 429, server
  500), entry text preserved so the visitor can retry.

## Testing

- **vitest**: lat/lng ↔ 3D vector conversion; server validation helpers
  (lengths, coord ranges, rounding, emoji whitelist).
- **Playwright**: one smoke test — page loads, canvas renders, clicking the
  globe opens the entry form.

## i18n

All user-facing strings in both KR and EN via the existing `LangContext` /
`src/i18n` structure.
