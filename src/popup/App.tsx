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
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
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
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const version = getExtensionVersion();

  useEffect(() => {
    loadSettings();
  }, []);

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
  const maskedKey = hasVeniceKey ? `••••${settings.veniceApiKey.trim().slice(-4)}` : 'Not set';

  return (
    <div className="popup-container">
      {/* Header */}
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

      {/* Main content */}
      <div className="popup-main">
        {tab === 'home' && (
          <div className="home-tab">
            {/* Hero card */}
            <div className="hero-card">
              <div className="hero-eyebrow">VENICE + BANKR + NEYNAR</div>
              <h1 className="hero-title">Venice Reply Composer</h1>
              <p className="hero-subtitle">AI replies with trading &amp; trending context.</p>
            </div>

            {/* Status card */}
            <div className="status-card">
              <div className="status-row">
                <span className="status-label">Extension</span>
                <span className={`status-badge${hasVeniceKey ? ' badge-active' : ' badge-inactive'}`}>
                  {hasVeniceKey ? 'Active' : 'Setup Required'}
                </span>
              </div>
              <p className="status-detail">
                {hasVeniceKey ? 'Ready on Farcaster, X/Twitter, and Reddit.' : 'Add a Venice API key in Settings.'}
              </p>
            </div>

            {/* Provider grid */}
            <div className="provider-grid">
              <div className={`provider-card${hasVeniceKey ? ' card-active' : ''}`}>
                <div className="provider-icon">AI</div>
                <div className="provider-name">Venice</div>
                <div className="provider-status">{hasVeniceKey ? '(primary)' : 'Not set'}</div>
              </div>
              <div className={`provider-card${hasBankrKey ? ' card-active' : ''}`}>
                <div className="provider-icon">₿</div>
                <div className="provider-name">Bankr</div>
                <div className="provider-status">{hasBankrKey ? 'API Connected' : 'Not set'}</div>
              </div>
              <div className="provider-card card-active">
                <div className="provider-icon">📡</div>
                <div className="provider-name">Neynar</div>
                <div className="provider-status">Auto (Built-in)</div>
              </div>
            </div>

            {/* Open Chat CTA */}
            <button className="open-chat-btn" onClick={() => setTab('chat')}>
              💬 Open Chat
            </button>

            <div className="version-label">v{version}</div>
          </div>
        )}

        {tab === 'chat' && (
          <ChatTab settings={settings} />
        )}

        {tab === 'settings' && (
          <div className="settings-tab">
            <h2 className="settings-title">Settings</h2>

            {error && (
              <div className="settings-error">
                {error}
                <button onClick={() => setError(null)}>×</button>
              </div>
            )}

            {/* AI Provider */}
            <div className="settings-section">
              <div className="section-header">
                <span className="section-icon">🤖</span>
                <span className="section-label">AI Provider</span>
                <span className={`section-badge${hasVeniceKey ? ' badge-active' : ' badge-inactive'}`}>
                  {hasVeniceKey ? 'Venice (primary)' : 'Not set'}
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
                <p className="field-help">Private inference — no data retention. Get key from venice.ai</p>
              </div>
              <div className="field-group">
                <label className="field-label">GitHub Token (Free AI Fallback)</label>
                <input
                  type="password"
                  className="field-input"
                  value={settings.githubToken}
                  onChange={e => setSettings({ ...settings, githubToken: e.target.value })}
                  placeholder="GitHub personal access token"
                  disabled={saving}
                />
                <p className="field-help">Uses GitHub Models (gpt-4o-mini) as free fallback.</p>
              </div>
            </div>

            {/* Bankr Trading */}
            <div className="settings-section">
              <div className="section-header">
                <span className="section-icon">₿</span>
                <span className="section-label">Bankr Trading</span>
                <span className={`section-badge${hasBankrKey ? ' badge-active' : ' badge-inactive'}`}>
                  {hasBankrKey ? 'API Connected' : 'Not set'}
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
                <p className="field-help">Powers both trading + AI (LLM Gateway). Get from bankr.bot/api</p>
              </div>
              <div className="field-group">
                <label className="field-label">Bankr Username (Optional)</label>
                <input
                  type="text"
                  className="field-input"
                  value={settings.bankrUsername}
                  onChange={e => setSettings({ ...settings, bankrUsername: e.target.value })}
                  placeholder="@drdeeks"
                  disabled={saving}
                />
              </div>
            </div>

            {/* Neynar */}
            <div className="settings-section">
              <div className="section-header">
                <span className="section-icon">📡</span>
                <span className="section-label">Neynar Trending</span>
                <span className="section-badge badge-active">Auto (Built-in)</span>
              </div>
              <p className="field-help" style={{ padding: '0 0 8px 0' }}>
                Trending Farcaster context is auto-fetched. No API key required.
              </p>
            </div>

            {/* Response Types */}
            <div className="settings-section">
              <div className="section-header">
                <span className="section-icon">💬</span>
                <span className="section-label">Response Types</span>
                <span className="section-badge badge-active">
                  {[
                    settings.responseTypes?.agreeReply,
                    settings.responseTypes?.againstReply,
                    settings.responseTypes?.forQuote,
                    settings.responseTypes?.againstQuote
                  ].filter(Boolean).length} active
                </span>
              </div>
              <div className="response-types-grid">
                {[
                  { key: 'agreeReply', label: 'Agree Reply' },
                  { key: 'againstReply', label: 'Counter Reply' },
                  { key: 'forQuote', label: 'For Quote' },
                  { key: 'againstQuote', label: 'Against Quote' }
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
            </div>

            <button
              className="save-btn"
              onClick={handleSave}
              disabled={saving || loading}
            >
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
