const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// In-memory store
let orderIdCounter = 1;
let activityIdCounter = 1;
let noteIdCounter = 1;

const orders = [];       // { id, items, tableNum, status, priority, createdAt, noteIds }
const activities = [];   // { id, type, orderId, message, timestamp }
const kitchenNotes = []; // { id, text, author, orderId, createdAt }

// Broadcast a named event to all connected clients
function broadcast(event, data) {
  const msg = JSON.stringify({ event, data });
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(msg);
    }
  }
}

const activityMessages = {
  created: (o) => `Order #${o.id} placed — Table ${o.tableNum} (${o.items.join(', ')})`,
  preparing: (o) => `Order #${o.id} is now being prepared`,
  ready: (o) => `Order #${o.id} is ready!`,
};

function addActivity(type, order) {
  const activity = {
    id: activityIdCounter++,
    type,
    orderId: order.id,
    message: activityMessages[type](order),
    timestamp: new Date(),
  };
  activities.push(activity);
  return activity;
}

function getEstimatedWait() {
  const pendingItemsCount = orders
    .filter((o) => o.status === 'pending')
    .reduce((acc, o) => acc + o.items.length, 0);
  const preparingItemsCount = orders
    .filter((o) => o.status === 'preparing')
    .reduce((acc, o) => acc + o.items.length, 0);
  return pendingItemsCount * 5 + preparingItemsCount * 3;
}

function serializeOrder(order) {
  return {
    id: order.id,
    items: order.items,
    table: order.tableNum,
    status: order.status,
    priority: order.priority,
    createdAt: order.createdAt,
    noteIds: order.noteIds,
  };
}

// REST: Create order
app.post('/api/orders', (req, res) => {
  const { items, table } = req.body;
  if (!items || !items.length) {
    return res.status(400).json({ error: 'Items are required' });
  }

  const order = {
    id: orderIdCounter++,
    items,
    tableNum: table || 'N/A',
    status: 'pending',
    priority: 'normal',
    createdAt: new Date(),
    noteIds: [],
  };
  orders.push(order);

  const createdActivity = addActivity('created', order);
  const estimatedWait = getEstimatedWait();

  const payload = serializeOrder(order);
  broadcast('order:created', { order: payload, estimatedWait, activity: createdActivity });
  res.status(201).json({ order: payload, estimatedWait });
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
  const estimatedWait = getEstimatedWait();

  const payload = serializeOrder(order);
  broadcast('order:updated', { order: payload, estimatedWait, activity: updatedActivity });
  res.json({ order: payload });
});

// Task A: PATCH /api/orders/:id/priority
// - 404 if order not found
// - 400 if priority is missing or not 'urgent' | 'normal'
// - 400 if order.status === 'ready' (can't reprioritize a finished order)
// - Idempotent: if already at the requested priority, return 200 unchanged
// - Update order.priority
// - Emit: broadcast('order:priority', { order })
// - Respond: 200 { order }

// Task B: POST /api/kitchen/notes
app.post('/api/kitchen/notes', (req, res) => {
  const { text, orderId } = req.body;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }
  if (text.length > 500) {
    return res.status(400).json({ error: 'Text must be 500 characters or fewer' });
  }

  let linkedOrder = null;
  if (orderId != null) {
    linkedOrder = orders.find((o) => o.id === Number(orderId));
    if (!linkedOrder) return res.status(404).json({ error: 'Order not found' });
  }

  const note = {
    id: noteIdCounter++,
    text: text.trim(),
    author: 'Kitchen',
    orderId: linkedOrder ? linkedOrder.id : null,
    createdAt: new Date(),
  };
  kitchenNotes.push(note);

  if (linkedOrder) {
    linkedOrder.noteIds.push(note.id);
  }

  broadcast('kitchen:note:added', { note });
  res.status(201).json({ note });
});

// Task B: DELETE /api/kitchen/notes/:id  (general notes only)
app.delete('/api/kitchen/notes/:id', (req, res) => {
  const noteId = Number(req.params.id);
  const noteIndex = kitchenNotes.findIndex((n) => n.id === noteId);
  if (noteIndex === -1) return res.status(404).json({ error: 'Note not found' });

  const note = kitchenNotes[noteIndex];
  if (note.orderId !== null) {
    return res.status(403).json({ error: 'Order notes can only be deleted from the order' });
  }

  kitchenNotes.splice(noteIndex, 1);
  broadcast('kitchen:note:removed', { noteId, orderId: null });
  res.status(204).end();
});

// DELETE /api/orders/:orderId/notes/:noteId  (order-specific notes)
app.delete('/api/orders/:orderId/notes/:noteId', (req, res) => {
  const orderId = Number(req.params.orderId);
  const noteId = Number(req.params.noteId);

  const order = orders.find((o) => o.id === orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const noteIndex = kitchenNotes.findIndex((n) => n.id === noteId);
  if (noteIndex === -1) return res.status(404).json({ error: 'Note not found' });

  const note = kitchenNotes[noteIndex];
  if (note.orderId !== orderId) {
    return res.status(403).json({ error: 'Note does not belong to this order' });
  }

  if (order.status === 'ready') {
    return res.status(403).json({ error: 'Cannot delete notes for a completed order' });
  }

  kitchenNotes.splice(noteIndex, 1);
  order.noteIds = order.noteIds.filter((id) => id !== noteId);
  broadcast('kitchen:note:removed', { noteId, orderId });
  res.status(204).end();
});

// POST /api/reset — clear all in-memory state and broadcast empty orders:init
app.post('/api/reset', (_req, res) => {
  orders.length = 0;
  activities.length = 0;
  kitchenNotes.length = 0;
  orderIdCounter = 1;
  activityIdCounter = 1;
  noteIdCounter = 1;

  broadcast('orders:init', { orders: [], estimatedWait: 0, activities: [], kitchenNotes: [] });
  res.status(204).end();
});

// Task 0: on every new connection, send 'orders:init' with current state
wss.on('connection', (ws) => {
  const estimatedWait = getEstimatedWait();

  ws.send(
    JSON.stringify({
      event: 'orders:init',
      data: {
        orders: orders.map(serializeOrder),
        estimatedWait,
        activities,
        kitchenNotes,
      },
    }),
  );
});

const PORT = process.env.PORT || 4001;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
