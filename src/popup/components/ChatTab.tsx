import { useState, useEffect, useRef } from 'react';
import { type Settings } from '../../shared/storage';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface Props {
  settings: Settings;
}

const MODELS = [
  { id: 'venice-uncensored', label: 'Venice Uncensored' },
  { id: 'llama-3.3-70b', label: 'Llama 3.3 70B' },
  { id: 'mistral-31-24b', label: 'Mistral 31 24B' },
  { id: 'deepseek-r1-671b', label: 'DeepSeek R1 671B' },
];

export default function ChatTab({ settings }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const apiKey = settings.veniceApiKey?.trim() || settings.bankrApiKey?.trim();
      if (!apiKey) throw new Error('No API key configured. Add a Venice key in Settings.');

      const isVenice = !!settings.veniceApiKey?.trim();
      const endpoint = isVenice
        ? 'https://api.venice.ai/api/v1/chat/completions'
        : 'https://api.bankr.bot/v1/chat/completions';

      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: history,
          max_tokens: 1024,
          temperature: 0.7,
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`API error ${res.status}: ${errText.slice(0, 120)}`);
      }

      const data = await res.json();
      const reply = data?.choices?.[0]?.message?.content || 'No response received.';

      setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: Date.now() }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${msg}`, timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="chat-tab">
      {/* Model picker */}
      <div className="chat-model-bar">
        <select
          className="model-select"
          value={selectedModel}
          onChange={e => setSelectedModel(e.target.value)}
        >
          {MODELS.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <p className="chat-empty-title">Start a conversation</p>
            <p className="chat-empty-sub">Ask about crypto trends, Farcaster topics, or anything else</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`chat-message chat-message-${msg.role}`}>
              <div className="message-bubble">{msg.content}</div>
            </div>
          ))
        )}
        {loading && (
          <div className="chat-message chat-message-assistant">
            <div className="message-bubble message-loading">
              <span className="dot">·</span>
              <span className="dot">·</span>
              <span className="dot">·</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-row">
        <input
          type="text"
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={loading}
        />
        <button
          className="chat-send-btn"
          onClick={sendMessage}
          disabled={loading || !input.trim()}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
