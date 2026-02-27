# Notes Functionality — Interview Task

**Stack:** Express + ws (backend) · React + Vite (frontend)

Implement notes in two priority phases. Start with Priority 1 and move to Priority 2 if time allows.

---

## Priority 1 — Order Notes (per-order context)

### User journey

1. Staff views an order card in any column (Pending / Preparing / Ready).
2. Staff types a note in the "Add a note…" input at the bottom of the card and submits.
3. The note appears immediately on the card showing: text, author (`Kitchen`), timestamp, and a delete (✕) button.
4. All other connected screens see the note appear on the same order card in real time.
5. Staff clicks ✕ to delete a note — it disappears from all screens instantly.
6. **Constraint:** notes on a `ready` order cannot be deleted — the server must reject with `403` and the UI must show the error.
7. On reconnect or new connection, order notes are restored as part of `orders:init`.

### Backend (`server.js`)

1. Add `noteIds: []` to the order object created in `POST /api/orders`

2. Add `kitchenNotes` array and `noteIdCounter` at module level

3. New endpoint: `POST /api/kitchen/notes`
   - Body: `{ text, orderId }`
   - 400 if `text` is missing, not a string, or empty after trim
   - 400 if `text.length > 500`
   - 404 if `orderId` is provided but the order is not found
   - Create: `{ id: noteIdCounter++, text: text.trim(), author: 'Kitchen', orderId, createdAt: new Date() }`
   - Push note id into `order.noteIds`
   - Emit: `broadcast('kitchen:note:added', { note })`
   - Respond: `201 { note }`

4. New endpoint: `DELETE /api/orders/:orderId/notes/:noteId`
   - 404 if order not found
   - 404 if note not found
   - 403 if `note.orderId !== orderId`
   - 403 if `order.status === 'ready'` — cannot delete notes for a completed order
   - Remove note from `kitchenNotes`, remove id from `order.noteIds`
   - Emit: `broadcast('kitchen:note:removed', { noteId, orderId })`
   - Respond: `204` — no body

5. Extend `orders:init` to include `kitchenNotes`

### Frontend (`App.jsx`)

1. Add `kitchenNotes` state; extend `orders:init` handler to set it

2. Handle WebSocket messages:
   - `kitchen:note:added` → prepend note to `kitchenNotes`
   - `kitchen:note:removed` → filter note from `kitchenNotes`; also filter the id from the matching order's `noteIds`

3. Add `postOrderNote(orderId, text)` — `POST /api/kitchen/notes` with `{ text, orderId }`

4. Add `deleteOrderNote(noteId, orderId)` — `DELETE /api/orders/:orderId/notes/:noteId`
   - On non-ok response read `body.error` and show a toast

5. In `OrderCard`:
   - Accept `orderNotes` prop (notes filtered by `orderId`) and render them below the items list
   - Each note shows text, author, timestamp, and a ✕ delete button (always visible — error is shown via toast when order is ready)
   - Add a note form (input + submit button) that calls `onPostNote(orderId, text)`

6. Pass `orderNotes` and `onPostNote` / `onDeleteNote` props from `App` to each `OrderCard`

### Display rules
- Only notes where `note.orderId === order.id` appear on a card
- Notes appear oldest-first within the card

---

## Priority 2 — General Kitchen Notes (broadcast board)

### User journey

1. Staff sees the Kitchen Notes Board at the top of the display.
2. Staff types a broadcast message (e.g. "Fryer is down — no fries until 14:00") and clicks Post.
3. The note appears at the top of the board immediately and on all connected screens.
4. Notes show: text, author (`Kitchen`), timestamp.
5. Staff can delete any general note with ✕ — it vanishes from all screens.
6. Order-linked notes appear in the board read-only (no delete button) with an `Order #N` badge.
7. On reconnect, the full board is restored from `orders:init`.

### Backend (`server.js`)

1. `POST /api/kitchen/notes` with no `orderId` creates a general note (`orderId: null`)

2. New endpoint: `DELETE /api/kitchen/notes/:id`
   - 404 if note not found
   - 403 if `note.orderId !== null` — order notes can only be deleted via the order endpoint
   - Remove from `kitchenNotes`
   - Emit: `broadcast('kitchen:note:removed', { noteId, orderId: null })`
   - Respond: `204` — **do not call `.json()`**, no body

### Frontend (`App.jsx`)

1. Add `postNote(text)` — `POST /api/kitchen/notes` with `{ text }` only (no `orderId`)

2. Add `deleteNote(id)` — `DELETE /api/kitchen/notes/:id`
   - **Do not call `.json()`** on the response — 204 has no body

3. Add `KitchenNotesBoard` component:
   - Textarea + Post button (self-contained form state, `maxLength={500}`)
   - Renders all `kitchenNotes`:
     - General notes (`orderId == null`): show text, meta, ✕ delete button
     - Order-linked notes (`orderId != null`): show `Order #N` badge, text, meta — no delete button

### Display rules
- Newest notes appear first (prepend on add)
- Max note length: 500 characters (enforce on both client and server)

---

## Key Edge Cases

| Scenario | Expected behaviour |
|----------|--------------------|
| Submit empty note | Blocked client-side; server returns 400 |
| Note > 500 chars | Server returns 400 |
| Delete note on a ready order | Server returns 403; UI shows toast error |
| Delete order note via `DELETE /api/kitchen/notes/:id` | 403 — wrong endpoint |
| Delete general note via `DELETE /api/orders/:id/notes/:noteId` | 403 — wrong endpoint |
| Note posted to non-existent order | 404 |
| Call `.json()` on 204 delete response | Runtime error — must not parse body |
| Two clients connected — one posts a note | Both see `kitchen:note:added` instantly |
| Server restart / reconnect | `orders:init` restores all notes |

---

## Discussion Prompts

**Order notes:**
1. Should deleting an order also cascade-delete its notes? What strategy would you choose?
2. `noteIds` is stored on the order — why keep it there rather than filtering `kitchenNotes` by `orderId` at read time?
3. `order.status === 'ready'` blocks deletes — should `preparing` be blocked too?

**General notes:**
1. `author` is hardcoded to `'Kitchen'` — minimum change to support named authors?
2. Notes accumulate in memory forever — when would you add a TTL or max-count cap?
3. The board mixes general and order notes — would you separate them? Trade-offs?
