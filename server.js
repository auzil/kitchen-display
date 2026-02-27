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

const orders = [];       // { id, items, tableNum, status, createdAt, noteIds }
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
    createdAt: order.createdAt,
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
