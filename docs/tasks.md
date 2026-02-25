# Kitchen Display — Tasks

**Stack:** Express + ws (backend) · React + Vite (frontend)
**Order states:** `pending` → `preparing` → `ready`

---

## Task 0 — Send State on Connection

Inside `wss.on('connection')` in `server.js`, send `orders:init` to the newly connected WebSocket client with the current server state.

**Payload:** `{ orders, estimatedWait, activities }`

| Field | Value |
|-------|-------|
| `orders` | the current orders array |
| `estimatedWait` | result of `getEstimatedWait()` |
| `activities` | the current activities array |

---

## Task A — Order Priority / Urgent Bumping

### Backend (`server.js`)

1. Add `priority: 'normal'` to the order object created in `POST /api/orders`

2. New endpoint: `PATCH /api/orders/:id/priority`
   - Body: `{ priority: 'urgent' | 'normal' }`
   - 404 if order not found
   - 400 if `priority` is missing or not one of the two allowed values
   - 400 if `order.status === 'ready'`
   - Idempotent: if already at the requested priority, return 200 unchanged
   - Update `order.priority`
   - Emit: `broadcast('order:priority', { order })`
   - Respond: `200 { order }`

### Frontend (`App.jsx`)

1. Handle `order:priority` WebSocket message — replace the updated order in state
2. Add `togglePriority(id, currentPriority)` function — `PATCH` the priority endpoint
3. Sort each column so urgent orders appear first
4. In `OrderCard`: show an `URGENT` badge and a toggle button when `priority === 'urgent'`

---

## Task B — Kitchen Broadcast Notes Board

### Backend (`server.js`)

1. Add `kitchenNotes` array and `nextNoteId` counter at module level

2. New endpoint: `POST /api/kitchen/notes`
   - 400 if `text` is missing, not a string, or empty after trim
   - 400 if `text.length > 500`
   - Create note with `id`, `text`, `createdAt`, `author: 'Kitchen'`
   - Emit: `broadcast('kitchen:note:added', { note })`
   - Respond: `201 { note }`

3. New endpoint: `DELETE /api/kitchen/notes/:id`
   - 404 if note not found
   - Emit: `broadcast('kitchen:note:removed', { noteId })`
   - Respond: `204` — no body

4. Extend `orders:init` emission to also include `kitchenNotes`

### Frontend (`App.jsx`)

1. Add `kitchenNotes` state
2. Extend `orders:init` handler to set `kitchenNotes`
3. Handle `kitchen:note:added` (prepend) and `kitchen:note:removed` (filter) WebSocket messages
4. Add `postNote(text)` and `deleteNote(id)` functions
5. Add `KitchenNotesBoard` component with a form to post notes and a list to display/delete them

---

## Task C — Reconnection State Recovery

### Backend (`server.js`)

No changes needed — the `wss.on('connection')` handler (Task 0 + Task B) already handles recovery.

### Frontend (`App.jsx`)

1. Add `connected` state, initialized from `ws.readyState === WebSocket.OPEN`
2. Use `ws.onopen` / `ws.onclose` to update `connected` state; the existing cleanup (`ws.close()`) handles teardown
3. The existing `orders:init` handler already restores full state on reconnect — no extra REST call needed
4. Show a connection badge in the header: `● Live` (green) or `● Reconnecting…` (amber)
