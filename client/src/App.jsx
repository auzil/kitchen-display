import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const API = '/api';
const socket = io();

// ---------------------------------------------------------------------------
// OrderCard
// ---------------------------------------------------------------------------
function OrderCard({ order, onAdvance, onTogglePriority }) {
  const nextLabel = { pending: 'Start Preparing', preparing: 'Mark Ready' };

  return (
    <div className={`order-card${order.priority === 'urgent' ? ' urgent' : ''}`}>
      <div className="order-header">
        <strong>
          #{order.id}
          {order.priority === 'urgent' && (
            <span className="urgent-badge">URGENT</span>
          )}
        </strong>
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

      {/* Task A: priority toggle */}
      {order.status !== 'ready' && (
        <button className="btn-priority" onClick={() => onTogglePriority(order.id, order.priority)}>
          {order.priority === 'urgent' ? 'Clear Urgent' : 'Mark Urgent'}
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
// KitchenNotesBoard (Task D)
// ---------------------------------------------------------------------------
function KitchenNotesBoard({ notes, onPost, onDelete }) {
  const [text, setText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onPost(text.trim());
    setText('');
  };

  return (
    <div className="kitchen-notes-board">
      <h2>Kitchen Board</h2>
      <form className="kitchen-notes-form" onSubmit={handleSubmit}>
        <textarea
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          placeholder="Post a note..."
        />
        <button type="submit">Post</button>
      </form>
      <ul style={{ listStyle: 'none' }}>
        {notes.map((n) => (
          <li key={n.id} className="kitchen-note-item">
            <div className="kitchen-note-text">
              {n.text}
              <div className="kitchen-note-meta">{new Date(n.createdAt).toLocaleTimeString()}</div>
            </div>
            <button onClick={() => onDelete(n.id)}>✕</button>
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
  const [kitchenNotes, setKitchenNotes] = useState([]); // Task D
  const [connected, setConnected] = useState(socket.connected); // Task E

  useEffect(() => {
    socket.on('orders:init', (data) => {
      setOrders(data.orders);
      setEstimatedWait(data.estimatedWait);
      setActivities(data.activities || []);
      setKitchenNotes(data.kitchenNotes || []); // Task D
    });

    socket.on('order:created', (data) => {
      setOrders((prev) => [...prev, data.order]);
      setEstimatedWait(data.estimatedWait);
      if (data.activity) setActivities((prev) => [...prev, data.activity]);
    });

    socket.on('order:updated', (data) => {
      setOrders((prev) =>
        prev.map((o) => (o.id === data.order.id ? data.order : o))
      );
      setEstimatedWait(data.estimatedWait);
      if (data.activity) setActivities((prev) => [...prev, data.activity]);
    });

    // Task A: priority update
    socket.on('order:priority', (data) => {
      setOrders((prev) => prev.map((o) => o.id === data.order.id ? data.order : o));
    });

    // Task C: kitchen notes
    socket.on('kitchen:note:added', ({ note }) => {
      setKitchenNotes((prev) => [note, ...prev]);
    });
    socket.on('kitchen:note:removed', ({ noteId }) => {
      setKitchenNotes((prev) => prev.filter((n) => n.id !== noteId));
    });

    // Task E: connection lifecycle
    // Server emits 'orders:init' with full state on every connection,
    // so the existing handler above handles state recovery automatically.
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    return () => {
      socket.off('orders:init');
      socket.off('order:created');
      socket.off('order:updated');
      socket.off('order:priority');
      socket.off('kitchen:note:added');
      socket.off('kitchen:note:removed');
      socket.off('connect');
      socket.off('disconnect');
    };
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

  // Task A
  const togglePriority = async (id, currentPriority) => {
    const next = currentPriority === 'urgent' ? 'normal' : 'urgent';
    await fetch(`${API}/orders/${id}/priority`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: next }),
    });
  };

  // Task C
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

  // Task A: sort urgent orders to top in each column
  const byPriority = (a, b) =>
    (a.priority === 'urgent' ? 0 : 1) - (b.priority === 'urgent' ? 0 : 1);

  const pending = orders.filter((o) => o.status === 'pending').sort(byPriority);
  const preparing = orders.filter((o) => o.status === 'preparing').sort(byPriority);
  const ready = orders.filter((o) => o.status === 'ready');

  return (
    <div className="app">
      <header>
        <h1>Kitchen Display</h1>
        {/* Task E: connection badge */}
        <span className={`conn-badge ${connected ? 'live' : 'reconnecting'}`}>
          {connected ? '● Live' : '● Reconnecting…'}
        </span>
        <span className="wait-badge">Est. wait: {estimatedWait} min</span>
      </header>

      <OrderForm onSubmit={createOrder} />
      <ActivityFeed activities={activities} />

      {/* Task D */}
      <KitchenNotesBoard notes={kitchenNotes} onPost={postNote} onDelete={deleteNote} />

      <div className="columns">
        <div className="column pending">
          <h2>Pending ({pending.length})</h2>
          {pending.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              onAdvance={advanceOrder}
              onTogglePriority={togglePriority}
            />
          ))}
        </div>
        <div className="column preparing">
          <h2>Preparing ({preparing.length})</h2>
          {preparing.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              onAdvance={advanceOrder}
              onTogglePriority={togglePriority}
            />
          ))}
        </div>
        <div className="column ready">
          <h2>Ready ({ready.length})</h2>
          {ready.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              onAdvance={advanceOrder}
              onTogglePriority={togglePriority}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
