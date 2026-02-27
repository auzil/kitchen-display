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

## Task A — Kitchen Broadcast Notes Board

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
