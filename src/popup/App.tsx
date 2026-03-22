import { useState, useEffect } from 'react';
import { getSettings, saveSettings, type Settings } from '../shared/storage';

function getExtensionVersion(): string {
  const chromeApi = (globalThis as { chrome?: { runtime?: { getManifest?: () => { version?: string } } } }).chrome;
  return chromeApi?.runtime?.getManifest?.()?.version || 'dev';
}

interface KeyValidationResult {
  valid: boolean;
  normalizedKey: string;
  message?: string;
}

function normalizeApiKeyInput(rawValue: string): string {
  let normalized = rawValue.trim();
  if (!normalized) return '';

  // Handle VENICE_INFERENCE_KEY=value (env var assignment)
  const assignmentMatch = normalized.match(/(?:VENICE_INFERENCE_KEY|VENICE_API_KEY)\s*=\s*(.+)$/i);
  if (assignmentMatch) {
    normalized = assignmentMatch[1].trim();
  }

  // Handle VENICE_INFERENCE_KEY_xxxxx format (the key IS the full string — pass as-is)
  // Venice keys starting with this prefix are valid API keys themselves
  if (/^VENICE_INFERENCE_KEY_/i.test(normalized)) {
    return normalized;
  }

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

async function getResponseSnippet(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 180);
  } catch {
    return '';
  }
}

async function validateVeniceApiKey(rawValue: string): Promise<KeyValidationResult> {
  const normalizedKey = normalizeApiKeyInput(rawValue);

  if (!normalizedKey) {
    return {
      valid: false,
      normalizedKey: '',
      message: 'Please enter a Venice API key.'
    };
  }

  try {
    const modelsResponse = await fetch('https://api.venice.ai/api/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${normalizedKey}`
      }
    });

    if (modelsResponse.ok) {
      return { valid: true, normalizedKey };
    }

    if (modelsResponse.status === 404) {
      const chatProbe = await fetch('https://api.venice.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${normalizedKey}`
        },
        body: JSON.stringify({
          model: 'venice-uncensored',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          temperature: 0
        })
      });

      if (chatProbe.ok) {
        return { valid: true, normalizedKey };
      }

      const snippet = await getResponseSnippet(chatProbe);
      if (chatProbe.status === 401 || chatProbe.status === 403) {
        return {
          valid: false,
          normalizedKey,
          message: 'Venice rejected this key. Accepted examples include `vapi_...` or `VENICE_INFERENCE_KEY_...`.'
        };
      }

      return {
        valid: false,
        normalizedKey,
        message: `Unable to validate key (${chatProbe.status}). ${snippet || 'Please verify key format and try again.'}`
      };
    }

    const modelsSnippet = await getResponseSnippet(modelsResponse);
    if (modelsResponse.status === 401 || modelsResponse.status === 403) {
      return {
        valid: false,
        normalizedKey,
        message: 'Venice rejected this key. Try pasting only the key value, without `Bearer` unless needed.'
      };
    }

    return {
      valid: false,
      normalizedKey,
      message: `Unable to validate key (${modelsResponse.status}). ${modelsSnippet || 'Please try again.'}`
    };
  } catch (error) {
    console.error('Venice API validation error:', error);
    return {
      valid: false,
      normalizedKey,
      message: 'Could not reach Venice API to validate the key. Check network and try again.'
    };
  }
}

export function App() {
  const [settings, setSettings] = useState<Settings>({ veniceApiKey: '', bankrUsername: '', bankrEnabled: true, bankrApiKey: '', githubToken: '' });
  const [showSetup, setShowSetup] = useState(true);
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      setError(null);
      const saved = await getSettings();
      if (saved) {
        setSettings(saved);
        if (saved.veniceApiKey.trim()) {
          setShowSetup(false);
        }
      }
    } catch (err) {
      setError('Failed to load settings. Check console.');
      console.error('Settings load error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      setLoading(true);
      setError(null);

      const validation = await validateVeniceApiKey(settings.veniceApiKey);
      if (!validation.valid) {
        setError(validation.message || 'Invalid Venice API key.');
        return;
      }

      const normalizedSettings: Settings = {
        ...settings,
        veniceApiKey: validation.normalizedKey
      };

      await saveSettings(normalizedSettings);
      setSettings(normalizedSettings);
      setStatus('Settings saved successfully!');
      setShowSetup(false);
      setTimeout(() => setStatus(''), 2000);
    } catch (err) {
      setError('Failed to save settings. Check API key.');
      console.error('Settings save error:', err);
    } finally {
      setLoading(false);
    }
  }

  const maskedKey = settings.veniceApiKey.trim()
    ? `••••${settings.veniceApiKey.trim().slice(-4)}`
    : 'Not set';
  const extensionVersion = getExtensionVersion();

  const manifestStatus = extensionVersion === 'dev'
    ? 'Manifest unavailable (non-extension context)'
    : `Manifest loaded · v${extensionVersion}`;

  return (
    <div className="popup-shell">
      <header className="popup-hero">
        <p className="hero-eyebrow">Venice + Bankr</p>
        <h1>Venice Reply Composer</h1>
        <p className="hero-subtitle">AI replies for social posts, with quick Bankr trade links.</p>
      </header>

      <main className="popup-content">
      {error && (
        <div className="status-card status-error">
          <span>{error}</span>
          <button className="status-dismiss" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      {loading ? (
        <div className="loading-wrap">
          <div className="loading-spinner"></div>
          <p>Loading your settings…</p>
        </div>
      ) : !showSetup ? (
        <section className="panel-stack">
          <div className="status-card status-success">
            <p className="status-title">Configuration Saved</p>
            <p className="status-copy">The extension is ready on Farcaster, X/Twitter, and Reddit.</p>
          </div>

          <div className="info-card">
            <p className="info-label">Venice API Key</p>
            <p className="info-value mono-text">{maskedKey}</p>
          </div>

          <div className="info-card">
            <p className="info-label">Bankr Username</p>
            <p className="info-value">{settings.bankrUsername.trim() || 'Not set'}</p>
            <p className="info-note">Optional. Stored for your own reference.</p>
          </div>

          <div className="info-card">
            <p className="info-label">Bankr Integration</p>
            <p className="info-value">{settings.bankrEnabled ? 'Enabled' : 'Disabled'}</p>
          </div>

          <button
            className="action-btn secondary-btn"
            onClick={() => setShowSetup(true)}
            disabled={loading}
          >
            Edit Settings
          </button>

          {status && <p className="inline-status">{status}</p>}
        </section>
      ) : (
        <section className="panel-stack">
          <div className="field-wrap">
            <label className="field-label">Venice API Key</label>
            <input
              type="password"
              className="field-input"
              value={settings.veniceApiKey}
              onChange={e => setSettings({ ...settings, veniceApiKey: e.target.value })}
              placeholder="Enter API key"
              disabled={loading}
            />
            <p className="field-help">Accepted: raw key (`vapi_...`), `VENICE_INFERENCE_KEY=...`, or `Bearer ...`.</p>
          </div>

          <div className="field-wrap">
            <label className="field-label">Bankr API Key (Fallback AI + Trading)</label>
            <input
              type="password"
              className="field-input"
              value={settings.bankrApiKey}
              onChange={e => setSettings({ ...settings, bankrApiKey: e.target.value })}
              placeholder="Bankr API key for LLM Gateway + trading"
              disabled={loading}
            />
            <p className="field-help">Powers Bankr LLM Gateway (AI fallback) and direct trade execution.</p>
          </div>

          <div className="field-wrap">
            <label className="field-label">GitHub Token (Free AI Fallback)</label>
            <input
              type="password"
              className="field-input"
              value={settings.githubToken}
              onChange={e => setSettings({ ...settings, githubToken: e.target.value })}
              placeholder="GitHub personal access token"
              disabled={loading}
            />
            <p className="field-help">Uses GitHub Models (gpt-4o-mini) as free third fallback.</p>
          </div>

          <div className="field-wrap">
            <label className="field-label">Bankr Username (Optional)</label>
            <input
              type="text"
              className="field-input"
              value={settings.bankrUsername}
              onChange={e => setSettings({ ...settings, bankrUsername: e.target.value })}
              placeholder="e.g. @yourbankrhandle"
              disabled={loading}
            />
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.bankrEnabled}
              onChange={e => setSettings({ ...settings, bankrEnabled: e.target.checked })}
              disabled={loading}
            />
            <span>Enable Bankr integration</span>
          </label>

          <button
            className="action-btn primary-btn"
            onClick={handleSave}
            disabled={loading || !settings.veniceApiKey.trim()}
          >
            {loading ? 'Saving...' : 'Save Settings'}
          </button>

          {status && <p className="inline-status">{status}</p>}
        </section>
      )}

      {!settings.veniceApiKey.trim() && !loading && showSetup && (
        <div className="info-banner">
          <p>Enter your Venice API key to enable AI reply suggestions.</p>
          <p>Get your key from the Venice AI dashboard.</p>
        </div>
      )}
      </main>

      <footer className="popup-footer">
        <p>{manifestStatus}</p>
      </footer>
    </div>
  );
}

export default App;
