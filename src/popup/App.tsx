import { useState, useEffect } from 'react';
import { getSettings, saveSettings, type Settings } from '../shared/storage';
import ChatTab from './components/ChatTab';

type Tab = 'home' | 'chat' | 'settings';

function getExtensionVersion(): string {
  const chromeApi = (globalThis as { chrome?: { runtime?: { getManifest?: () => { version?: string } } } }).chrome;
  return chromeApi?.runtime?.getManifest?.()?.version || 'dev';
}

function normalizeApiKeyInput(rawValue: string): string {
  let normalized = rawValue.trim();
  if (!normalized) return '';
  const assignmentMatch = normalized.match(/(?:VENICE_INFERENCE_KEY|VENICE_API_KEY)\s*=\s*(.+)$/i);
  if (assignmentMatch) normalized = assignmentMatch[1].trim();
  if (/^VENICE_INFERENCE_KEY_/i.test(normalized)) return normalized;
  normalized = normalized.replace(/^Bearer\s+/i, '').trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'")) ||
    (normalized.startsWith('`') && normalized.endsWith('`'))
  ) normalized = normalized.slice(1, -1).trim();
  return normalized;
}

export function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [settings, setSettings] = useState<Settings>({
    veniceApiKey: '',
    bankrUsername: '',
    bankrEnabled: true,
    bankrApiKey: '',
    githubToken: '',
    responseTypes: { agreeReply: true, againstReply: false, forQuote: false, againstQuote: false }
  });
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = getExtensionVersion();

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const saved = await getSettings();
      if (saved) setSettings(saved);
    } catch (err) {
      console.error('Settings load error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      const normalized = { ...settings, veniceApiKey: normalizeApiKeyInput(settings.veniceApiKey) };
      await saveSettings(normalized);
      setSettings(normalized);
      setStatus('Settings saved!');
      setTimeout(() => setStatus(''), 2500);
    } catch (err) {
      setError('Failed to save settings.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const hasVeniceKey = !!settings.veniceApiKey.trim();
  const hasBankrKey = !!settings.bankrApiKey.trim();

  return (
    <div className="popup-container">
      {/* Tab bar */}
      <div className="popup-header">
        <nav className="tab-nav">
          <button className={`tab-btn${tab === 'home' ? ' active' : ''}`} onClick={() => setTab('home')}>
            🏠 Home
          </button>
          <button className={`tab-btn${tab === 'chat' ? ' active' : ''}`} onClick={() => setTab('chat')}>
            💬 Chat
          </button>
          <button className={`tab-btn${tab === 'settings' ? ' active' : ''}`} onClick={() => setTab('settings')}>
            ⚙️ Settings
          </button>
        </nav>
      </div>

      <div className="popup-main">
        {/* ── HOME ── */}
        {tab === 'home' && (
          <div className="home-tab">
            {/* Hero */}
            <div className="hero-card">
              <p className="hero-eyebrow">Venice · Bankr · Neynar</p>
              <h1 className="hero-title">Venice Reply Composer</h1>
              <p className="hero-subtitle">Private AI replies with crypto trading context.</p>
            </div>

            {/* Status */}
            <div className="home-status-card">
              <div className="status-row">
                <span className="status-label">Extension</span>
                <span className={`status-badge ${hasVeniceKey ? 'badge-active' : 'badge-inactive'}`}>
                  {hasVeniceKey ? 'Active' : 'Setup Required'}
                </span>
              </div>
              <p className="status-detail">
                {hasVeniceKey
                  ? 'Ready on Farcaster, X/Twitter, and Reddit.'
                  : 'Add a Venice API key in Settings to activate.'}
              </p>
            </div>

            {/* Provider grid */}
            <div className="provider-grid">
              <div className={`provider-card${hasVeniceKey ? ' card-active' : ''}`}>
                <div className="provider-icon">🤖</div>
                <div className="provider-name">Venice</div>
                <div className="provider-status">{hasVeniceKey ? 'Primary' : 'Not set'}</div>
              </div>
              <div className={`provider-card${hasBankrKey ? ' card-active' : ''}`}>
                <div className="provider-icon">₿</div>
                <div className="provider-name">Bankr</div>
                <div className="provider-status">{hasBankrKey ? 'Connected' : 'Not set'}</div>
              </div>
              <div className="provider-card card-active">
                <div className="provider-icon">📡</div>
                <div className="provider-name">Neynar</div>
                <div className="provider-status">Built-in</div>
              </div>
            </div>

            {/* Open chat CTA */}
            <button className="open-chat-btn" onClick={() => setTab('chat')}>
              💬 Open Chat
            </button>

            <p className="version-label">v{version}</p>
          </div>
        )}

        {/* ── CHAT ── */}
        {tab === 'chat' && <ChatTab settings={settings} />}

        {/* ── SETTINGS ── */}
        {tab === 'settings' && (
          <div className="settings-tab">
            <h2 className="settings-title">Settings</h2>

            {error && (
              <div className="settings-error">
                <span>{error}</span>
                <button onClick={() => setError(null)}>×</button>
              </div>
            )}

            {/* AI Provider */}
            <div className="settings-section">
              <div className="section-header">
                <span className="section-icon">🤖</span>
                <span className="section-label">AI Provider</span>
                <span className={`section-badge ${hasVeniceKey ? 'badge-active' : 'badge-inactive'}`}>
                  {hasVeniceKey ? 'Venice active' : 'Not set'}
                </span>
              </div>
              <div className="field-group">
                <label className="field-label">Venice API Key</label>
                <input
                  type="password"
                  className="field-input"
                  value={settings.veniceApiKey}
                  onChange={e => setSettings({ ...settings, veniceApiKey: e.target.value })}
                  placeholder="VENICE_INFERENCE_KEY_..."
                  disabled={saving}
                />
                <p className="field-help">Private inference — zero data retention.</p>
              </div>
              <div className="field-group">
                <label className="field-label">GitHub Token (Free Fallback)</label>
                <input
                  type="password"
                  className="field-input"
                  value={settings.githubToken}
                  onChange={e => setSettings({ ...settings, githubToken: e.target.value })}
                  placeholder="GitHub personal access token"
                  disabled={saving}
                />
                <p className="field-help">Uses GitHub Models (gpt-4o-mini) as free third-tier fallback.</p>
              </div>
            </div>

            {/* Bankr */}
            <div className="settings-section">
              <div className="section-header">
                <span className="section-icon">₿</span>
                <span className="section-label">Bankr Trading</span>
                <span className={`section-badge ${hasBankrKey ? 'badge-active' : 'badge-inactive'}`}>
                  {hasBankrKey ? 'Connected' : 'Not set'}
                </span>
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={settings.bankrEnabled}
                  onChange={e => setSettings({ ...settings, bankrEnabled: e.target.checked })}
                  disabled={saving}
                />
                <span>Enable Bankr integration</span>
              </label>
              <div className="field-group">
                <label className="field-label">Bankr API Key</label>
                <input
                  type="password"
                  className="field-input"
                  value={settings.bankrApiKey}
                  onChange={e => setSettings({ ...settings, bankrApiKey: e.target.value })}
                  placeholder="Bankr API key"
                  disabled={saving}
                />
                <p className="field-help">Powers AI fallback (LLM Gateway) + one-click trading.</p>
              </div>
              <div className="field-group">
                <label className="field-label">Bankr Username (Optional)</label>
                <input
                  type="text"
                  className="field-input"
                  value={settings.bankrUsername}
                  onChange={e => setSettings({ ...settings, bankrUsername: e.target.value })}
                  placeholder="@yourusername"
                  disabled={saving}
                />
              </div>
            </div>

            {/* Neynar */}
            <div className="settings-section">
              <div className="section-header">
                <span className="section-icon">📡</span>
                <span className="section-label">Neynar Trending</span>
                <span className="section-badge badge-active">Auto</span>
              </div>
              <div className="field-group">
                <p className="field-help">
                  Trending Farcaster context is fetched automatically. No API key required.
                </p>
              </div>
            </div>

            {/* Response Types */}
            <div className="settings-section">
              <div className="section-header">
                <span className="section-icon">💬</span>
                <span className="section-label">Response Types</span>
              </div>
              {[
                { key: 'agreeReply' as const, label: 'Agree Reply' },
                { key: 'againstReply' as const, label: 'Counter Reply' },
                { key: 'forQuote' as const, label: 'For Quote' },
                { key: 'againstQuote' as const, label: 'Against Quote' },
              ].map(({ key, label }) => (
                <label key={key} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={!!(settings.responseTypes as unknown as Record<string, boolean>)?.[key]}
                    onChange={e => setSettings({
                      ...settings,
                      responseTypes: {
                        ...(settings.responseTypes || {}),
                        [key]: e.target.checked
                      } as Settings['responseTypes']
                    })}
                    disabled={saving}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <button className="save-btn" onClick={handleSave} disabled={saving || loading}>
              {saving ? 'Saving…' : 'Save Settings'}
            </button>

            {status && <p className="save-status">{status}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
