# Kitchen Display — Live Coding Interview Tasks

This app is a restaurant kitchen display system used for fullstack Node.js developer interviews.

**Stack:** Express + Socket.io (backend) · React + Vite (frontend)
**Order states:** `pending` → `preparing` → `ready`

---

## Existing Code (already implemented in `server.js` and `App.jsx`)

### Backend (`server.js`)

| # | What's implemented |
|---|--------------------|
| 1 | `getEstimatedWait()` — pending items × 5 min + preparing items × 3 min |
| 2 | `addActivity(type, order)` + `activityMessages` map — activity feed entries |
| 3 | `POST /api/orders` — validates `items`, creates order (`id`, `items`, `table`, `status: 'pending'`, `createdAt`), emits `order:created` |
| 4 | `PATCH /api/orders/:id/status` — transitions `pending → preparing → ready`, returns **400** if already completed, emits `order:updated` |
| 5 | ~~`io.on('connection')` — emits `orders:init` with `{ orders, estimatedWait, activities }` on socket connect~~ |

### Frontend (`App.jsx`)

| # | What's implemented |
|---|--------------------|
| 1 | `OrderCard` component — shows order id, table, items, time, advance button |
| 2 | `OrderForm` component — comma-separated items input, table input, POST on submit |
| 3 | `ActivityFeed` component — reverse-chronological activity list |
| 4 | `orders:init` socket handler — sets orders, estimatedWait, activities |
| 5 | `order:created` socket handler — appends new order and activity |
| 6 | `order:updated` socket handler — replaces updated order and appends activity |
| 7 | `createOrder` — `POST /api/orders` |
| 8 | `advanceOrder` — `PATCH /api/orders/:id/status` |

---

## Tasks to Implement

Each task touches **both** `server.js` and `client/src/App.jsx`. Stubs and `// Task X:` comments are already placed in both files to guide implementation.

---

### Task 0 — Send State on Connection

**Difficulty:** Easy
**Estimated time:** 5 min

#### Backend (`server.js`)

Inside `io.on('connection')`, emit `orders:init` to the newly connected socket with the current server state:

```js
io.on('connection', (socket) => {
  socket.emit('orders:init', { orders, estimatedWait: getEstimatedWait(), activities });
});
```

#### What it tests
- Understanding of `socket.emit` (to one client) vs `io.emit` (to all)
- Knowing that `orders:init` must fire on every new connection so late-joining clients get current state

---

### Task A — Order Priority / Urgent Bumping

**Difficulty:** Medium
**Estimated time:** 25 min

#### Backend (`server.js`)

1. Add `priority: 'normal'` to the order object created in `POST /api/orders`

2. New endpoint: `PATCH /api/orders/:id/priority`
   - Body: `{ priority: 'urgent' | 'normal' }`
   - 404 if order not found
   - 400 if `priority` is missing or not one of the two allowed values
   - 400 if `order.status === 'ready'` (can't reprioritize a finished order)
   - Idempotent: if already at the requested priority, return 200 unchanged
   - Update `order.priority`
   - Emit: `io.emit('order:priority', { order })`
   - Respond: `200 { order }`

#### Frontend (`App.jsx`)

1. Handle new socket event:
   ```js
   socket.on('order:priority', (data) => {
     setOrders((prev) => prev.map((o) => o.id === data.order.id ? data.order : o));
   });
   ```

2. New function:
   ```js
   const togglePriority = async (id, currentPriority) => {
     const next = currentPriority === 'urgent' ? 'normal' : 'urgent';
     await fetch(`${API}/orders/${id}/priority`, {
       method: 'PATCH',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ priority: next }),
     });
   };
   ```

3. In each column, sort before rendering so urgent orders float to the top:
   ```js
   const byPriority = (a, b) => (a.priority === 'urgent' ? 0 : 1) - (b.priority === 'urgent' ? 0 : 1);
   const pending = orders.filter((o) => o.status === 'pending').sort(byPriority);
   // same for preparing, ready
   ```

4. In `OrderCard`:
   - Show `<span className="urgent-badge">URGENT</span>` when `order.priority === 'urgent'`
   - Add toggle button: `"Mark Urgent"` / `"Clear Urgent"`
   - Pass `onTogglePriority` prop from `App`

#### What it tests
- Dedicated focused endpoint vs. overloading existing one (separation of concerns)
- Default field initialization retrofitted into existing creation logic
- Derived sort — computed from state, not stored separately
- Idempotency reasoning

#### Discussion questions
1. New event `order:priority` vs. reusing `order:updated` — trade-offs? When would you consolidate?
2. Should `preparing` orders also be blocked from priority changes?
3. Two staff members toggle the same order simultaneously — what inconsistency can arise without a database?

---

### Task B — Kitchen Broadcast Notes Board

**Difficulty:** Medium
**Estimated time:** 25 min

#### Backend (`server.js`)

1. Add at module level (near `orders`):
   ```js
   let kitchenNotes = [];
   let nextNoteId = 1;
   ```

2. New endpoint: `POST /api/kitchen/notes`
   - Body: `{ text: string }`
   - 400 if `text` is missing, not a string, or empty after trim
   - 400 if `text.length > 500`
   - Create: `{ id: nextNoteId++, text: text.trim(), createdAt: new Date().toISOString(), author: 'Kitchen' }`
   - Push to `kitchenNotes`
   - Emit: `io.emit('kitchen:note:added', { note })`
   - Respond: `201 { note }`

3. New endpoint: `DELETE /api/kitchen/notes/:id`
   - 404 if note not found
   - Remove from `kitchenNotes`
   - Emit: `io.emit('kitchen:note:removed', { noteId: Number(req.params.id) })`
   - Respond: **`204`** — no body, do not call `res.json()`

4. Extend the `orders:init` socket emission:
   ```js
   socket.emit('orders:init', { orders, estimatedWait: getEstimatedWait(), activities, kitchenNotes });
   ```

#### Frontend (`App.jsx`)

1. New state:
   ```js
   const [kitchenNotes, setKitchenNotes] = useState([]);
   ```

2. Extend `orders:init` handler:
   ```js
   setKitchenNotes(data.kitchenNotes || []);
   ```

3. Handle new socket events:
   ```js
   socket.on('kitchen:note:added', ({ note }) => {
     setKitchenNotes((prev) => [note, ...prev]); // prepend, newest first
   });
   socket.on('kitchen:note:removed', ({ noteId }) => {
     setKitchenNotes((prev) => prev.filter((n) => n.id !== noteId));
   });
   ```

4. New functions:
   ```js
   const postNote = async (text) => {
     await fetch(`${API}/kitchen/notes`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ text }),
     });
   };
   const deleteNote = async (id) => {
     await fetch(`${API}/kitchen/notes/${id}`, { method: 'DELETE' });
     // ⚠️ Do NOT call .json() — 204 has no body
   };
   ```

5. New `KitchenNotesBoard` component (self-contained form state):
   ```jsx
   function KitchenNotesBoard({ notes, onPost, onDelete }) {
     const [text, setText] = useState('');
     const handleSubmit = (e) => {
       e.preventDefault();
       if (!text.trim()) return;
       onPost(text.trim());
       setText('');
     };
     return (
       <div className="kitchen-notes-board">
         <h2>Kitchen Board</h2>
         <form className="kitchen-notes-form" onSubmit={handleSubmit}>
           <textarea value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Post a note..." />
           <button type="submit">Post</button>
         </form>
         <ul>
           {notes.map((n) => (
             <li key={n.id} className="kitchen-note-item">
               <div className="kitchen-note-text">
                 {n.text}
                 <div className="kitchen-note-meta">{new Date(n.createdAt).toLocaleTimeString()}</div>
               </div>
               <button onClick={() => onDelete(n.id)}>✕</button>
             </li>
           ))}
         </ul>
       </div>
     );
   }
   ```

#### What it tests
- Full CRUD on a secondary resource without polluting the order domain
- Additive, backward-compatible extension of the `orders:init` payload
- Two-direction socket state sync: prepend on add, filter on remove
- **204 trap:** calling `.json()` on a no-body response throws — candidate must know not to
- Self-contained form state inside a child component

#### Discussion questions
1. The `orders:init` payload grows with each new resource. What architectural pattern would you introduce to avoid an ever-growing init blob?
2. `author: 'Kitchen'` is hardcoded — minimum changes to support named authors? How does the socket event design change?
3. Manager wants notes persisted across server restarts but is fine losing orders. How do you add persistence for only notes without a full database?

---

### Task C — Reconnection State Recovery

**Difficulty:** Medium
**Estimated time:** 20 min

#### Backend (`server.js`)

No changes needed beyond what Task B already adds. The `io.on('connection')` handler already emits `orders:init`; after Task B extends it with `kitchenNotes`, the payload is complete:

```js
io.on('connection', (socket) => {
  socket.emit('orders:init', {
    orders,
    estimatedWait: getEstimatedWait(),
    activities,
    kitchenNotes, // added in Task B
  });
});
```

No REST endpoint needed for recovery — the socket push is the source of truth.

#### Frontend (`App.jsx`)

1. New state — initialize from the **live** socket property, not a hardcoded value:
   ```js
   const [connected, setConnected] = useState(socket.connected);
   ```

2. Add to `useEffect` (alongside existing socket handlers):
   ```js
   // Server sends 'orders:init' on every connection, so the existing
   // handler already restores full state on reconnect automatically.
   socket.on('connect', () => setConnected(true));
   socket.on('disconnect', () => setConnected(false));
   ```
   Clean up in the return:
   ```js
   socket.off('connect');
   socket.off('disconnect');
   ```

3. The existing `orders:init` handler (already in `App.jsx`, extended in Task B) handles recovery automatically — no separate REST call needed:
   ```js
   socket.on('orders:init', (data) => {
     setOrders(data.orders);
     setEstimatedWait(data.estimatedWait);
     setActivities(data.activities || []);
     setKitchenNotes(data.kitchenNotes || []); // from Task B
   });
   ```

4. Connection badge in the header:
   ```jsx
   <span className={`conn-badge ${connected ? 'live' : 'reconnecting'}`}>
     {connected ? '● Live' : '● Reconnecting…'}
   </span>
   ```
   CSS (add to `App.css`):
   ```css
   .conn-badge.live         { color: #2ecc71; }
   .conn-badge.reconnecting { color: #f0a500; }
   ```

#### Key insight
Because the server emits `orders:init` inside `io.on('connection')`, every reconnect automatically triggers a full state push — no explicit REST recovery call is needed on the client. The `connect` handler only needs to update the connection badge. This keeps recovery logic in one place (the server) rather than split across client REST calls and socket events.

#### What it tests
- Socket.io event lifecycle: `connect` fires on both first connect AND reconnect (Socket.io v3 removed the separate `reconnect` event)
- Server-push as source of truth — understanding that `orders:init` on `connection` is already idempotent recovery
- `useState(socket.connected)` — initializing from a live external property, not a hardcoded `false` (avoids flicker)
- `useEffect` cleanup for non-React subscriptions
- Recognizing that adding a REST fallback would duplicate recovery logic unnecessarily

#### Discussion questions
1. Socket.io v3 removed the `reconnect` event — `connect` fires on both first connection and reconnects. How would you distinguish them if you needed to run different logic for each?
2. Server goes down for 30 seconds; 20 orders are created by another terminal via REST. Walk through exactly what happens on this client when the socket reconnects.
3. User had a multi-select open when the reconnect happens. `orders:init` replaces all state. How would you preserve ephemeral UI state across the state refresh?
4. The server-push approach means recovery only works while the socket is available. When would a REST fallback still be valuable despite the duplication?

---

## Suggested Session Plans

| Session | Tasks | Focus |
|---------|-------|-------|
| Balanced senior | A → B | Priority + notes board |
| Full assessment | A + B + C | Priority, kitchen board, reconnection |
| Warm-up first | C → A | Reliability thinking, then UX feature |

---

## Evaluation Dimensions

| Skill | Tasks |
|-------|-------|
| Express routing & HTTP status codes | A, B, C |
| In-memory data manipulation | A, B, C |
| Socket.io event design | A, B, C |
| React `useState` / `useEffect` patterns | A, B, C |
| Local vs. global component state | B |
| 204 / no-body response handling | B |
| Custom hook / component decomposition | A, B |
| Real-time reliability & REST fallback | C |
| Idempotency reasoning | A, C |
