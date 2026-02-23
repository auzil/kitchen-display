import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const API = '/api';
const socket = io();

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

      {/* Task A: add urgent badge and priority toggle button */}
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

// Task B: add KitchenNotesBoard component here

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  const [orders, setOrders] = useState([]);
  const [estimatedWait, setEstimatedWait] = useState(0);
  const [activities, setActivities] = useState([]);
  // Task B: add kitchenNotes state
  // Task C: add connected state (initialize from socket.connected)

  useEffect(() => {
    socket.on('orders:init', (data) => {
      setOrders(data.orders);
      setEstimatedWait(data.estimatedWait);
      setActivities(data.activities || []);
      // Task B: also set kitchenNotes from data
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

    // Task A: handle 'order:priority' socket event

    // Task B: handle 'kitchen:note:added' and 'kitchen:note:removed' socket events

    // Task C: handle 'connect' and 'disconnect' socket events

    return () => {
      socket.off('orders:init');
      socket.off('order:created');
      socket.off('order:updated');
      // Task A: socket.off('order:priority')
      // Task B: socket.off('kitchen:note:added') / socket.off('kitchen:note:removed')
      // Task C: socket.off('connect') / socket.off('disconnect')
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

  // Task A: add togglePriority function

  // Task B: add postNote and deleteNote functions

  const pending = orders.filter((o) => o.status === 'pending');
  const preparing = orders.filter((o) => o.status === 'preparing');
  // Task A: sort pending and preparing by priority (urgent first)
  const ready = orders.filter((o) => o.status === 'ready');

  return (
    <div className="app">
      <header>
        <h1>Kitchen Display</h1>
        {/* Task C: add connection badge */}
        <span className="wait-badge">Est. wait: {estimatedWait} min</span>
      </header>

      <OrderForm onSubmit={createOrder} />
      <ActivityFeed activities={activities} />

      {/* Task B: render KitchenNotesBoard here */}

      <div className="columns">
        <div className="column pending">
          <h2>Pending ({pending.length})</h2>
          {pending.map((o) => (
            // Task A: also pass onTogglePriority={togglePriority}
            <OrderCard
              key={o.id}
              order={o}
              onAdvance={advanceOrder}
            />
          ))}
        </div>
        <div className="column preparing">
          <h2>Preparing ({preparing.length})</h2>
          {preparing.map((o) => (
            // Task A: also pass onTogglePriority={togglePriority}
            <OrderCard
              key={o.id}
              order={o}
              onAdvance={advanceOrder}
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
            />
          ))}
        </div>
      </div>
    </div>
  );
}
