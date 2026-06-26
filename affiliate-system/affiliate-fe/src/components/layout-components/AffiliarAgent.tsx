import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from 'config/axiosInstance';
import { ASSISTANT_API_URLS } from 'config/apiUrls';

// ── Response shape (mirrors assistantController) ─────────────────────────────
interface NavAction { type: 'navigate'; route: string; label: string }
interface SummaryData { kind: 'summary'; label: string; items: { label: string; value: string }[] }
interface RankingData { kind: 'ranking'; label: string; action?: NavAction | null; rows: { rank: number; name: string; value: string }[] }
interface AskResponse {
  reply: string;
  action?: NavAction | null;
  data?: SummaryData | RankingData | null;
  suggestions?: string[];
}

interface Msg extends Partial<AskResponse> { role: 'user' | 'agent'; text?: string }

const GREETING: Msg = {
  role: 'agent',
  reply: "Hi, I'm your Affiliar agent. Ask me where something is, or about your numbers.",
  suggestions: ['Top players this month', 'This month NGR', 'Open campaign reports'],
};

export default function AffiliarAgent() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  const send = async (raw?: string) => {
    const message = (raw ?? input).trim();
    if (!message || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: message }]);
    setBusy(true);
    try {
      const { data } = await axiosInstance.post<AskResponse>(ASSISTANT_API_URLS.ASK(), { message });
      setMessages((m) => [...m, { role: 'agent', ...data }]);
    } catch {
      setMessages((m) => [...m, { role: 'agent', reply: 'Something went wrong — please try again.' }]);
    } finally {
      setBusy(false);
    }
  };

  const go = (route: string) => { navigate(route); setOpen(false); };

  return (
    <>
      {/* Launcher bubble */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label='Open Affiliar agent'
          className='fixed bottom-6 right-6 z-[60] h-14 w-14 rounded-full shadow-lg flex items-center justify-center text-white
                     bg-gradient-to-br from-violet-500 to-fuchsia-600 hover:scale-105 transition-transform'
        >
          <AgentFace />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className='fixed bottom-6 right-6 z-[60] w-[360px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-3rem)]
                        flex flex-col rounded-2xl border border-violet-100 bg-white shadow-2xl overflow-hidden'>
          {/* Header */}
          <div className='flex items-center gap-3 px-4 py-3 bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white'>
            <div className='h-8 w-8 rounded-full bg-white/20 flex items-center justify-center'><AgentFace small /></div>
            <div className='flex-1'>
              <p className='text-sm font-semibold leading-none'>Affiliar Agent</p>
              <p className='text-[11px] text-white/80 mt-0.5'>Navigation & quick stats</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label='Close' className='text-white/80 hover:text-white text-lg leading-none'>×</button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className='flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-gray-50'>
            {messages.map((m, i) => <Bubble key={i} msg={m} onGo={go} onSuggest={send} />)}
            {busy && <div className='text-xs text-gray-400 px-1'>thinking…</div>}
          </div>

          {/* Composer */}
          <div className='flex items-center gap-2 p-2.5 border-t border-gray-100 bg-white'>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder='Ask me anything…'
              className='flex-1 text-sm rounded-lg px-3 py-2 border border-gray-200 focus:outline-none focus:border-primary'
            />
            <button
              onClick={() => send()}
              disabled={busy || !input.trim()}
              className='h-9 px-4 rounded-lg text-sm font-medium text-white bg-primary disabled:opacity-40'
            >Send</button>
          </div>
        </div>
      )}
    </>
  );
}

function Bubble({ msg, onGo, onSuggest }: { msg: Msg; onGo: (r: string) => void; onSuggest: (s: string) => void }) {
  if (msg.role === 'user') {
    return (
      <div className='flex justify-end'>
        <div className='max-w-[80%] rounded-2xl rounded-br-sm bg-primary text-white text-sm px-3 py-2'>{msg.text}</div>
      </div>
    );
  }
  const action = msg.action || (msg.data && msg.data.kind === 'ranking' ? msg.data.action : null);
  return (
    <div className='flex justify-start'>
      <div className='max-w-[88%] space-y-2'>
        {msg.reply && (
          <div className='rounded-2xl rounded-bl-sm bg-white border border-gray-100 text-sm text-gray-800 px-3 py-2'>{msg.reply}</div>
        )}

        {msg.data?.kind === 'summary' && (
          <div className='grid grid-cols-2 gap-2'>
            {msg.data.items.map((it) => (
              <div key={it.label} className='rounded-xl border border-violet-100 bg-white px-3 py-2'>
                <p className='text-[11px] text-gray-500'>{it.label}</p>
                <p className='text-sm font-semibold text-gray-900'>{it.value}</p>
              </div>
            ))}
          </div>
        )}

        {msg.data?.kind === 'ranking' && (
          <div className='rounded-xl border border-violet-100 bg-white divide-y divide-gray-50 overflow-hidden'>
            {msg.data.rows.map((r) => (
              <div key={r.rank} className='flex items-center gap-2 px-3 py-1.5'>
                <span className='h-5 w-5 shrink-0 rounded-full bg-violet-100 text-violet-700 text-[11px] font-semibold flex items-center justify-center'>{r.rank}</span>
                <span className='flex-1 text-xs text-gray-800 truncate'>{r.name}</span>
                <span className='text-xs font-semibold text-gray-900'>{r.value}</span>
              </div>
            ))}
          </div>
        )}

        {action && (
          <button onClick={() => onGo(action.route)}
            className='inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline'>
            {action.label} →
          </button>
        )}

        {msg.suggestions && msg.suggestions.length > 0 && (
          <div className='flex flex-wrap gap-1.5'>
            {msg.suggestions.map((s) => (
              <button key={s} onClick={() => onSuggest(s)}
                className='text-[11px] rounded-full border border-violet-200 text-violet-700 bg-white hover:bg-violet-50 px-2.5 py-1'>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentFace({ small }: { small?: boolean }) {
  const s = small ? 16 : 24;
  return (
    <svg width={s} height={s} viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
      <rect x='4' y='7' width='16' height='12' rx='4' fill='currentColor' />
      <circle cx='9.5' cy='13' r='1.5' fill='#7c3aed' />
      <circle cx='14.5' cy='13' r='1.5' fill='#7c3aed' />
      <path d='M12 3v3M12 3l-1.5 1.5M12 3l1.5 1.5' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' />
    </svg>
  );
}
