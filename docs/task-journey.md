# Kitchen Display — Interview Tasks

**Stack:** Express + ws · React + Vite
**Order states:** `pending` → `preparing` → `ready`

**Recommended order:** Task 0 → Task A → Task C

---

## Task 0 — Send State on Connection

When a client connects via WebSocket, send them the current state.

**Payload:** `{ orders, estimatedWait, activities }`

---

## Task A — Kitchen Broadcast Notes Board

Staff need a shared board for general kitchen announcements.

- A board at the top of the display lets staff post free-text notes
- Notes appear instantly on all screens, newest first
- Any note can be deleted; it vanishes from all screens in real time
- Board state (via `kitchenNotes`) survives reconnection — restored on `orders:init`
- Max note length: 500 characters (enforced on client and server)
- `DELETE /api/kitchen/notes/:id` responds `204` — no body (do not call `.json()`)

---

## Task C — Reconnection

When the WebSocket drops and reconnects, the display should recover silently.

- Show a `● Live` / `● Reconnecting…` badge in the header
- Full state is restored on reconnect — no extra REST calls needed
- Backend requires no changes: `orders:init` on `connection` already handles recovery
