import { useState } from 'react'

interface SettingsProps {
  apiKey: string
  onSave: (key: string) => void
}

export default function Settings({ apiKey, onSave }: SettingsProps) {
  const [key, setKey] = useState(apiKey)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    onSave(key)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="settings">
      <div className="setting-section">
        <label htmlFor="venice-api-key">Venice API Key</label>
        <div className="input-group">
          <input
            type="password"
            id="venice-api-key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Enter your Venice API key"
          />
          <button onClick={handleSave} className="save-btn">
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
        <p className="help-text">
          Get your API key from{' '}
          <a href="https://venice.ai/settings/api" target="_blank" rel="noopener noreferrer">
            venice.ai/settings/api
          </a>
        </p>
      </div>

      <div className="setting-section">
        <h3>Bankr Configuration</h3>
        <p className="help-text">
          Bankr deeplinks are enabled by default. No configuration needed.
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
  )
}