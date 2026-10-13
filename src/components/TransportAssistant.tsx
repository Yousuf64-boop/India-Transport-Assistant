import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Clock, Loader2, MapPin, Send, Trash2 } from 'lucide-react';
import { useChat } from '../hooks/useChat';
import { config } from '../lib/config';
import { MessageText } from './MessageText';

const CITIES = ['Kolkata', 'Delhi NCR', 'Mumbai', 'Bengaluru', 'Chennai', 'Hyderabad', 'Pune', 'Ahmedabad', 'Other'];

const SUGGESTIONS: Record<string, { label: string; query: string }[]> = {
  Kolkata: [
    { label: 'By metro', query: 'Dum Dum to Esplanade by metro' },
    { label: 'Compare modes', query: 'Compare ways to get from Howrah to Salt Lake Sector V' },
    { label: 'By bike', query: 'Park Street to New Town by bike' },
  ],
  'Delhi NCR': [
    { label: 'By metro', query: 'Connaught Place to Cyber Hub by metro' },
    { label: 'Compare modes', query: 'Compare ways to get from Noida Sector 62 to Gurgaon' },
    { label: 'By bike', query: 'India Gate to Hauz Khas by bike' },
  ],
  Mumbai: [
    { label: 'Local train', query: 'Bandra to Churchgate by local train' },
    { label: 'Compare modes', query: 'Compare ways to get from Andheri to Nariman Point' },
    { label: 'By cab', query: 'Powai to BKC by cab' },
  ],
};
const DEFAULT_SUGGESTIONS = [
  { label: 'By metro', query: 'Central station to airport by metro' },
  { label: 'Compare modes', query: 'Compare ways to get from the railway station to the airport' },
];

export function TransportAssistant() {
  const [city, setCity] = useState('Kolkata');
  const { messages, isLoading, send, clear } = useChat(city);
  const [input, setInput] = useState('');
  const suggestions = SUGGESTIONS[city] ?? DEFAULT_SUGGESTIONS;
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input;
    if (!text.trim() || isLoading) return;
    setInput('');
    void send(text);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {!config.isConfigured && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-4 text-amber-900 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>
            Backend not configured. Copy <code>.env.example</code> to <code>.env</code> and set your Supabase URL and anon key.
          </span>
        </div>
      )}
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
        <div
          className="h-[600px] overflow-y-auto p-6 space-y-4"
          role="log"
          aria-live="polite"
          aria-label="Conversation"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="space-y-6">
                <div className="flex gap-4 justify-center" aria-hidden="true">
                  <div className="bg-blue-50 p-4 rounded-xl"><MapPin className="w-8 h-8 text-blue-600" /></div>
                  <div className="bg-cyan-50 p-4 rounded-xl"><Clock className="w-8 h-8 text-cyan-600" /></div>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-800 mb-2">How can I help you today?</h2>
                  <p className="text-gray-600">Plan journeys by metro, local train, bus, car or bike across Indian cities.</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {suggestions.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => setInput(s.query)}
                      className="px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-5 py-3 ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : m.isError
                        ? 'bg-red-50 text-red-800 border border-red-200'
                        : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <MessageText text={m.content} />
                  <p className={`text-xs mt-2 ${m.role === 'user' ? 'text-blue-100' : 'text-gray-500'}`}>
                    {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {m.toolsUsed && m.toolsUsed.length > 0 && ` · live map data`}
                  </p>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start" role="status" aria-label="Assistant is typing">
              <div className="bg-gray-100 rounded-2xl px-5 py-3">
                <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="mb-3 flex items-center gap-2 text-sm text-gray-600">
            <label htmlFor="city">City</label>
            <select
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CITIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <form onSubmit={submit} className="flex gap-3">
            <label htmlFor="chat-input" className="sr-only">Ask about getting around</label>
            <input
              id="chat-input"
              type="text"
              value={input}
              maxLength={500}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. Howrah to Salt Lake Sector V by metro"
              className="flex-1 px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
            >
              <Send className="w-5 h-5" aria-hidden="true" />
              Send
            </button>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clear}
                aria-label="Clear conversation"
                className="px-3 py-3 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Trash2 className="w-5 h-5" aria-hidden="true" />
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
