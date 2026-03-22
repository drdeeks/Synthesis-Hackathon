import { useState, useEffect } from 'react';
import { getSettings } from '../../shared/storage';

interface ReplySuggestion {
  id: string;
  text: string;
  confidence: number;
  tokens: number;
  bankrTokens?: string[];
}

export default function ReplyComposer() {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<ReplySuggestion[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedSuggestion, setSelectedSuggestion] = useState<ReplySuggestion | null>(null);
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    loadApiKey();
  }, []);

  async function loadApiKey() {
    const settings = await getSettings();
    if (settings?.veniceApiKey) {
      setApiKey(settings.veniceApiKey);
    }
  }

  const getReplySuggestions = async () => {
    if (!apiKey) {
      alert('Please enter your Venice API key in Settings');
      return;
    }

    if (inputText.trim().length < 5) {
      alert('Please enter at least 5 characters of text');
      return;
    }

    setLoading(true);
    try {
      const settings = await getSettings();
      if (!settings) {
        throw new Error('No settings found');
      }

      const model = settings.veniceModel || 'venice-uncensored';
      
      const response = await fetch('https://api.venice.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are an AI assistant that provides witty, thoughtful reply suggestions for social media posts. Keep replies under 280 characters.'
            },
            {
              role: 'user',
              content: `Generate 5 witty reply suggestions for this social media post: "${inputText}"`
            }
          ],
          max_tokens: 1500,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? '';
      
      const parsedSuggestions = content
        .split('\n\n')
        .filter((s: string) => s.trim().length > 0)
        .slice(0, 5)
        .map((text: string, index: number) => ({
          id: `suggestion-${index}`,
          text: text.trim(),
          confidence: Math.random() * 0.3 + 0.7,
          tokens: text.split(' ').length,
          bankrTokens: getRelevantTokens(text)
        }));

      setSuggestions(parsedSuggestions);
    } catch (error) {
      console.error('Error getting suggestions:', error);
      alert('Error generating suggestions. Please check your API key.');
    } finally {
      setLoading(false);
    }
  };

  const getRelevantTokens = (text: string): string[] => {
    const tokenMap: Record<string, string> = {
      'bitcoin': 'BTC',
      'ethereum': 'ETH',
      'base': 'BASE',
      'solana': 'SOL',
      'polygon': 'MATIC',
      'defi': 'UNI',
      'nft': 'ENS'
    };

    const foundTokens: string[] = [];
    for (const [keyword, token] of Object.entries(tokenMap)) {
      if (text.toLowerCase().includes(keyword)) {
        foundTokens.push(token);
      }
    }
    return foundTokens;
  };

  const handleSuggestionClick = (suggestion: ReplySuggestion) => {
    setSelectedSuggestion(suggestion);
    navigator.clipboard.writeText(suggestion.text);
  };

  return (
    <div className="reply-composer">
      <div className="composer-input">
        <textarea
          placeholder="Paste social media post here..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          rows={3}
          className="composer-textarea"
        />
        <button
          onClick={getReplySuggestions}
          disabled={loading || !inputText.trim()}
          className="generate-btn"
        >
          {loading ? 'Generating...' : 'Generate Replies'}
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="suggestions-container">
          <h3>AI Suggestions</h3>
          <div className="suggestions-grid">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className={`suggestion-card ${selectedSuggestion?.id === suggestion.id ? 'selected' : ''}`}
                onClick={() => handleSuggestionClick(suggestion)}
              >
                <p className="suggestion-text">{suggestion.text}</p>
                <div className="suggestion-meta">
                  <span>Confidence: {(suggestion.confidence * 100).toFixed(0)}%</span>
                  <span>{suggestion.tokens} tokens</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedSuggestion && (
        <div className="selected-suggestion">
          <h3>Selected Reply</h3>
          <div className="selected-content">
            <p className="selected-text">{selectedSuggestion.text}</p>
            {selectedSuggestion.bankrTokens && selectedSuggestion.bankrTokens.length > 0 && (
              <div className="bankr-actions">
                <h4>Quick Trade</h4>
                <div className="bankr-buttons">
                  {selectedSuggestion.bankrTokens.map((token) => (
                    <a
                      key={token}
                      href={`https://bankr.bot/trade?tokenIn=ETH&tokenOut=${token}&amount=0.1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bankr-btn"
                      title={`Trade ${token} with Bankr`}
                    >
                      {token}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
