# restOrder — Live Coding Exercise

A Node.js/Express + Socket.io backend for a restaurant order management system.
Your job is to implement the four tasks below inside **`server.js`**.
The complete reference implementation lives in `server_solution.js`.

---

## Running the project

```bash
# Install server dependencies
npm install

# Run server only (uses server_solution.js)
npm run server

# Run client only
npm run client

# Run both together
npm run dev
```

Server starts on **http://localhost:4001**.

---

## Tasks

### Task 1 — Wait-time Estimation

**Function:** `getEstimatedWait()` ([server.js:57](server.js#L57))

Calculate the estimated wait time in minutes across all active orders.

| Status      | Cost per item |
|-------------|--------------|
| `pending`   | 5 min        |
| `preparing` | 3 min        |

Sum both groups and return the total.

**Example:** 2 pending orders with 3 items each + 1 preparing order with 2 items
→ `(6 × 5) + (2 × 3) = 36` minutes

---

### Task 2 — Activity Feed

**Objects/function:** `activityMessages`, `addActivity()` ([server.js:40](server.js#L40))

Build the activity feed infrastructure used by every other task.

**`activityMessages`** — map of message factory functions:

| Key         | Message format                                          |
|-------------|---------------------------------------------------------|
| `created`   | `Order #<id> placed — Table <table> (<items joined>)`   |
| `preparing` | `Order #<id> is now being prepared`                     |
| `ready`     | `Order #<id> is ready!`                                 |

**`addActivity(type, order)`** — creates and stores one activity entry:

```js
{
  id,        // auto-increment from nextActivityId
  type,      // 'created' | 'preparing' | 'ready'
  orderId,   // order.id
  message,   // activityMessages[type](order)
  timestamp, // new Date().toISOString()
}
```

Push the activity into the `activities` array and return it.

---

### Task 3 — Create Order

**Endpoint:** `POST /api/orders` ([server.js:88](server.js#L88))

| Step | Detail |
|------|--------|
| **Input** | `{ items: string[], table?: string\|number }` |
| **Validate** | 400 if `items` is missing or empty |
| **Validate** | 400 if any item is not a non-empty string |
| **Create** | `{ id, items, table, status: "pending", createdAt }` — store in `orders` |
| **Side effects** | Call `addActivity('created', order)`, then emit `io.emit('order:created', { order, estimatedWait, activity })` |
| **Response** | `201` → `{ order, estimatedWait: getEstimatedWait() }` |

**Bonus (optional)**
- Trim whitespace from item names
- Store items as `[{ name: string }]` internally
- Reject any unknown fields in the request body (400)

---

### Task 4 — Update Order Status

**Endpoint:** `PATCH /api/orders/:id/status` ([server.js:114](server.js#L114))

| Step | Detail |
|------|--------|
| **Input** | `{ status: "pending" \| "preparing" \| "ready" }` |
| **Validate** | 404 if order not found |
| **Validate** | 400 if `body.status` is missing or not one of the valid values |
| **Transitions** | Only `pending → preparing → ready` are allowed |
| **Skip guard** | Skipping states (e.g. `pending → ready`) returns 409 **unless** `?force=true` is in the query string |
| **Idempotent** | If already in the requested status, return 200 with the unchanged order |
| **Conflict** | Any other invalid transition returns 409 |
| **Side effects** | Update `order.status`, call `addActivity(newStatus, order)`, emit `io.emit('order:updated', { order, estimatedWait, activity })` |
| **Response** | `200` → `{ order }` |

---

## Data shapes

```js
// Order
{
  id: number,
  items: string[],   // e.g. ["Burger", "Cola"]
  table: string,     // e.g. "3" or "N/A"
  status: "pending" | "preparing" | "ready",
  createdAt: string, // ISO 8601
}

// Activity
{
  id: number,
  type: "created" | "preparing" | "ready",
  orderId: number,
  message: string,
  timestamp: string, // ISO 8601
}
```

---

## Socket events

| Event           | Direction      | Payload                                     |
|-----------------|----------------|---------------------------------------------|
| `orders:init`   | server → client | `{ orders, estimatedWait, activities }`    |
| `order:created` | server → client | `{ order, estimatedWait, activity }`        |
| `order:updated` | server → client | `{ order, estimatedWait, activity }`        |
