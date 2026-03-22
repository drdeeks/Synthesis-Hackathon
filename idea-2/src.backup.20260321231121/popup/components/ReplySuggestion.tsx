import { useState } from 'react'

interface ReplySuggestionProps {
  suggestion: {
    text: string
    confidence: number
    tokens: number
    bankrTokens?: string[]
  }
  onClick: () => void
  isSelected: boolean
}

export default function ReplySuggestion({ suggestion, onClick, isSelected }: ReplySuggestionProps) {
  const [hovered, setHovered] = useState(false)

  const confidenceColor = () => {
    if (suggestion.confidence > 0.8) return '#10b981'
    if (suggestion.confidence > 0.6) return '#f59e0b'
    return '#ef4444'
  }

  return (
    <div
      className={`suggestion-card ${isSelected ? 'selected' : ''} ${hovered ? 'hovered' : ''}`}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="suggestion-text">{suggestion.text}</div>
      
      <div className="suggestion-stats">
        <span className="confidence" style={{ color: confidenceColor() }}>
          {Math.round(suggestion.confidence * 100)}% confidence
        </span>
        <span className="tokens">{suggestion.tokens} tokens</span>
      </div>

      {suggestion.bankrTokens && suggestion.bankrTokens.length > 0 && (
        <div className="bankr-indicators">
          {suggestion.bankrTokens.map((token) => (
            <span key={token} className="bankr-badge">
              {token}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}