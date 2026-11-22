import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Online } from './online';

type ChatApi = NonNullable<Online['chat']>;

const time = (at: number) => {
  const d = new Date(at);
  const today = new Date();
  const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === today.toDateString() ? t : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${t}`;
};

/** Group chat for the players of one game. Nothing here sends email. */
export function ChatModal({ chat, myId, names, onClose }: { chat: ChatApi; myId: string; names: Record<string, string>; onClose(): void }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  // Read while open, and look for new messages more often than the normal poll.
  useEffect(() => {
    chat.markRead();
    chat.refresh();
    const t = setInterval(() => { if (!document.hidden) chat.refresh(); }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (chat.unread) chat.markRead(); }, [chat.unread]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setErr('');
    const problem = await chat.send(t);
    setSending(false);
    if (problem) setErr(problem);
    else {
      setText('');
      stick.current = true;
    }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal chat" onClick={(e) => e.stopPropagation()}>
        <div className="loghead"><h3>Chat</h3><button onClick={onClose}>Close</button></div>
        <div
          className="chatlist"
          ref={list}
          onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
        >
          {chat.messages.length === 0 && <p className="dim">No messages yet. Plan your next move with the group. Nobody is emailed about chat, so people see it when they open the game.</p>}
          {chat.messages.map((m) => (
            <div key={m.id} className={'cmsg' + (m.userId === myId ? ' mine' : '')}>
              <div className="chead"><b>{m.userId === myId ? 'You' : names[m.userId] ?? 'Player'}</b><span className="dim">{time(m.at)}</span></div>
              <div className="ctext">{m.text}</div>
            </div>
          ))}
        </div>
        <form className="chatform" onSubmit={send}>
          <textarea
            value={text}
            maxLength={1000}
            rows={2}
            placeholder="Write a message"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) void send(e); }}
          />
          <button className="primary" type="submit" disabled={!text.trim() || sending}>Send</button>
        </form>
        {err && <div className="err">{err}</div>}
      </div>
    </div>
  );
}
