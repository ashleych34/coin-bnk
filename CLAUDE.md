# AI Developer Guide — The Coin Bank

This document is for an AI assistant (or human developer) continuing work on this
project. Read it fully before making changes. It captures the architecture, the
conventions, and — most importantly — the hard-won lessons and gotchas from
development so far. **Keep this file up to date**: whenever you ship a feature
of any real size, update the relevant section here in the same sitting.

---

## 1. What this project is

A family coin/allowance tracker for two kids (**Ryan** and **Emma**) with a
PIN-locked **Parent** control panel. Kids plan and complete tasks (parent
approves the coins), save toward reward goals, borrow against future earnings
(parent-approved "advances" creating **Debit**), and gift coins to each other
(recipient must accept). Each kid can also lock their own account with a
personal PIN. The owner (Ashley) is the parent and sole maintainer.

- **Live site:** https://ashleych34.github.io/coin-bnk/
- **Stack:** React 18 + Vite, Tailwind (CDN build), lucide-react icons,
  Supabase (Postgres, free tier) for storage, GitHub Pages for hosting,
  GitHub Actions for CI/CD.
- **The owner is not a JS developer** (she is an Oracle PL/SQL developer). She
  applies changes by replacing files and running `git add/commit/push`. Give
  her complete files or exact instructions — never partial diffs to apply by hand.
- **Companion documents** (keep these in sync too when relevant):
  `KIDS_GUIDE.md` (markdown manual for Ryan & Emma) and a matching illustrated
  PDF (`Coin-Bank-Kids-Guide.pdf`, generated via a one-off reportlab script —
  regenerate it if the kid-facing feature set changes meaningfully).

## 2. Repository layout

```
├── index.html                    # Tailwind CDN, Google Fonts, favicon, #root
├── package.json                  # react, react-dom, @supabase/supabase-js, lucide-react
├── vite.config.js                # base: './' (required for GitHub Pages)
├── src/
│   ├── main.jsx                  # ReactDOM entry, renders <SiteGate/> (default export of App.jsx)
│   ├── App.jsx                   # ~2,900 lines — ALL components and logic live here
│   ├── storageAdapter.js         # load()/save() against Supabase — the ONLY persistence layer
│   └── supabaseClient.js         # createClient from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
├── supabase/schema.sql           # One-time database setup (already run in production)
├── .github/workflows/deploy.yml  # Build + deploy to Pages on push to main
├── CLAUDE.md                     # This file
├── KIDS_GUIDE.md                 # Kid-facing manual (markdown source)
└── README.md                     # Human-facing setup instructions
```

## 3. Architecture — the essentials

### 3.1 Single-document storage
The **entire app state is one JSON document** stored in one row (`id = 1`) of
the `coin_bank` table (`data jsonb` column). `storageAdapter.load()` reads it,
`storageAdapter.save()` upserts it. Every state change saves the whole document.

**This is a deliberate simplicity choice, not an accident.** If you ever
normalize into real rows, only `storageAdapter.js` should change — the rest of
the app talks to `load()`/`save()` only. Never add a second persistence path.

### 3.2 The data document shape
```js
{
  pin: '0606',                        // Parent PIN (4 digits, plain text, changeable in-app)
  kidPins: { Ryan: '', Emma: '', Test: '' }, // Per-kid optional PIN. '' = no PIN (open).
  balances:  { Ryan: 0, Emma: 0, Test: 0 },  // "Credit" per kid
  debits:    { Ryan: 0, Emma: 0, Test: 0 },  // Owed coins per kid (always >= 0)
  buckets:   { Ryan: [], Emma: [], Test: [] },// Savings goals:
             // { id, name, target, saved, claimPending? }
  dailyPlans: { Ryan: [], Emma: [], Test: [] }, // "My plan for today" checklist items:
             // { id, name, coins, taskId|null, date: 'YYYY-MM-DD', done, requestId|null, ts }
  transactions: [ ... ],              // Ledger, NEWEST FIRST (always prepend)
             // { id, kid, type?, amount, reason, ts, ...type-specific fields }
  rewardCatalog: [ { id, name, target } ],
  taskCatalog:   [ { id, name, coins, kids } ],  // kids: [] = both, ['Ryan'] = Ryan only
  taskRequests:  [ { id, kid, taskId|null, taskName, coins, status, custom?, ts } ],
  debtRequests:  [ { id, kid, rewardName, cost, status, ts } ],
  transfers:     [ { id, from, to, amount, note, status, ts } ],  // kid-to-kid gifts
}
```
All `status` fields: `'pending' | 'approved'/'accepted' | 'rejected'/'declined'`.

**Transaction `type` values** (see `describeTx()` for display mapping):
default (parent add/deduct), `bucket_create/deposit/withdraw/claim/delete/edit`,
`task_request/approved/rejected`, `claim_request/rejected`,
`debt_request/approved/rejected/paydown`,
`transfer_sent/received/declined`.

### 3.3 Money-flow invariants — DO NOT BREAK THESE
1. **Credit (`balances`) never goes negative.** Parent deductions take from
   credit first; any overflow is added to `debits` instead (see
   `applyTransaction`). There is leftover defensive display code for negative
   balances — it is dead-code fallback, keep it but don't rely on it.
2. **Debit is a separate non-negative number**, only reduced by explicit
   `payDownDebt` (kid's choice, full or partial) — earned coins always go to
   credit first, never auto-repay debt.
3. **Bucket coins are escrowed**: depositing moves coins out of `balances`
   into `bucket.saved`. Deleting a bucket returns `saved` to credit. Claiming
   (parent-approved) consumes them.
4. **Transfers are escrowed**: `sendTransfer` deducts the sender immediately;
   `acceptTransfer` credits the recipient; `declineTransfer` refunds the
   sender. Never allow a state where coins exist in two places or vanish.
   The Test account is excluded entirely (see 3.9).
5. **Daily plan items don't move money by themselves.** Checking an item off
   only sets `done: true`; coins only move when the linked `taskRequests`
   entry is approved (see `requestPlanCoins` — it creates a normal task
   request and stamps the plan item with that `requestId` so it can show
   live status and can't be double-requested).
6. **Every coin movement appends a transaction** (prepend to `transactions`).
   Use `uid()` for ids — NEVER `Date.now().toString()` (same-ms collisions).

### 3.4 Approval workflows (all live in ParentPanel's "Pending requests")
- Task completion → kid taps "I did this" (from the catalog or from "My plan
  for today"), or suggests a custom task → `taskRequests` pending → parent
  approves (amount editable at approval time) or declines. Approval adds
  coins to credit and, if linked to a plan item, that item's status updates
  automatically (same `taskRequests` array, matched by `requestId`).
- Goal claim → kid taps "ask to claim" on a fully-funded bucket →
  `bucket.claimPending = true` (flag ON the bucket, not a separate array) →
  parent approve (bucket removed, coins spent) / decline (flag cleared).
- Reward advance ("Get it now") → `debtRequests` pending → approval consumes
  available credit first, remainder becomes debit.
- Kid-to-kid transfer → **does not go through the parent.** Sender picks
  recipient + amount + note; coins leave sender immediately (escrow);
  recipient accepts (credited) or declines (refunded to sender). Both kids
  see it in their own tab; nothing appears in Parent's pending list for this.
- The Parent tab badge = pending tasks + pending claims + pending debts
  (transfers deliberately excluded — that's between the kids). Kid tab
  badges = incoming pending transfers for that kid.

### 3.5 Sync model (and its known weakness)
No realtime. `CoinBank` polls `storageAdapter.load()` every **15 s** and on
`visibilitychange`, skipping refresh while a local write is in flight
(`pendingWrites` ref). Writes are **last-write-wins on the whole document** —
two devices acting within the same window can drop one change. Acceptable for
a family; the proper fix is Supabase realtime subscriptions or row-per-entity
schema. If the owner ever reports "a change disappeared", this is why.

### 3.6 Data pruning
`pruneData()` runs inside `setData` on every save:
- Ledger (`transactions`) capped at `HISTORY_LIMIT = 400`.
- Resolved requests/transfers (`taskRequests`, `debtRequests`, `transfers`)
  capped at `RESOLVED_LIMIT = 50` per array — **pending items are never
  pruned**, only resolved ones beyond the cap.
- `dailyPlans` entries older than 7 days are dropped entirely (they're
  scoped to a specific `date`, so there's no reason to keep them — the kid
  UI only ever reads `date === todayStr()` anyway).

Keep any new request-like or day-scoped arrays consistent with this pattern.

### 3.7 Access control (know exactly how weak/strong each layer is)
- **SiteGate** (default export): whole-app password screen.
  `SITE_PASSWORD = 'ChenFamily2026'` — plain text in this public repo. Unlock
  is remembered per browser via `localStorage` key `coinbank-site-unlocked`.
- **Parent PIN** (owner-set): stored in the data document (`data.pin`), gates
  only the ParentPanel UI. Resets to locked when navigating away (component
  unmount resets local `unlocked` state) — same pattern as kid PINs below.
- **Kid PINs** (optional, per-kid, `data.kidPins[kid]`): each kid can set
  their own 4-digit PIN from their own account page ("Set a PIN" /
  "Change my PIN"). Empty string = no PIN = tab opens directly (this is the
  default/backward-compatible state). Gate logic lives inside `KidPassbook`
  itself (`unlocked` state initialized from `!kidPin`), reusing the same
  `PinGate` component the Parent tab uses. **The Parent PIN is a master key:**
  `PinGate` accepts an optional `masterPin` prop and kid gates receive
  `data.pin`, so the parent can open any kid's locked tab with her own PIN.
  **`KidPassbook` is rendered with `key={tab}`** — this is load-bearing:
  without it React reuses the instance across tab switches and the unlocked
  state leaks from one kid to the other (a real shipped bug, reported by
  Ryan). An effect also auto-unlocks if `kidPin` becomes empty while mounted
  (parent reset the PIN remotely while the kid sat at the lock screen).
  **The Test account never has a PIN gate** — `isTest` skips it entirely.
  **Safety valve:** Parent panel has
  a "Kids' PINs" section with a confirm-guarded "Forgot it? Reset" button per
  kid that clears their PIN back to `''`, so a kid can never be permanently
  locked out of their own account.
- The Supabase anon/publishable key is public by design; RLS allows anon
  select/insert/update on row id=1 but **no delete policy** (row can't be
  wiped via the public key). None of these layers stop a technical user with
  dev tools — the real protection is link obscurity. This trade-off was
  explicitly discussed and accepted by the owner. If she asks for real
  security, the path is Supabase Auth + `auth.uid()`-based RLS.

### 3.8 Theme system
5 themes in `THEMES` (midnight/ocean/sunset/forest/daylight), selected via the
palette icon, stored per-device in localStorage (`coinbank-theme`), NOT synced.
`themeVars()` sets CSS custom properties on the root div. **Rules:**
- All chrome colors must use the CSS variables (`var(--bg)`, `var(--surface)`,
  `var(--border)`, `var(--text-muted/dim/primary/bright)`, `var(--gold)`,
  `rgba(var(--gold-rgb), α)`, `var(--text-on-gold)`). Never hardcode new hex
  chrome colors.
- **Fixed colors that must NOT be themed:** Ryan teal `#3FA796`, Emma coral
  `#E85D75`, Test purple `#9B7EDE` (identity colors), and red/green semantics
  (`#E85D75` negative / `#3FA796` positive) in ledger/debt UI.
- `GOLD` is the string `'var(--gold)'` — usable in inline styles but NOT in
  rgba(); use `rgba(var(--gold-rgb), α)` for tints.

### 3.9 The hidden Test account
`TEST_KID = 'Test'` exists in all per-kid maps but is NOT in `KIDS`, so it
never appears in the shared tab bar. Entry is only via the ParentPanel button
("Open Test Account"). It has a banner with Reset (confirm-guarded; clears
balance, debit, buckets, transactions, taskRequests, debtRequests, transfers,
and dailyPlans for Test only, via `resetTestAccount`) and a back button.
**Isolation rules to preserve when adding features:**
- `TransferSection` returns `null` for the Test kid — it can't send/receive
  with real kids.
- The Test account never gets a PIN gate (`isTest` check in `KidPassbook`).
- Any new per-kid array needs a `Test: []`/`''` default in both `defaultData`
  and `withDefaults`, AND needs to be cleared in `resetTestAccount`.

### 3.10 Collapsible sections & the "My plan for today" pattern
- `CollapsibleSection` is a generic wrapper (title + chevron, remembers
  open/closed per device via `localStorage` key
  `coinbank-collapse-${storageId}`). Used to hide parent-curated catalogs
  (task list, reward ideas) behind a collapsed-by-default toggle so the kid's
  main screen centers on what *they* chose to do, not the full admin catalog.
- **"My plan for today" (`TodayPlan`) is the kid's own daily checklist**,
  separate from the parent's `taskCatalog`. Items can be added either by
  picking from their own catalog tasks (pre-fills name+coins) or fully
  custom (kid proposes their own coin value, same as `taskRequests.custom`).
  Checking an item off just flags `done`; the kid then explicitly taps "Ask
  for coins" to actually submit it for approval — don't merge those two
  steps, the deliberate two-step (do it → ask for it) is intentional UX, not
  a missing shortcut.
- If you add another kid-curated "list of things" section in the future,
  follow this same shape: a per-kid array in the data document, scoped by
  something meaningful (date, status, etc.), with pruning rules added to
  `pruneData`.

## 4. UI / code conventions

- **Everything lives in `src/App.jsx`** (~2,900 lines). Component order:
  helpers/constants → `describeTx` → `CoinStack` → `BucketRow` →
  `BucketSection` → `CollapsibleSection` → `TodayPlan` → `TaskBoard` →
  `TransferSection` → `DebtCard` → `KidPassbook` → `PinGate` → `ParentPanel`
  → `ThemePicker` → `CoinBank` → `SiteGate` (default export). A split into
  files has been offered but not requested; don't do it unprompted.
- **Mobile-first sizing**: text sizes have been bumped twice at the owner's
  request; current floor is roughly `text-base`, body text `text-lg`/`text-xl`,
  big balance `text-8xl`. Buttons ≥ `py-2`. Icon-only buttons get
  `className="p-1.5 -m-1.5"` for tap area without layout shift. Match this scale.
- **Pending-request-style rows MUST stack into two lines, never one.** A real
  bug shipped where a task/claim/debt request row crammed a kid tag + name +
  status label + amount input + two action buttons onto a single
  `flex justify-between` line — on a phone the name got squeezed down to a
  couple of characters (`truncate` ate it). The fix, now the standard
  pattern for any "name + amount + approve/reject" row: **top line** = tag +
  full name (no `truncate`, use `wordBreak: 'break-word'` and allow
  wrapping instead) + any small status label; **bottom line**, right-aligned
  = amount input/value + action buttons. See the `pendingRequests`,
  `pendingClaims`, and `pendingDebts` rows in `ParentPanel` for the reference
  implementation. Apply this to any new approval-row UI.
- Fonts: Fredoka (display numbers/titles), Inter (UI), JetBrains Mono
  (numeric values). Loaded via `<link>` in index.html.
- Tailwind is the **CDN build** (`cdn.tailwindcss.com` script in index.html):
  only core utility classes work; there's a console warning about production
  use — known and accepted.
- Destructive actions (delete goal/task/reward, test reset, PIN reset) use
  `window.confirm`. Keep that pattern.
- Kid-generic code: components take a `kid` prop and look up
  `ACCENTS[kid]`/`balances[kid]` — never hardcode 'Ryan'/'Emma' in logic.
  Adding a kid = extend `KIDS`, `ACCENTS`, and every per-kid map in
  `defaultData` + `withDefaults` + `resetTestAccount`'s equivalent cleanup
  logic if it's a Test-relevant field.
- **Any new field in the data document must be added to BOTH `defaultData`
  and `withDefaults()`** (backfills old saved data and old backups). Forgetting
  `withDefaults` breaks existing users on load.
- Save-failure UX: `setData` sets `syncError` on failure → red dismissible
  banner under the header. Don't add silent `.catch(() => {})` anywhere;
  a silent save failure previously hid a production outage for hours.

## 5. Build, deploy, and secrets

- Local dev: `npm install`, copy `.env.example` → `.env` with
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, `npm run dev`.
- Deploy: push to `main` → GitHub Actions builds with the two values injected
  from **repo secrets** of the same names → deploys to GitHub Pages. Pages
  source is set to "GitHub Actions"; repo is **public** (required for free
  Pages).
- `VITE_SUPABASE_URL` must be the **bare project URL**
  (`https://<ref>.supabase.co`) — **no `/rest/v1/` suffix**. A doubled
  `/rest/v1/rest/v1/` in network errors means the secret has the suffix again.
  This exact bug caused a "data won't save" outage during initial setup.
- The Supabase key in use is the **new publishable key**
  (`sb_publishable_...`), not the legacy `eyJ...` anon key. Both work with
  `createClient`, but the legacy format is being retired by Supabase.
- After deploys, the owner's browser sometimes serves a **stale cached
  bundle**. If she reports "the fix didn't work" but incognito works, it's
  cache — tell her to hard-refresh (Cmd+Shift+R).
- **Supabase free-tier projects pause after ~1 week of inactivity.** If the
  app suddenly can't load/save after a quiet stretch (e.g. a family trip),
  this is the likely cause — she needs to click "Restore" in the Supabase
  dashboard. Worth mentioning proactively if she ever reports a sudden outage
  after a gap in usage.

## 6. Owner workflow — how to deliver changes

1. Make edits to the repo files (canonical copy the AI maintains).
2. Give her the complete changed file(s) to replace locally.
3. Give her the exact commands:
   ```bash
   git add -A
   git commit -m "<short message>"
   git push
   ```
4. Remind her the Action redeploys automatically (~1–2 min) and to
   hard-refresh if the change doesn't appear.
5. For risky/data-shape changes, remind her to press **Backup** (Parent tab)
   first. Backup/Restore round-trips the whole document as JSON;
   `withDefaults` makes old backups forward-compatible.
6. After any change that affects what Ryan/Emma see or do, consider whether
   `KIDS_GUIDE.md` (and its PDF) need updating too — offer, don't assume.

Communication style that works with this owner: plain-language explanations,
one clear recommendation with honest trade-offs, screenshots-based debugging
(she pastes console/network screenshots), step-by-step numbered instructions
for anything in a dashboard UI. She communicates in English and Traditional
Chinese; mirror her language (正體中文 when she writes Chinese).

## 7. Known limitations / candidate future work (discussed, not yet requested)

- **Realtime sync** (replace 15 s polling with Supabase realtime channels) —
  now more valuable than before since there are more places two devices can
  collide (transfers, plan items, PIN changes).
- **Real auth** (Supabase Auth + per-user RLS) if link-obscurity ever fails.
- **Split App.jsx** into component modules.
- **Proper Tailwind build** (PostCSS plugin) to remove the CDN warning.
- Dead negative-balance display code could be removed (kept as fallback).
- Site password could move to a build-time secret (currently plain text in repo).
- CSV/spreadsheet export of the ledger was discussed (owner asked about
  Google Sheets as a storage alternative; decided against migrating, but a
  read-only CSV export button was offered as a middle ground) — not yet built.

## 8. Quick sanity checklist before shipping any change

- [ ] New data fields added to BOTH `defaultData` and `withDefaults`?
- [ ] If it's a per-kid field: does `resetTestAccount` clear the Test slice?
- [ ] Every coin movement balanced (no creation/destruction) and logged via a
      transaction with `uid()`?
- [ ] New request-type arrays follow the pending/resolved + pruning pattern?
- [ ] New "approval row" UI stacks into two lines (name/tag on top, amount +
      actions on bottom) — never a single crammed `justify-between` row?
- [ ] Chrome colors via CSS variables; identity/semantic colors untouched?
- [ ] Test account either excluded or fully isolated (transfers, PIN gate)?
- [ ] Destructive actions confirm-guarded; failures surface via `syncError`?
- [ ] Braces/parens balanced (`node -e` count check) — there's no local build
      in the AI environment, so structural checks are the safety net.
- [ ] Told the owner: replace file(s) → add/commit/push → hard-refresh.
- [ ] If the kid-facing UI changed meaningfully, offered to update
      `KIDS_GUIDE.md` / the PDF.
