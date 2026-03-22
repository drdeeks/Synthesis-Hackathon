import { useState, useEffect } from 'react';
import { getSettings, saveSettings, type Settings as SettingsType, RESPONSE_TYPE_LABELS, type ResponseType, DEFAULT_RESPONSE_TYPES } from '../../shared/storage';
import { getModelsByProvider } from '../../shared/models';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

const BASE_CHAIN_ID = 8453;
const BASE_CHAIN_ID_HEX = '0x2105';

export default function Settings() {
  const [settings, setSettings] = useState<SettingsType>({
    veniceApiKey: '',
    bankrUsername: '',
    bankrEnabled: true,
    bankrApiKey: '',
    githubToken: '',
    responseTypes: DEFAULT_RESPONSE_TYPES,
    veniceModel: 'venice-uncensored',
    bankrModel: 'gemini-2.5-flash',
    githubModel: 'gpt-4o-mini'
  });
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [ethBalance, setEthBalance] = useState<string>('');
  const [walletLoading, setWalletLoading] = useState(false);

  useEffect(() => {
    loadSettings();
    loadWalletFromStorage();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const saved = await getSettings();
      if (saved) {
        setSettings(saved);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadWalletFromStorage() {
    try {
      const result = await chrome.storage.local.get(['connectedWalletAddress']);
      if (result.connectedWalletAddress) {
        setWalletAddress(result.connectedWalletAddress);
        await fetchBalance(result.connectedWalletAddress);
      }
    } catch (err) {
      console.error('Failed to load wallet from storage:', err);
    }
  }

  async function fetchBalance(address: string) {
    if (!window.ethereum) return;
    
    try {
      // Switch to Base chain if needed
      const chainId = await window.ethereum.request({ method: 'eth_chainId' }) as string;
      if (chainId !== BASE_CHAIN_ID_HEX) {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: BASE_CHAIN_ID_HEX }]
        });
      }

      const balanceHex = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [address, 'latest']
      }) as string;
      
      const balanceWei = BigInt(balanceHex);
      const balanceEth = Number(balanceWei) / 1e18;
      setEthBalance(balanceEth.toFixed(4));
    } catch (err) {
      console.error('Failed to fetch balance:', err);
      setEthBalance('Error');
    }
  }

  async function connectWallet() {
    if (!window.ethereum) {
      setStatus('MetaMask not detected');
      return;
    }

    try {
      setWalletLoading(true);
      setStatus('');

      // Request accounts
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      }) as string[];

      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        setWalletAddress(address);

        // Save to storage
        await chrome.storage.local.set({ connectedWalletAddress: address });

        // Fetch balance on Base
        await fetchBalance(address);

        setStatus('Wallet connected successfully!');
        setTimeout(() => setStatus(''), 2000);
      }
    } catch (err) {
      console.error('Wallet connection error:', err);
      setStatus('Failed to connect wallet');
    } finally {
      setWalletLoading(false);
    }
  }

  async function disconnectWallet() {
    setWalletAddress('');
    setEthBalance('');
    await chrome.storage.local.remove('connectedWalletAddress');
    setStatus('Wallet disconnected');
    setTimeout(() => setStatus(''), 2000);
  }

  async function handleSave() {
    try {
      setLoading(true);
      await saveSettings(settings);
      setStatus('Settings saved successfully!');
      setTimeout(() => setStatus(''), 2000);
    } catch (err) {
      setStatus('Failed to save settings');
      console.error('Settings save error:', err);
    } finally {
      setLoading(false);
    }
  }

  function updateResponseType(type: ResponseType, enabled: boolean) {
    setSettings({
      ...settings,
      responseTypes: {
        ...settings.responseTypes,
        [type]: enabled
      }
    });
  }

  const veniceModels = getModelsByProvider('venice');
  const bankrModels = getModelsByProvider('bankr');
  const githubModels = getModelsByProvider('github');

  return (
    <div className="settings">
      <div className="setting-section">
        <label htmlFor="venice-api-key">Venice API Key</label>
        <div className="input-group">
          <input
            type="password"
            id="venice-api-key"
            value={settings.veniceApiKey}
            onChange={(e) => setSettings({ ...settings, veniceApiKey: e.target.value })}
            placeholder="Enter your Venice API key"
            disabled={loading}
          />
        </div>
        <p className="help-text">
          Get your API key from{' '}
          <a href="https://venice.ai/settings/api" target="_blank" rel="noopener noreferrer">
            venice.ai/settings/api
          </a>
        </p>
      </div>

      {settings.veniceApiKey.trim() && (
        <div className="setting-section">
          <label htmlFor="venice-model">Venice Model</label>
          <select
            id="venice-model"
            value={settings.veniceModel || 'venice-uncensored'}
            onChange={(e) => setSettings({ ...settings, veniceModel: e.target.value })}
            disabled={loading}
          >
            {veniceModels.map(model => (
              <option key={model.id} value={model.id}>
                {model.name} — {model.description}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="setting-section">
        <label htmlFor="bankr-api-key">Bankr API Key (Fallback AI + Trading)</label>
        <div className="input-group">
          <input
            type="password"
            id="bankr-api-key"
            value={settings.bankrApiKey}
            onChange={(e) => setSettings({ ...settings, bankrApiKey: e.target.value })}
            placeholder="Bankr API key for LLM Gateway + trading"
            disabled={loading}
          />
        </div>
        <p className="help-text">
          Powers Bankr LLM Gateway (AI fallback) and direct trade execution.
        </p>
      </div>

      {settings.bankrApiKey.trim() && (
        <div className="setting-section">
          <label htmlFor="bankr-model">Bankr Model</label>
          <select
            id="bankr-model"
            value={settings.bankrModel || 'gemini-2.5-flash'}
            onChange={(e) => setSettings({ ...settings, bankrModel: e.target.value })}
            disabled={loading}
          >
            {bankrModels.map(model => (
              <option key={model.id} value={model.id}>
                {model.name} — {model.description}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="setting-section">
        <label htmlFor="github-token">GitHub Token (Free AI Fallback)</label>
        <div className="input-group">
          <input
            type="password"
            id="github-token"
            value={settings.githubToken}
            onChange={(e) => setSettings({ ...settings, githubToken: e.target.value })}
            placeholder="GitHub personal access token"
            disabled={loading}
          />
        </div>
        <p className="help-text">
          Uses GitHub Models (gpt-4o-mini) as free third fallback.
        </p>
      </div>

      {settings.githubToken.trim() && (
        <div className="setting-section">
          <label htmlFor="github-model">GitHub Model</label>
          <select
            id="github-model"
            value={settings.githubModel || 'gpt-4o-mini'}
            onChange={(e) => setSettings({ ...settings, githubModel: e.target.value })}
            disabled={loading}
          >
            {githubModels.map(model => (
              <option key={model.id} value={model.id}>
                {model.name} — {model.description}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="setting-section">
        <label htmlFor="bankr-username">Bankr Username (Optional)</label>
        <input
          type="text"
          id="bankr-username"
          value={settings.bankrUsername}
          onChange={(e) => setSettings({ ...settings, bankrUsername: e.target.value })}
          placeholder="e.g. @yourbankrhandle"
          disabled={loading}
        />
      </div>

      <div className="setting-section">
        <label>
          <input
            type="checkbox"
            checked={settings.bankrEnabled}
            onChange={(e) => setSettings({ ...settings, bankrEnabled: e.target.checked })}
            disabled={loading}
          />
          Enable Bankr integration
        </label>
      </div>

      <div className="setting-section">
        <h3>Response Types</h3>
        <p className="help-text">Choose which types of reply suggestions to generate</p>
        <div className="response-types-grid">
          {(Object.keys(RESPONSE_TYPE_LABELS) as ResponseType[]).map(type => (
            <label key={type} className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.responseTypes[type]}
                onChange={(e) => updateResponseType(type, e.target.checked)}
                disabled={loading}
              />
              <span>{RESPONSE_TYPE_LABELS[type]}</span>
            </label>
          ))}
        </div>
      </div>

      <button
        className="save-btn"
        onClick={handleSave}
        disabled={loading || !settings.veniceApiKey.trim()}
      >
        {loading ? 'Saving...' : 'Save Settings'}
      </button>

      {status && <p className="status-message">{status}</p>}

      <div className="setting-section">
        <h3>Wallet</h3>
        {!window.ethereum ? (
          <div style={{ padding: '10px', background: '#fff3cd', borderRadius: '8px', marginBottom: '12px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#856404' }}>
              No wallet provider detected.{' '}
              <a 
                href="https://metamask.io/download/" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ color: '#0066cc', textDecoration: 'underline' }}
              >
                Install MetaMask
              </a>
            </p>
          </div>
        ) : walletAddress ? (
          <div style={{ padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '20px' }}>✅</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '2px' }}>
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </div>
                {ethBalance && (
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    {ethBalance} ETH on Base
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={disconnectWallet}
              disabled={loading}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                background: '#ffffff',
                color: '#475569',
                fontSize: '13px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={connectWallet}
            disabled={walletLoading || loading}
            style={{
              width: '100%',
              padding: '10px',
              border: 'none',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #2563eb, #14b8a6)',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: '600',
              cursor: walletLoading ? 'wait' : 'pointer'
            }}
          >
            {walletLoading ? 'Connecting...' : 'Connect Wallet'}
          </button>
        )}
        <p className="help-text">
          Connect your wallet to use in-extension trading features on Base chain (chainId 8453).
        </p>
      </div>

      <div className="setting-section">
        <h3>About</h3>
        <div className="about-info">
          <p><strong>Version:</strong> 1.0.0</p>
          <p><strong>Partners:</strong> Venice AI, Bankr</p>
          <p className="help-text">
            This extension uses Venice's private inference API to generate reply
            suggestions and integrates Bankr for inline token trading.
          </p>
        </div>
      </div>
    </div>
  );
}
