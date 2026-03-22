import { useState, useEffect } from 'react'
import { OpenAI } from 'openai'
import ReplySuggestion from './ReplySuggestion'

interface ReplySuggestion {
  id: string
  text: string
  confidence: number
  tokens: number
  bankrTokens?: string[]
}

export default function ReplyComposer({ apiKey }: { apiKey: string }) {
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<ReplySuggestion[]>([])
  const [inputText, setInputText] = useState('')
  const [selectedSuggestion, setSelectedSuggestion] = useState<ReplySuggestion | null>(null)

  const veniceClient = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://api.venice.ai/api/v1',
  })

  const getReplySuggestions = async () => {
    if (!apiKey) {
      alert('Please enter your Venice API key in Settings')
      return
    }

    if (inputText.trim().length < 5) {
      alert('Please enter at least 5 characters of text')
      return
    }

    setLoading(true)
    try {
      const response = await veniceClient.chat.completions.create({
        model: 'venice-uncensored',
        messages: [
          {
            role: 'system',
            content: 'You are an AI assistant that provides witty, thoughtful reply suggestions for social media posts. Keep replies under 280 characters.',
          },
          {
            role: 'user',
            content: `Generate 5 witty reply suggestions for this social media post: "${inputText}"`,
          },
        ],
        max_tokens: 1500,
        temperature: 0.7,
      })

      const content = response.choices?.[0]?.message?.content ?? '';
      const suggestions = content
        .split('\n\n')
        .filter(s => s.trim().length > 0)
        .slice(0, 5)
        .map((text, index) => ({
          id: `suggestion-${index}`,
          text: text.trim(),
          confidence: Math.random() * 0.3 + 0.7,
          tokens: text.split(' ').length,
          bankrTokens: getRelevantTokens(text),
        }));

      setSuggestions(suggestions);
    } catch (error) {
      console.error('Error getting suggestions:', error)
      alert('Error generating suggestions. Please check your API key.')
    } finally {
      setLoading(false)
    }
  }

  const getRelevantTokens = (text: string): string[] => {
    const tokenMap = {
      'bitcoin': 'BTC',
      'ethereum': 'ETH',
      'base': 'BASE',
      'solana': 'SOL',
      'polygon': 'MATIC',
      'defi': 'UNI',
      'nft': 'ENS',
    }

    const foundTokens: string[] = []
    for (const [keyword, token] of Object.entries(tokenMap)) {
      if (text.toLowerCase().includes(keyword)) {
        foundTokens.push(token)
      }
    }
    return foundTokens
  }

  const handleSuggestionClick = (suggestion: ReplySuggestion) => {
    setSelectedSuggestion(suggestion)
    navigator.clipboard.writeText(suggestion.text)
  }

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
              <ReplySuggestion
                key={suggestion.id}
                suggestion={suggestion}
                onClick={() => handleSuggestionClick(suggestion)}
                isSelected={selectedSuggestion?.id === suggestion.id}
              />
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
  )
}