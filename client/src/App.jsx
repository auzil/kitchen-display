import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
function Toast({ message, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="toast-error" onClick={onDismiss}>
      {message}
    </div>
  );
}

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
        <button className="btn-advance" onClick={() => onAdvance(order.id)}>
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
// KitchenNotesBoard — Task B: implement this component
// ---------------------------------------------------------------------------

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
  const [toastMessage, setToastMessage] = useState(null);
  const wsRef = useRef(null);

  const showError = useCallback((msg) => setToastMessage(msg), []);

  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const { event: name, data } = JSON.parse(event.data);

      switch (name) {
        case 'orders:init':
          setOrders(data.orders);
          setEstimatedWait(data.estimatedWait);
          setActivities(data.activities || []);
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
      }
    };

    // Task C: handle ws.onclose / reconnect logic here

    return () => ws.close();
  }, []);

  const createOrder = async (data) => {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showError(body.error || 'Failed to place order');
    }
  };

  const advanceOrder = async (id) => {
    const res = await fetch(`/api/orders/${id}/status`, { method: 'PATCH' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showError(body.error || 'Failed to advance order');
    }
  };


  const resetMemory = async () => {
    await fetch('/api/reset', { method: 'POST' });
  };

  const pending = orders.filter((o) => o.status === 'pending');
  const preparing = orders.filter((o) => o.status === 'preparing');
  const ready = orders.filter((o) => o.status === 'ready');

  return (
    <div className="app">
      {toastMessage && (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      )}
      <header>
        <h1>Kitchen Display</h1>
        {/* Task C: connection badge goes here */}
        <span className="wait-badge">Est. wait: {estimatedWait} min</span>
        <button className="btn-reset" onClick={resetMemory}>Reset</button>
      </header>

      <OrderForm onSubmit={createOrder} />
      {/* Task B: render KitchenNotesBoard here */}
      <ActivityFeed activities={activities} />

      <div className="columns">
        <div className="column pending">
          <h2>Pending ({pending.length})</h2>
          {pending.map((o) => (
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
