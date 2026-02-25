const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Broadcast a named event to all connected clients
function broadcast(event, data) {
  const msg = JSON.stringify({ event, data });
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(msg);
    }
  }
}

// In-memory order store
let orders = [];
let nextId = 1;

// Activity feed
let activities = [];
let nextActivityId = 1;

// Kitchen notes store
let kitchenNotes = [];
let nextNoteId = 1;

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
  const pendingItemsCount = pending.reduce((acc, item) => acc + item.items.length, 0);

  const preparing = orders.filter((o) => o.status === 'preparing');
  const preparingItemsCount = preparing.reduce((acc, item) => acc + item.items.length, 0);

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
    priority: 'normal',
    createdAt: new Date().toISOString(),
  };

  orders.push(order);
  const createdActivity = addActivity('created', order);
  broadcast('order:created', { order, estimatedWait: getEstimatedWait(), activity: createdActivity });
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
  broadcast('order:updated', { order, estimatedWait: getEstimatedWait(), activity: updatedActivity });
  res.json({ order });
});

// PATCH /api/orders/:id/priority
app.patch('/api/orders/:id/priority', (req, res) => {
  const order = orders.find((o) => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const { priority } = req.body;
  if (!priority || !['urgent', 'normal'].includes(priority)) {
    return res.status(400).json({ error: 'priority must be "urgent" or "normal"' });
  }
  if (order.status === 'ready') {
    return res.status(400).json({ error: 'Cannot reprioritize a completed order' });
  }

  order.priority = priority;
  broadcast('order:priority', { order });
  res.json({ order });
});

// POST /api/kitchen/notes
app.post('/api/kitchen/notes', (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required and must be a non-empty string' });
  }
  if (text.length > 500) {
    return res.status(400).json({ error: 'text must be 500 characters or fewer' });
  }

  const note = {
    id: nextNoteId++,
    text: text.trim(),
    createdAt: new Date().toISOString(),
    author: 'Kitchen',
  };
  kitchenNotes.push(note);
  broadcast('kitchen:note:added', { note });
  res.status(201).json({ note });
});

// DELETE /api/kitchen/notes/:id
app.delete('/api/kitchen/notes/:id', (req, res) => {
  const noteId = Number(req.params.id);
  const idx = kitchenNotes.findIndex((n) => n.id === noteId);
  if (idx === -1) return res.status(404).json({ error: 'Note not found' });

  kitchenNotes.splice(idx, 1);
  broadcast('kitchen:note:removed', { noteId });
  res.status(204).end();
});

// WebSocket: send current state on connect
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    event: 'orders:init',
    data: { orders, estimatedWait: getEstimatedWait(), activities, kitchenNotes },
  }));
});

const PORT = process.env.PORT || 4001;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
