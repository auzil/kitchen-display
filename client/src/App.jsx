import { useState, useEffect, useRef } from 'react';
import './App.css';

const API = '/api';
const WS_URL = `ws://${window.location.host}/ws`;

// ---------------------------------------------------------------------------
// OrderCard
// ---------------------------------------------------------------------------
function OrderCard({ order, onAdvance }) {
  const nextLabel = { pending: 'Start Preparing', preparing: 'Mark Ready' };

  return (
    <div className="order-card">
      <div className="order-header">
        <strong>#{order.id}</strong>
        <span>Table {order.table}</span>
      </div>

      <ul>
        {order.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>

      <div className="order-time">
        {new Date(order.createdAt).toLocaleTimeString()}
      </div>

      {nextLabel[order.status] && (
        <button onClick={() => onAdvance(order.id)}>
          {nextLabel[order.status]}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OrderForm
// ---------------------------------------------------------------------------
function OrderForm({ onSubmit }) {
  const [items, setItems] = useState('');
  const [table, setTable] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!items.trim()) return;
    onSubmit({
      items: items.split(',').map((s) => s.trim()).filter(Boolean),
      table: table || 'N/A',
    });
    setItems('');
    setTable('');
  };

  return (
    <form className="order-form" onSubmit={handleSubmit}>
      <input
        placeholder="Items (comma separated)"
        value={items}
        onChange={(e) => setItems(e.target.value)}
        required
      />
      <input
        placeholder="Table #"
        value={table}
        onChange={(e) => setTable(e.target.value)}
      />
      <button type="submit">Place Order</button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// KitchenNotesBoard
// ---------------------------------------------------------------------------
function KitchenNotesBoard({ notes, onPost, onDelete }) {
  const [text, setText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onPost(text);
    setText('');
  };

  return (
    <div className="kitchen-notes-board">
      <h2>Kitchen Notes</h2>
      <form className="kitchen-notes-form" onSubmit={handleSubmit}>
        <textarea
          placeholder="Broadcast a note to the kitchen…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
        />
        <button type="submit">Post</button>
      </form>
      <div>
        {notes.map((note) => (
          <div key={note.id} className="kitchen-note-item">
            <div className="kitchen-note-text">
              {note.text}
              <div className="kitchen-note-meta">
                {note.author} · {new Date(note.createdAt).toLocaleTimeString()}
              </div>
            </div>
            <button onClick={() => onDelete(note.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActivityFeed
// ---------------------------------------------------------------------------
function ActivityFeed({ activities }) {
  return (
    <div className="activity-feed">
      <h2>Activity Feed</h2>
      <ul>
        {[...activities].reverse().map((a) => (
          <li key={a.id} className={`activity-item activity-${a.type}`}>
            <span className="activity-msg">{a.message}</span>
            <span className="activity-time">{new Date(a.timestamp).toLocaleTimeString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  const [orders, setOrders] = useState([]);
  const [estimatedWait, setEstimatedWait] = useState(0);
  const [activities, setActivities] = useState([]);
  const [kitchenNotes, setKitchenNotes] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const { event: name, data } = JSON.parse(event.data);

      switch (name) {
        case 'orders:init':
          setOrders(data.orders);
          setEstimatedWait(data.estimatedWait);
          setActivities(data.activities || []);
          setKitchenNotes(data.kitchenNotes || []);
          break;
        case 'kitchen:note:added':
          setKitchenNotes((prev) => [data.note, ...prev]);
          break;
        case 'kitchen:note:removed':
          setKitchenNotes((prev) => prev.filter((n) => n.id !== data.noteId));
          break;
        case 'order:created':
          setOrders((prev) => [...prev, data.order]);
          setEstimatedWait(data.estimatedWait);
          if (data.activity) setActivities((prev) => [...prev, data.activity]);
          break;
        case 'order:updated':
          setOrders((prev) =>
            prev.map((o) => (o.id === data.order.id ? data.order : o))
          );
          setEstimatedWait(data.estimatedWait);
          if (data.activity) setActivities((prev) => [...prev, data.activity]);
          break;
        case 'order:priority':
          setOrders((prev) =>
            prev.map((o) => (o.id === data.order.id ? data.order : o))
          );
          break;
      }
    };

    return () => ws.close();
  }, []);

  const createOrder = async (data) => {
    await fetch(`${API}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  };

  const advanceOrder = async (id) => {
    await fetch(`${API}/orders/${id}/status`, { method: 'PATCH' });
  };

  const postNote = async (text) => {
    await fetch(`${API}/kitchen/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  };

  const deleteNote = async (id) => {
    await fetch(`${API}/kitchen/notes/${id}`, { method: 'DELETE' });
  };

  const pending = orders.filter((o) => o.status === 'pending');
  const preparing = orders.filter((o) => o.status === 'preparing');
  const ready = orders.filter((o) => o.status === 'ready');

  return (
    <div className="app">
      <header>
        <h1>Kitchen Display</h1>
        <span className="wait-badge">Est. wait: {estimatedWait} min</span>
      </header>

      <OrderForm onSubmit={createOrder} />
      <KitchenNotesBoard notes={kitchenNotes} onPost={postNote} onDelete={deleteNote} />
      <ActivityFeed activities={activities} />

      <div className="columns">
        <div className="column pending">
          <h2>Pending ({pending.length})</h2>
          {pending.map((o) => (
            <OrderCard key={o.id} order={o} onAdvance={advanceOrder} />
          ))}
        </div>
        <div className="column preparing">
          <h2>Preparing ({preparing.length})</h2>
          {preparing.map((o) => (
            <OrderCard key={o.id} order={o} onAdvance={advanceOrder} />
          ))}
        </div>
        <div className="column ready">
          <h2>Ready ({ready.length})</h2>
          {ready.map((o) => (
            <OrderCard key={o.id} order={o} onAdvance={advanceOrder} />
          ))}
        </div>
      </div>
    </div>
  );
}
