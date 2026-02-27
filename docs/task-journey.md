# Kitchen Display — Interview Tasks

**Stack:** Express + ws · React + Vite
**Order states:** `pending` → `preparing` → `ready`

**Recommended order:** Task 0 → Task A → Task B → Task C

---

## Task 0 — Send State on Connection

When a client connects via WebSocket, send them the current state.

**Payload:** `{ orders, estimatedWait, activities }`

---

## Task A — Order Notes (Priority 1)

Staff need to attach notes to individual orders.

- Each order card has an "Add a note…" input at the bottom
- Notes appear on the card immediately: text, author (`Kitchen`), timestamp, ✕ delete button
- All connected screens see notes appear and disappear in real time
- Notes on a `ready` order cannot be deleted — server returns `403`, UI shows a toast
- Notes survive reconnection — restored as part of `orders:init`
- Max note length: 500 characters (enforced on client and server)
- `DELETE /api/orders/:orderId/notes/:noteId` responds `204` — no body

---

## Task B — General Kitchen Notes Board (Priority 2)

Staff need a shared board for broadcast kitchen announcements.

- A board at the top of the display lets staff post free-text notes
- Notes appear instantly on all screens, newest first
- General notes can be deleted with ✕; order-linked notes appear read-only with an `Order #N` badge
- Board state survives reconnection — restored on `orders:init`
- Max note length: 500 characters (enforced on client and server)
- `DELETE /api/kitchen/notes/:id` responds `204` — no body (do not call `.json()`)

---

## Task C — Reconnection

When the WebSocket drops and reconnects, the display should recover silently.

- Show a `● Live` / `● Reconnecting…` badge in the header
- Full state is restored on reconnect — no extra REST calls needed
- Backend requires no changes: `orders:init` on `connection` already handles recovery
