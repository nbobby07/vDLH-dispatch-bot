# Flight Audit Log + B787 Cleanup — Design Spec

**Date:** 2026-06-27
**Status:** Approved (pending spec review)

## 1. Background & Motivation

The vBA bot currently tracks completed flights only as an aggregate integer
(`users.flightCount`) and the currently-in-progress flight as a single row in
`active_flights` (which is **deleted** on landing/cancel/deny). There is no
permanent record of an individual flight's lifecycle. If a flight is cancelled,
denied, or its data gets messed with, there is nothing to reconcile against.

Three asks drive this work:

1. **Permanent per-flight audit log** — "keep an internal log of every flight in
   case something gets messed with or deleted."
2. **Fix the B787 bug in `/sync`** — the sync command has hardcoded plane logic
   that does not know B787 exists, so running `/sync` strips a pilot's B787.
3. **Update the promotion-system channel** (`send_promotions.js`) to list B787
   at the 60-flight tier.

A note on Task 2 from the original request ("B787 doesn't show up in the
promotion window"): `config.js` **already** lists B787 in the `flightsRequired:
60` and `100` promotion tiers (committed in `3f3bf46`). The DM plane-selection
menu is built directly from `tier.unlocks`, so the menu **already** offers B787.
No production code change is required for the promotion window itself — if it is
not appearing in Discord it is a deploy issue (the running bot predates
`3f3bf46`). The remaining B787 work is the `/sync` fix and the channel text.

## 2. Decisions (locked)

| Decision | Choice |
|----------|--------|
| Storage backend | PostgreSQL table (Heroku has an ephemeral filesystem, so a local JSON file would be wiped on every dyno restart) |
| Log scope | Full lifecycle — log at dispatch **and** at resolution |
| Row model | One row per flight, updated as it progresses (flightId PK) |
| Linking strategy | **Option A** — resolve by `userId + status='DISPATCHED'`. Relies on the existing one-active-flight-per-user invariant. No change to `active_flights`. |
| Logging failure mode | Best-effort: every log call is wrapped in try/catch so a log failure never breaks the flight flow itself. |

## 3. Data Model

### New table: `flight_log`

```sql
CREATE TABLE IF NOT EXISTS flight_log (
    flightId       BIGSERIAL PRIMARY KEY,
    userId         TEXT NOT NULL,
    callsign       TEXT,
    aircraft       TEXT,
    departure      TEXT,
    arrival        TEXT,
    haulType       TEXT,          -- Domestic | Short Haul | Medium Haul | Long Haul | Cargo
    routeId        TEXT,
    dispatchedAt   TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolvedAt     TIMESTAMPTZ,   -- null until resolved
    status         TEXT NOT NULL DEFAULT 'DISPATCHED',
    -- status: DISPATCHED | LANDED_AI | LANDED_MANUAL | CANCELLED | DENIED
    flightsAwarded INTEGER,       -- null until a successful landing
    proofUrl       TEXT,          -- null until landed
    aiReasoning    TEXT,
    reviewedBy     TEXT,          -- discord id, manual review only
    denialReason   TEXT
);
CREATE INDEX IF NOT EXISTS idx_flight_log_userId ON flight_log(userId);
CREATE INDEX IF NOT EXISTS idx_flight_log_status ON flight_log(status);
```

### Status lifecycle

```
DISPATCHED ──land (AI auto-approve)──► LANDED_AI
           ──land (manual approve)───► LANDED_MANUAL
           ──cancel (self/staff)─────► CANCELLED
           ──deny (manual)───────────► DENIED
```

Orphaned `DISPATCHED` rows (dispatch logged but bot crashed before resolution)
are **intentional audit data** — they answer "this flight was dispatched but
never resolved, what happened?"

## 4. New `db.js` functions

Two new exported functions. Both write to Postgres and invalidate the user cache
only where relevant (the audit log is not cached).

```js
/**
 * Create a flight_log row at dispatch time. Returns the new flightId.
 * Best-effort: never throws into the flight flow.
 */
logFlightDispatch: async (userId, { callsign, aircraft, departure, arrival, haulType, routeId }) => {
    const { rows } = await pool.query(
        `INSERT INTO flight_log (userId, callsign, aircraft, departure, arrival, haulType, routeId)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING flightId`,
        [userId, callsign, aircraft, departure, arrival, haulType, routeId]
    );
    return rows[0].flightid;
},

/**
 * Resolve the user's currently-DISPATCHED flight_log row.
 * Matches by userId + status='DISPATCHED' (one active flight per user invariant).
 * If no DISPATCHED row exists (e.g. a flight dispatched before this feature shipped),
 * it no-ops silently rather than erroring.
 */
logFlightResolution: async (userId, { status, flightsAwarded = null, proofUrl = null, aiReasoning = null, reviewedBy = null, denialReason = null }) => {
    await pool.query(
        `UPDATE flight_log
            SET resolvedAt = now(),
                status = $2,
                flightsAwarded = COALESCE($3, flightsAwarded),
                proofUrl = COALESCE($4, proofUrl),
                aiReasoning = COALESCE($5, aiReasoning),
                reviewedBy = COALESCE($6, reviewedBy),
                denialReason = COALESCE($7, denialReason)
          WHERE userId = $1 AND status = 'DISPATCHED'`,
        [userId, status, flightsAwarded, proofUrl, aiReasoning, reviewedBy, denialReason]
    );
}
```

`COALESCE` lets callers pass only the fields they care about (e.g. a cancel
call passes only `status: 'CANCELLED'`).

## 5. Wire points in `index.js`

Six integration points. Every call is wrapped in `try/catch` (or
`.catch(()=>{})`) so a logging failure cannot break the flight flow.

| # | Location (current line) | Handler | Call |
|---|-------------------------|---------|------|
| 1 | `dispatch_callsign:` (~1244) | Dispatch completes | `logFlightDispatch(userId, {...})` |
| 2 | `land_flight_` collector, auto-approve branch (~1603) | AI approved | `logFlightResolution(userId, {status:'LANDED_AI', flightsAwarded, proofUrl, aiReasoning})` |
| 3 | `approve_flight_` button (~1833) | Manual approve | `logFlightResolution(userId, {status:'LANDED_MANUAL', flightsAwarded, proofUrl, reviewedBy})` |
| 4 | `deny_reason_modal_` submit (~1943) | Manual deny | `logFlightResolution(userId, {status:'DENIED', denialReason, reviewedBy})` |
| 5 | `cancel_flight_self_` button (~1441) | Self-cancel | `logFlightResolution(userId, {status:'CANCELLED'})` |
| 6 | `/cancelflight` command (~684) | Staff cancel | `logFlightResolution(userId, {status:'CANCELLED'})` |

Notes on available data at each point:
- **Dispatch:** all six dispatch fields are in scope (`callsign`, `aircraft`,
  `route.departure`, `route.arrival`, `routeId`, and the haul type carried via
  the `dispatch_haul_type` → `dispatch_route` → `dispatch_aircraft` →
  `dispatch_callsign` cascade — haul type must be threaded into the final
  `dispatch_callsign` handler, currently it is not passed through).
- **AI auto-approve:** `proofUrl`, `aiReasoning`, `flightsToAward`, `callsign`,
  `aircraft`, `dep`, `arr` are all in scope.
- **Manual approve/deny:** `reviewedBy = interaction.user.id`. Proof URL lives
  on the embed image (`interaction.message.embeds[0].image.url`).
- **Cancels:** only `status` is set; existing fields stay as captured at dispatch.

### Threading the haul type

The dispatch cascade currently drops the haul type after step 1. To populate
`haulType` in the log, either:
- (a) re-fetch the route via `ROUTES.find(...)` in the final
  `dispatch_callsign` handler and read `route.type`, **or**
- (b) stash the haul type in the customId chain.
Approach (a) is cleaner — `route` is already loaded in that handler — so the
spec adopts (a): `const haulType = route.type;` derived from the already-fetched
route object.

## 6. `/sync` B787 Fix (`index.js:524-592`)

The current `/sync` reconstructs a pilot's `unlockedPlanes` array with hardcoded
tier logic that predates B787. Specifically the `flightCount >= 60` block only
preserves `A350`, `A330`, `B777F` (and its fallback pushes `A350`), so B787 is
dropped.

The hardcoded block is fragile and duplicates `config.PROMOTIONS`. The fix
rebuilds `unlockedPlanes` **from `config.PROMOTIONS`** instead of hardcoded
tier logic, while preserving the existing behavior the old code intended:

1. Always start with `['A320neo']` (the cadet plane).
2. For each promotion tier the user qualifies for (by flightCount), preserve
   any plane they already have that appears in that tier's `unlocks`. This
   keeps legitimately-unlocked planes (including B787) without re-granting
   ones they never picked.
3. Preserve `ATR72` if present (special aircraft, not in any tier).
4. De-dup and write back.

**Behavioral changes vs. the old hardcoded logic** (both intentional):

1. A pilot who holds a plane not allowed by any tier they qualify for loses it.
   This matches the old code's intent (sync = "your fleet matches your rank").
2. The old code had **per-tier auto-grant fallbacks**: if a pilot qualified for
   a tier but held none of its planes, it force-pushed a hardcoded default
   (e.g. `A350` at 60 flights, `B747-8` at 150). The config-driven rewrite
   **drops** these fallbacks — it only preserves planes a pilot actually holds.
   Rationale: an unpicked plane reward means the DM select menu is still pending
   and the pilot should answer it; force-granting a default they didn't choose
   is the wrong fix. If this fallback is wanted, it can be added back later as a
   per-tier "first plane in `unlocks`" grant, but that's not in scope here.

Note on the precise bug being fixed: today `oldPlanes.includes('B787')` makes
the condition at line 537 true, but line 538 then pushes `A350` — so a pilot who
picked B787 gets silently **converted to A350** on sync. The rewrite fixes this
because B787 is in `config.PROMOTIONS[60/100].unlocks` and is preserved as-is.

## 7. Promotion-System Channel (`send_promotions.js`)

Update the SFO tier description (currently line 46):

```
- **60 Flight Logs:** Choose your path! Pick your first Type Rating for Medium Haul (`A350`, `A330`) **OR** transition to Cargo (`B777F`).
```

to include B787 as a Medium Haul option:

```
- **60 Flight Logs:** Choose your path! Pick your first Type Rating for Medium Haul (`A350`, `A330`, `B787`) **OR** transition to Cargo (`B777F`).
```

(And the 100-flight checkpoint line, line 47, already says "Medium Haul / Cargo
pool" generically so it covers B787 by implication — left as-is.)

This script is a one-shot: it purges the channel and re-posts the embeds on
each run. No runtime change; the owner re-runs it to refresh the channel.

## 8. Remove the Legacy `/flight-log` Path

Delete the `MessageCreate` handler at `index.js:410-470` (the block gated on
`message.author.id === config.FLIGHT_LOG_BOT_ID` and
`message.interaction.commandName === 'flight-log'`). The entire
`client.on(Events.MessageCreate, ...)` listener can be removed since it has no
other branches.

This path increments flights with **no dispatch event**, so it is incompatible
with the new audit log model. Removing it also removes the only use of
`config.FLIGHT_LOG_BOT_ID`, which can be deleted from `config.js`.

## 9. Files Changed

| File | Change |
|------|--------|
| `db.js` | Create `flight_log` table on startup (in the init IIFE, ~line 18-49); add `logFlightDispatch` + `logFlightResolution` exports |
| `index.js` | Remove the `MessageCreate` `/flight-log` handler (410-470); add 6 log wire points; rewrite the `/sync` plane logic (524-592) to derive from `config.PROMOTIONS` |
| `config.js` | Remove the now-unused `FLIGHT_LOG_BOT_ID` entry (line 3) |
| `send_promotions.js` | Add B787 to the 60-flight Medium Haul description (line 46) |

No new dependencies. No schema migration needed — the table is created with
`CREATE TABLE IF NOT EXISTS` on startup, and existing users/active_flights are
untouched.

## 10. Out of Scope

- No query/viewing command for the audit log in this pass (a future
  `/flight-history` command could query it). The log is written-only for now.
- No retention/pruning. The table grows indefinitely; at vBA's scale this is
  fine for the foreseeable future.
- `send_routes.js` already lists B787 in the Medium-Haul fleet title (done in
  `3f3bf46`) — not touched here.
- The `refactor*.js` and one-off migration scripts are not loaded at runtime
  and are left untouched.
