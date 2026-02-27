# Kitchen Display — Live Coding Interview

A real-time kitchen order management system used as a live coding challenge for fullstack developers.

---

## Architecture

```
client/          React + Vite SPA
  src/
    App.jsx      All UI components (Toast, OrderCard, OrderForm, ActivityFeed, App)
    App.css

server.js        Express + ws server (in-memory state, no database)
```

### Communication

- **REST** — order creation and status transitions
- **WebSocket** (`/ws`) — real-time broadcast of all state changes to every connected client

### In-memory state

| Store | Shape | Description |
|---|---|---|
| `orders` | `{ id, items, tableNum, status, createdAt, noteIds }` | All orders |
| `activities` | `{ id, type, orderId, message, timestamp }` | Activity log entries |
| `kitchenNotes` | `{ id, text, author, orderId, createdAt }` | General kitchen board notes |

### Order lifecycle

```
pending → preparing → ready
```

### REST endpoints (implemented)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/orders` | Place a new order |
| `PATCH` | `/api/orders/:id/status` | Advance order to next status |
| `POST` | `/api/reset` | Clear all in-memory state |

### WebSocket events

| Event | Direction | Payload |
|---|---|---|
| `orders:init` | server → client | `{ orders, estimatedWait, activities, kitchenNotes }` |
| `order:created` | server → client | `{ order, estimatedWait, activity }` |
| `order:updated` | server → client | `{ order, estimatedWait, activity }` |

---

## Interview Tasks

Recommended order: **Task 0 → Task A → Task B → Task C**

The candidate is expected to design appropriate HTTP status codes for all new endpoints on their own.

---

### Task 0 — Send State on Connection

**As a kitchen staff member opening the display on any screen, I want to immediately see all current orders and activity so that I'm up to date without refreshing.**

- When a client connects via WebSocket, the server sends `orders:init` with the current state
- Payload: `{ orders, estimatedWait, activities }`

_Already scaffolded — verify it works before moving on._

---

### Task A — Order Notes _(Priority 1)_

**As a kitchen staff member, I want to attach quick notes to a specific order so that I can communicate special instructions or updates to my colleagues on every screen.**

- Each order card has an "Add a note…" input at the bottom
- Submitting a note adds it to the card immediately: shows text, author (`Kitchen`), timestamp, and a ✕ delete button
- All connected screens see notes appear and disappear in real time via WebSocket broadcast
- Notes on a `ready` order **cannot be deleted** — the server returns an error, the UI shows a toast
- Notes survive a WebSocket reconnection — they are restored as part of `orders:init`
- Maximum note length: 500 characters, enforced on both client and server

**New endpoints the candidate must implement (HTTP codes are theirs to decide):**

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/orders/:orderId/notes` | Add a note to an order |
| `DELETE` | `/api/orders/:orderId/notes/:noteId` | Delete a note (blocked if order is `ready`) |

`DELETE` responds with no body.

---

### Task B — General Kitchen Notes Board _(Priority 2)_

**As a kitchen staff member, I want a shared announcement board at the top of the display so that I can post general notes visible to everyone in the kitchen instantly.**

- A board at the top of the display lets staff post free-text notes
- Notes appear instantly on all screens, newest first
- General notes show a ✕ delete button; notes linked to an order are read-only and show an `Order #N` badge
- Board state survives reconnection — restored on `orders:init`
- Maximum note length: 500 characters, enforced on both client and server

**New endpoints the candidate must implement (HTTP codes are theirs to decide):**

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/kitchen/notes` | Post a general kitchen note |
| `DELETE` | `/api/kitchen/notes/:id` | Delete a general kitchen note |

`DELETE` responds with no body (do not call `.json()` on the response client-side).

The `KitchenNotesBoard` component is stubbed in `App.jsx` — candidate fills it in.

---

### Task C — WebSocket Reconnection _(Priority 3)_

**As a kitchen staff member, I want the display to recover silently if the connection drops so that I never need to manually refresh the page.**

- A `● Live` / `● Reconnecting…` badge appears in the header reflecting connection state
- On reconnect, full state is restored via the existing `orders:init` event — no extra REST calls needed
- The server requires no changes

Reconnection logic goes in the `useEffect` in `App.jsx` where the comment `// Task C` appears.

---

## Running Locally

```bash
# Install dependencies
npm install

# Server (port 4001)
npm run server

# Client (port 5173, proxies /api and /ws to 4001)
npm run client

# Both together
npm run dev
```
