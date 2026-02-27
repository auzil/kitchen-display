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
  noteIds: number[];
}

interface Activity {
  id: number;
  type: string;
  orderId: number;
  message: string;
  timestamp: Date;
}

interface KitchenNote {
  id: number;
  text: string;
  author: string;
  orderId: number | null;
  createdAt: Date;
}

// ---- In-memory store ----

let orderIdCounter = 1;
let activityIdCounter = 1;
let noteIdCounter = 1;

const orders: Order[] = [];
const activities: Activity[] = [];
const kitchenNotes: KitchenNote[] = [];

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
    noteIds: order.noteIds,
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
    noteIds: [],
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

app.post('/api/orders/:orderId/notes', (req: Request, res: Response) => {
  const order = orders.find((o) => o.id === Number(req.params.orderId));
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const { text, author } = req.body as { text?: string; author?: string };
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'Note text is required' });
  }
  if (text.length > 500) {
    return res.status(400).json({ error: 'Note must be 500 characters or fewer' });
  }

  const note: KitchenNote = {
    id: noteIdCounter++,
    text: text.trim(),
    author: author || 'Kitchen',
    orderId: order.id,
    createdAt: new Date(),
  };
  kitchenNotes.push(note);
  order.noteIds.push(note.id);

  broadcast('note:created', { note, orderId: order.id });
  res.status(201).json({ note });
});

app.delete('/api/orders/:orderId/notes/:noteId', (req: Request, res: Response) => {
  const order = orders.find((o) => o.id === Number(req.params.orderId));
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (order.status === 'ready') {
    return res.status(403).json({ error: 'Cannot delete notes on a ready order' });
  }

  const noteId = Number(req.params.noteId);
  const noteIndex = kitchenNotes.findIndex((n) => n.id === noteId && n.orderId === order.id);
  if (noteIndex === -1) return res.status(404).json({ error: 'Note not found' });

  kitchenNotes.splice(noteIndex, 1);
  order.noteIds = order.noteIds.filter((id) => id !== noteId);

  broadcast('note:deleted', { noteId, orderId: order.id });
  res.status(204).end();
});

// ---- REST: General kitchen notes ----

app.post('/api/kitchen/notes', (req: Request, res: Response) => {
  const { text, author } = req.body as { text?: string; author?: string };
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'Note text is required' });
  }
  if (text.length > 500) {
    return res.status(400).json({ error: 'Note must be 500 characters or fewer' });
  }

  const note: KitchenNote = {
    id: noteIdCounter++,
    text: text.trim(),
    author: author || 'Kitchen',
    orderId: null,
    createdAt: new Date(),
  };
  kitchenNotes.push(note);

  broadcast('kitchenNote:created', { note });
  res.status(201).json({ note });
});

app.delete('/api/kitchen/notes/:id', (req: Request, res: Response) => {
  const noteId = Number(req.params.id);
  const noteIndex = kitchenNotes.findIndex((n) => n.id === noteId && n.orderId === null);
  if (noteIndex === -1) return res.status(404).json({ error: 'Note not found' });

  kitchenNotes.splice(noteIndex, 1);

  broadcast('kitchenNote:deleted', { noteId });
  res.status(204).end();
});

// ---- REST: Reset ----

app.post('/api/reset', (_req: Request, res: Response) => {
  orders.length = 0;
  activities.length = 0;
  kitchenNotes.length = 0;
  orderIdCounter = 1;
  activityIdCounter = 1;
  noteIdCounter = 1;

  broadcast('orders:init', { orders: [], estimatedWait: 0, activities: [], kitchenNotes: [] });
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
        kitchenNotes,
      },
    }),
  );
});

// ---- Start ----

const PORT = process.env.PORT || 4001;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
