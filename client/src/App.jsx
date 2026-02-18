import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const API = '/api';
const socket = io();

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

export default function App() {
  const [orders, setOrders] = useState([]);
  const [estimatedWait, setEstimatedWait] = useState(0);
  const [activities, setActivities] = useState([]);


  // this one could be also removed and implemented during live coding part
  useEffect(() => {
    socket.on('orders:init', (data) => {
      setOrders(data.orders);
      setEstimatedWait(data.estimatedWait);
      setActivities(data.activities || []);
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

    return () => {
      socket.off('orders:init');
      socket.off('order:created');
      socket.off('order:updated');
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
