// client/src/components/NotificationsBell.jsx

import { useEffect, useState, useRef } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export default function NotificationsBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const popRef = useRef(null);
  const navigate = useNavigate();

  const fetchNotes = async () => {
    try {
      const res = await api.get('/notifications');
      setItems(res.data.items || []);
      setUnread(res.data.unreadCount || 0);
    } catch { /* silent */ }
  };

  useEffect(() => {
    fetchNotes();
    const t = setInterval(fetchNotes, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onClick = (e) => { if (popRef.current && !popRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const markRead = async (id) => {
    await api.patch(`/notifications/${id}/read`);
    setItems((p) => p.map((n) => n._id === id ? { ...n, readAt: new Date() } : n));
    setUnread((u) => Math.max(0, u - 1));
  };

  const markAll = async () => {
    await api.post('/notifications/read-all');
    setItems((p) => p.map((n) => ({ ...n, readAt: n.readAt || new Date() })));
    setUnread(0);
  };

  const click = (n) => {
    if (!n.readAt) markRead(n._id);
    if (n.link) { setOpen(false); navigate(n.link); }
  };

  return (
    <div className="relative" ref={popRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg border border-rekker-border bg-rekker-surface hover:text-primary transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[70vh] overflow-auto rounded-xl border border-rekker-border bg-rekker-surface shadow-xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-rekker-border">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Notifications</p>
            {unread > 0 && (
              <button onClick={markAll} className="text-[11px] text-primary hover:underline">Mark all read</button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">No notifications.</p>
          ) : (
            <ul className="divide-y divide-rekker-border">
              {items.map((n) => (
                <li key={n._id}
                  onClick={() => click(n)}
                  className={cn(
                    'px-4 py-3 cursor-pointer hover:bg-accent/40 transition-colors',
                    !n.readAt && 'bg-primary/5'
                  )}>
                  <div className="flex items-start gap-2">
                    {!n.readAt && <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{n.title}</p>
                      {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                      <p className="text-[10px] font-mono text-muted-foreground/60 mt-1">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
