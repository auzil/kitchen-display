# Kitchen Display — Live Coding Exercise

A fullstack restaurant kitchen display built with **Express + ws** (backend) and **React + Vite** (frontend).

Your job is to implement the tasks below inside **`server.js`** and **`client/src/App.jsx`**.
`// Task X:` comments are already placed in both files to guide you.

**Order states:** `pending` → `preparing` → `ready`

---

## Running the project

```bash
# Install server dependencies
npm install

# Install client dependencies
cd client && npm install && cd ..

# Run both server and client together
npm run dev
```

Server: **http://localhost:4001** · Client: **http://localhost:5173**

---

## What's already implemented

### Backend (`server.js`)

| | What's done |
|-|-------------|
| `getEstimatedWait()` | pending items × 5 min + preparing items × 3 min |
| `addActivity(type, order)` | creates and stores an activity feed entry |
| `POST /api/orders` | validates items, creates order, emits `order:created` |
| `PATCH /api/orders/:id/status` | advances `pending → preparing → ready`, emits `order:updated` |

### Frontend (`client/src/App.jsx`)

| | What's done |
|-|-------------|
| `OrderCard` | shows order id, table, items, time, advance button |
| `OrderForm` | comma-separated items + table input, POST on submit |
| `ActivityFeed` | reverse-chronological activity list |
| `orders:init` handler | sets orders, estimatedWait, activities |
| `order:created` handler | appends new order and activity |
| `order:updated` handler | replaces updated order and appends activity |
| `createOrder` | `POST /api/orders` |
| `advanceOrder` | `PATCH /api/orders/:id/status` |

---

## Tasks

---

### Task 0 — Send State on Connection

**Difficulty:** Easy · **Files:** `server.js`

Inside `wss.on('connection')`, send `orders:init` to the newly connected WebSocket client with the current server state.

**Payload:**

| Field | Value |
|-------|-------|
| `orders` | the current orders array |
| `estimatedWait` | result of `getEstimatedWait()` |
| `activities` | the current activities array |

---

### Task A — Order Priority / Urgent Bumping

**Difficulty:** Medium · **Files:** `server.js`, `App.jsx`

#### Backend

1. Add `priority: 'normal'` to the order object created in `POST /api/orders`.

2. New endpoint: `PATCH /api/orders/:id/priority`

   | Rule | Detail |
   |------|--------|
   | Body | `{ priority: 'urgent' \| 'normal' }` |
   | 404 | order not found |
   | 400 | `priority` missing or not one of the two allowed values |
   | 400 | `order.status === 'ready'` — can't reprioritize a finished order |
   | Idempotent | if already at the requested priority, return `200` unchanged |
   | Emit | `broadcast('order:priority', { order })` |
   | Response | `200 { order }` |

#### Frontend

1. Handle `order:priority` WebSocket message — replace the updated order in state.
2. Add `togglePriority(id, currentPriority)` — PATCHes the priority endpoint, toggling between `'urgent'` and `'normal'`.
3. Sort each column so urgent orders appear first.
4. In `OrderCard`: show an `URGENT` badge and a toggle button when `priority === 'urgent'`.

---

### Task B — Kitchen Broadcast Notes Board

**Difficulty:** Medium · **Files:** `server.js`, `App.jsx`

#### Backend

1. Add at module level: `let kitchenNotes = [];` and `let nextNoteId = 1;`

2. New endpoint: `POST /api/kitchen/notes`

   | Rule | Detail |
   |------|--------|
   | Body | `{ text: string }` |
   | 400 | `text` missing, not a string, or empty after trim |
   | 400 | `text.length > 500` |
   | Create | `{ id: nextNoteId++, text: text.trim(), createdAt: new Date().toISOString(), author: 'Kitchen' }` |
   | Emit | `broadcast('kitchen:note:added', { note })` |
   | Response | `201 { note }` |

3. New endpoint: `DELETE /api/kitchen/notes/:id`

   | Rule | Detail |
   |------|--------|
   | 404 | note not found |
   | Emit | `broadcast('kitchen:note:removed', { noteId: Number(req.params.id) })` |
   | Response | `204` — **no body**, do not call `res.json()` |

4. Extend `orders:init` to also include `kitchenNotes` in the payload.

#### Frontend

1. Add `kitchenNotes` state.
2. Extend `orders:init` handler to set `kitchenNotes`.
3. Handle `kitchen:note:added` (prepend) and `kitchen:note:removed` (filter) WebSocket messages.
4. Add `postNote(text)` and `deleteNote(id)` functions.
5. Add a `KitchenNotesBoard` component with a form to post notes and a list to display/delete them.

> **204 trap:** calling `.json()` on a 204 response throws — don't do it in `deleteNote`.

---

### Task C — Reconnection State Recovery

**Difficulty:** Medium · **Files:** `App.jsx` only

No backend changes needed — `wss.on('connection')` already sends `orders:init`, so every reconnect automatically triggers a full state push.

#### Frontend

1. Add `connected` state, initialized from `ws.readyState === WebSocket.OPEN` (not hardcoded `false`).
2. Inside `useEffect`, handle `ws.onopen` / `ws.onclose` to update `connected`; the existing cleanup (`ws.close()`) handles teardown.
3. The existing `orders:init` handler already restores full state on reconnect — no REST call needed.
4. Show a connection badge in the header:

   ```jsx
   <span className={`conn-badge ${connected ? 'live' : 'reconnecting'}`}>
     {connected ? '● Live' : '● Reconnecting…'}
   </span>
   ```

   ```css
   /* App.css */
   .conn-badge.live         { color: #2ecc71; }
   .conn-badge.reconnecting { color: #f0a500; }
   ```

---

## Data shapes

```js
// Order
{
  id: number,
  items: string[],
  table: string,
  status: 'pending' | 'preparing' | 'ready',
  priority: 'normal' | 'urgent',   // added in Task A
  createdAt: string,               // ISO 8601
}

// Activity
{
  id: number,
  type: 'created' | 'preparing' | 'ready',
  orderId: number,
  message: string,
  timestamp: string,               // ISO 8601
}

// KitchenNote (added in Task B)
{
  id: number,
  text: string,
  author: string,
  createdAt: string,               // ISO 8601
}
```

---

## WebSocket events

Messages are JSON-encoded as `{ event, data }`. The client reads them via `ws.onmessage` and the server sends them via `broadcast(event, data)`.

| Event | Direction | Payload |
|-------|-----------|---------|
| `orders:init` | server → client | `{ orders, estimatedWait, activities, kitchenNotes }` |
| `order:created` | server → client | `{ order, estimatedWait, activity }` |
| `order:updated` | server → client | `{ order, estimatedWait, activity }` |
| `order:priority` | server → client | `{ order }` |
| `kitchen:note:added` | server → client | `{ note }` |
| `kitchen:note:removed` | server → client | `{ noteId }` |
