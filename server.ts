import express, { Request, Response } from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// ---- Types ----

interface Order {
  id: number;
  items: string[];
  tableNum: string;
  status: 'pending' | 'preparing' | 'ready';
  createdAt: Date;
}

interface Activity {
  id: number;
  type: string;
  orderId: number;
  message: string;
  timestamp: Date;
}

// ---- In-memory store ----

let orderIdCounter = 1;
let activityIdCounter = 1;

const orders: Order[] = [];
const activities: Activity[] = [];

// ---- Helpers ----

function broadcast(event: string, data: unknown): void {
  const msg = JSON.stringify({ event, data });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

const activityMessages: Record<string, (o: Order) => string> = {
  created: (o) => `Order #${o.id} placed — Table ${o.tableNum} (${o.items.join(', ')})`,
  preparing: (o) => `Order #${o.id} is now being prepared`,
  ready: (o) => `Order #${o.id} is ready!`,
};

function addActivity(type: string, order: Order): Activity {
  const activity: Activity = {
    id: activityIdCounter++,
    type,
    orderId: order.id,
    message: activityMessages[type](order),
    timestamp: new Date(),
  };
  activities.push(activity);
  return activity;
}

function getEstimatedWait(): number {
  const pendingItemsCount = orders
    .filter((o) => o.status === 'pending')
    .reduce((acc, o) => acc + o.items.length, 0);
  const preparingItemsCount = orders
    .filter((o) => o.status === 'preparing')
    .reduce((acc, o) => acc + o.items.length, 0);
  return pendingItemsCount * 5 + preparingItemsCount * 3;
}

function serializeOrder(order: Order) {
  return {
    id: order.id,
    items: order.items,
    table: order.tableNum,
    status: order.status,
    createdAt: order.createdAt,
  };
}

// ---- REST: Orders ----

app.post('/api/orders', (req: Request, res: Response) => {
  const { items, table } = req.body as { items: string[]; table?: string };
  if (!items || !items.length) {
    return res.status(400).json({ error: 'Items are required' });
  }

  const order: Order = {
    id: orderIdCounter++,
    items,
    tableNum: table || 'N/A',
    status: 'pending',
    createdAt: new Date(),
  };
  orders.push(order);

  const createdActivity = addActivity('created', order);
  const estimatedWait = getEstimatedWait();

  const payload = serializeOrder(order);
  broadcast('order:created', { order: payload, estimatedWait, activity: createdActivity });
  res.status(201).json({ order: payload, estimatedWait });
});

app.patch('/api/orders/:id/status', (req: Request, res: Response) => {
  const order = orders.find((o) => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const flow: Partial<Record<Order['status'], Order['status']>> = {
    pending: 'preparing',
    preparing: 'ready',
  };
  const next = flow[order.status];
  if (!next) return res.status(400).json({ error: 'Order already completed' });

  order.status = next;

  const updatedActivity = addActivity(next, order);
  const estimatedWait = getEstimatedWait();

  const payload = serializeOrder(order);
  broadcast('order:updated', { order: payload, estimatedWait, activity: updatedActivity });
  res.json({ order: payload });
});

// ---- REST: Order notes ----

// Task A — implement here

// ---- REST: General kitchen notes ----

// Task B — implement here

// ---- REST: Reset ----

app.post('/api/reset', (_req: Request, res: Response) => {
  orders.length = 0;
  activities.length = 0;
  orderIdCounter = 1;
  activityIdCounter = 1;

  broadcast('orders:init', { orders: [], estimatedWait: 0, activities: [] });
  res.status(204).end();
});

// ---- WebSocket ----

wss.on('connection', (ws: WebSocket) => {
  const estimatedWait = getEstimatedWait();
  ws.send(
    JSON.stringify({
      event: 'orders:init',
      data: {
        orders: orders.map(serializeOrder),
        estimatedWait,
        activities,
      },
    }),
  );
});

// ---- Start ----

const PORT = process.env.PORT || 4001;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
