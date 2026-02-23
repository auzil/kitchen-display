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

// Task B: add kitchenNotes store here
// let kitchenNotes = [];
// let nextNoteId = 1;

const activityMessages = {
  created: (o) => `Order #${o.id} placed — Table ${o.table} (${o.items.join(', ')})`,
  preparing: (o) => `Order #${o.id} is now being prepared`,
  ready: (o) => `Order #${o.id} is ready!`,
};

function addActivity(type, order) {
  const activity = {
    id: nextActivityId++,
    type,
    orderId: order.id,
    message: activityMessages[type](order),
    timestamp: new Date().toISOString(),
  };
  activities.push(activity);
  return activity;
}

function getEstimatedWait() {
  const pending = orders.filter((o) => o.status === 'pending');
  const pendingItemsCount = pending.reduce((acc, item) => {
    return acc += item.items.length;
  }, 0);

  const preparing = orders.filter((o) => o.status === 'preparing');
  const preparingItemsCount = preparing.reduce((acc, item) => {
    return acc += item.items.length;
  }, 0);

  return pendingItemsCount * 5 + preparingItemsCount * 3;
}

// REST: Create order
app.post('/api/orders', (req, res) => {
  const { items, table } = req.body;
  if (!items || !items.length) {
    return res.status(400).json({ error: 'Items are required' });
  }

  const order = {
    id: nextId++,
    items,
    table: table || 'N/A',
    status: 'pending',
    // Task A: add priority field with default value 'normal'
    createdAt: new Date().toISOString(),
  };

  orders.push(order);
  const createdActivity = addActivity('created', order);
  io.emit('order:created', { order, estimatedWait: getEstimatedWait(), activity: createdActivity });
  res.status(201).json({ order, estimatedWait: getEstimatedWait() });
});

// REST: Update order status (pending → preparing → ready)
app.patch('/api/orders/:id/status', (req, res) => {
  const order = orders.find((o) => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const flow = { pending: 'preparing', preparing: 'ready' };
  const next = flow[order.status];
  if (!next) return res.status(400).json({ error: 'Order already completed' });

  order.status = next;
  const updatedActivity = addActivity(next, order);
  io.emit('order:updated', { order, estimatedWait: getEstimatedWait(), activity: updatedActivity });
  res.json({ order });
});

// Task A: PATCH /api/orders/:id/priority
// - 404 if order not found
// - 400 if priority is missing or not 'urgent' | 'normal'
// - 400 if order.status === 'ready' (can't reprioritize a finished order)
// - Idempotent: if already at the requested priority, return 200 unchanged
// - Update order.priority
// - Emit: io.emit('order:priority', { order })
// - Respond: 200 { order }

// Task B: POST /api/kitchen/notes
// - 400 if text is missing, not a string, or empty after trim
// - 400 if text.length > 500
// - Create: { id: nextNoteId++, text: text.trim(), createdAt: new Date().toISOString(), author: 'Kitchen' }
// - Push to kitchenNotes
// - Emit: io.emit('kitchen:note:added', { note })
// - Respond: 201 { note }

// Task B: DELETE /api/kitchen/notes/:id
// - 404 if note not found
// - Remove from kitchenNotes
// - Emit: io.emit('kitchen:note:removed', { noteId: Number(req.params.id) })
// - Respond: 204 — no body, do not call res.json()

// Task: Socket.io — on every new connection, emit 'orders:init' with current state
io.on('connection', (socket) => {
  // Task 0: emit 'orders:init' with { orders, estimatedWait, activities }
});

const PORT = process.env.PORT || 4001;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
