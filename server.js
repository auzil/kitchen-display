const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// In-memory order store
let orders = [];
let nextId = 1;

// Activity feed
let activities = [];
let nextActivityId = 1;

/**
 * LIVE CODING TASK #2: Activity Feed
 *
 * Requirements:
 * 1) Define activityMessages map with three keys:
 *    - created:   (o) => human-readable string when an order is placed
 *                        e.g. "Order #1 placed — Table 3 (Burger, Cola)"
 *    - preparing: (o) => string when order moves to preparing
 *    - ready:     (o) => string when order is ready
 * 2) Implement addActivity(type, order):
 *    - Build an activity object: { id, type, orderId, message, timestamp }
 *      - id: nextActivityId++ (auto-increment)
 *      - message: call activityMessages[type](order)
 *      - timestamp: ISO string
 *    - Push the activity to the `activities` array
 *    - Return the activity
 */
const activityMessages = {
  // TODO: created, preparing, ready
};

function addActivity(type, order) {
  // TODO: implement per requirements above
}


/**
 * Calculate estimated wait time (minutes) based on queue
 * LIVE CODING TASK #1:
 * Wait-time estimation:
 *   - Should consider number of items per order.
 *   - Pending: 5 min per item, preparing: 3 min per item.
 *   Return estimate.
 */
function getEstimatedWait() {

}

/**
 * LIVE CODING TASK:
 * Implement order creation with validation + consistent responses.
 *
 * Requirements:
 * 1) Endpoint: POST /api/orders
 * 2) Input body:
 *    - items: required array of strings (e.g. ["Burger", "Cola"])
 *    - table: optional string|number (if missing, store "N/A")
 * 3) Validation:
 *    - 400 if items missing/empty
 *    - 400 if any item is invalid (empty string, not a string, etc.)
 * 4) Creation:
 *    - Create an order object:
 *        { id, items, table, status: "pending", createdAt }
 *    - Store it in `orders` (in-memory)
 * 5) Side effects:
 *    - Call addActivity('created', order) → returns the new activity
 *    - Emit: io.emit('order:created', { order, estimatedWait: getEstimatedWait(), activity })
 * 6) Response:
 *    - 201 with: { order, estimatedWait: getEstimatedWait() }
 *
 * Bonus:
 * - Normalize items (trim names)
 * - Store items internally in one normalized format: [{ name: string }]
 * - Reject unknown fields in the body
 */
app.post('/api/orders', (req, res) => {
  // TODO: implement per requirements above
});


/**
 * LIVE CODING TASK:
 * Implement order status updates with explicit target status + transition validation.
 *
 * Requirements:
 * 1) Endpoint: PATCH /api/orders/:id/status
 * 2) Input: { status: "pending" | "preparing" | "ready" }   (required)
 * 3) Validation:
 *    - 404 if order not found
 *    - 400 if body.status is missing/invalid
 *    - Allowed transitions: pending -> preparing -> ready
 *    - No skipping states (pending -> ready) unless ?force=true
 *    - If already in requested status, return 200 (idempotent) with the order unchanged
 *    - For invalid transition return 409 Conflict
 * 4) Side effects:
 *    - Update order.status
 *    - Call addActivity(newStatus, order) → returns the new activity
 *    - Emit: io.emit('order:updated', { order, estimatedWait: getEstimatedWait(), activity })
 * 5) Response:
 *    - res.json({ order })
 **/
app.patch('/api/orders/:id/status', (req, res) => {
  // TODO: implement per requirements above
});

// Socket.io: send current state on connect
io.on('connection', (socket) => {
  socket.emit('orders:init', { orders, estimatedWait: getEstimatedWait(), activities });
});

const PORT = process.env.PORT || 4001;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
