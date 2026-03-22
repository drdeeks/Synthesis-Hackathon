import { v4 as uuidv4 } from 'uuid'

interface InjectionContext {
  apiKey: string
}

const INJECTION_ID = 'venice-reply-composer-root'

const createStyles = () => {
  const style = document.createElement('style')
  style.id = 'venice-reply-composer-styles'
  style.textContent = `
    .venice-reply-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: linear-gradient(135deg, #e63946 0%, #c1121f 100%);
      border: none;
      color: white;
      font-size: 24px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(230, 57, 70, 0.4);
      z-index: 999999;
      transition: all 0.3s ease;
    }
    .venice-reply-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 16px rgba(230, 57, 70, 0.5);
    }
    .venice-reply-panel {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 999998;
      display: none;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .venice-reply-panel.active {
      display: flex;
    }
    .venice-reply-panel-content {
      background: #1a1a2e;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      width: 100%;
      max-width: 500px;
      max-height: 90vh;
      overflow-y: auto;
      color: #fff;
    }
    .venice-reply-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid #2a2a4a;
    }
    .venice-reply-panel-header h2 {
      margin: 0;
      font-size: 18px;
      color: #e63946;
    }
    .venice-close-btn {
      background: transparent;
      border: none;
      color: #b0b0b0;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }
    .venice-close-btn:hover {
      color: #fff;
    }
  `
  document.head.appendChild(style)
}

const createButton = () => {
  const button = document.createElement('button')
  button.className = 'venice-reply-btn'
  button.innerHTML = '💡'
  button.title = 'AI Reply Composer'
  
  button.addEventListener('click', async () => {
    const panel = document.getElementById('venice-reply-panel')
    if (panel) {
      panel.classList.toggle('active')
    }
  })

  return button
}

const createPanel = () => {
  const panel = document.createElement('div')
  panel.id = 'venice-reply-panel'
  panel.className = 'venice-reply-panel'
  
  panel.innerHTML = `
    <div class="venice-reply-panel-content">
      <div class="venice-reply-panel-header">
        <h2>Venice AI Reply Composer</h2>
        <button class="venice-close-btn">&times;</button>
      </div>
      <div class="venice-reply-panel-body" id="venice-reply-panel-body">
        <div style="padding: 20px; text-align: center; color: #b0b0b0;">
          <p>Sign in to Venice and enable AI replies.</p>
        </div>
      </div>
    </div>
  `

  const closeBtn = panel.querySelector('.venice-close-btn')
  closeBtn?.addEventListener('click', () => {
    panel.classList.remove('active')
  })

  panel.addEventListener('click', (e) => {
    if (e.target === panel) {
      panel.classList.remove('active')
    }
  })

  return panel
}

const postRenderer = (postText: string) => {
  const postElement = document.querySelector('article[data-testid="tweet"]') ||
                     document.querySelector('[data-testid="tweet"]') ||
                     document.querySelector('[data-testid="post"]') ||
                     document.querySelector('.entry-content') ||
                     document.querySelector('main') ||
                     document.body

  return postElement?.textContent || postText
}

const bootstrap = async () => {
  if (document.getElementById(INJECTION_ID)) return

  createStyles()

  const root = document.createElement('div')
  root.id = INJECTION_ID
  document.body.appendChild(root)

  const button = createButton()
  root.appendChild(button)

  const panel = createPanel()
  root.appendChild(panel)

  try {
    const response = await chrome.runtime.sendMessage({ type: 'getApiKey' })
    if (response) {
      renderPanel(panel, response)
    } else {
      showNoApiKey(panel)
    }
  } catch (error) {
    console.error('Error:', error)
    showNoApiKey(panel)
  }
}

const renderPanel = (panel: HTMLElement, apiKey: string) => {
  const body = panel.querySelector('#venice-reply-panel-body')
  if (!body) return

  body.innerHTML = `
    <div style="padding: 20px;">
      <p style="margin-bottom: 16px; color: #b0b0b0;">
        Paste a social media post below to get AI-generated reply suggestions with Bankr trading integration.
      </p>
      <textarea
        id="venice-post-input"
        placeholder="Paste post text here..."
        rows="4"
        style="
          width: 100%;
          padding: 12px;
          border: 1px solid #2a2a4a;
          border-radius: 8px;
          background: #16213e;
          color: #fff;
          font-size: 14px;
          resize: vertical;
        "
      ></textarea>
      <button id="venice-generate-btn" style="
        margin-top: 12px;
        padding: 10px 20px;
        background: #e63946;
        color: #fff;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        width: 100%;
      ">
        Generate Replies
      </button>

      <div id="venice-suggestions" style="margin-top: 20px;"></div>
    </div>
  `

  const input = body.querySelector('#venice-post-input') as HTMLTextAreaElement | null as HTMLTextAreaElement | null
  const generateBtn = body.querySelector('#venice-generate-btn') as HTMLButtonElement | null as HTMLButtonElement | null
  const suggestionsDiv = body.querySelector('#venice-suggestions')

  if (generateBtn && input && suggestionsDiv) {
    generateBtn.addEventListener('click', async () => {
      const postText = input.value.trim()
      if (postText.length < 5) {
        alert('Please enter at least 5 characters')
        return
      }

      generateBtn.textContent = 'Generating...'
      generateBtn.disabled = true

      try {
        const response = await fetch('https://api.venice.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'venice-uncensored',
            messages: [
              {
                role: 'system',
                content: 'You are an AI assistant that provides witty, thoughtful reply suggestions for social media posts. Keep replies under 280 characters.',
              },
              {
                role: 'user',
                content: `Generate 5 unique reply suggestions for this social media post: "${postText}"`,
              },
            ],
            max_tokens: 1500,
            temperature: 0.7,
          }),
        })

        if (!response.ok) throw new Error('Request failed')

        const data = await response.json()
        const content = data.choices?.[0]?.message?.content || ''

        const suggestions = content
          .split('\n\n')
          .filter((s: string) => s.trim().length > 10)
          .slice(0, 5)

        suggestionsDiv.innerHTML = suggestions
          .map((suggestion: string, idx: number) => {
            const tokens = extractTokens(suggestion)
            return `
              <div class="venice-suggestion" style="
                padding: 16px;
                margin-bottom: 12px;
                background: #16213e;
                border-radius: 8px;
                border: 1px solid #2a2a4a;
                cursor: pointer;
                transition: all 0.2s;
              "
              onmouseover="this.style.borderColor='#e63946'"
              onmouseout="this.style.borderColor='#2a2a4a'">
                <p style="margin: 0 0 8px 0; line-height: 1.5;">${escapeHtml(suggestion)}</p>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <small style="color: #b0b0b0;">Suggestion ${idx + 1}</small>
                  ${tokens.length > 0 ? `
                    <div style="display: flex; gap: 6px;">
                      ${tokens.map((t: string) => `
                        <a href="https://bankr.bot/trade?tokenIn=ETH&tokenOut=${t}&amount=0.1"
                           target="_blank"
                           style="
                             background: #0066ff;
                             color: #fff;
                             padding: 4px 12px;
                             border-radius: 20px;
                             font-size: 12px;
                             text-decoration: none;
                           "
                           title="Trade this with Bankr">
                          Trade ${t}
                        </a>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
              </div>
            `
          })
          .join('')

      } catch (error) {
        console.error('Error:', error)
        suggestionsDiv.innerHTML = `
          <div style="padding: 16px; background: #16213e; border-radius: 8px; color: #ef4444;">
            Error generating suggestions. Please check your API key and try again.
          </div>
        `
      } finally {
        generateBtn.textContent = 'Generate Replies'
        generateBtn.disabled = false
      }
    })
  }
}

const showNoApiKey = (panel: HTMLElement) => {
  const body = panel.querySelector('#venice-reply-panel-body')
  if (!body) return
  
  body.innerHTML = `
    <div style="padding: 40px; text-align: center;">
      <p style="color: #b0b0b0; margin-bottom: 20px;">
        Please configure your Venice API key to use this extension.
      </p>
      <button onclick="window.open(chrome.runtime.getURL('popup.html'), '_blank'); return false;" style="
        padding: 12px 24px;
        background: #e63946;
        color: #fff;
        border: none;
        border-radius: 6px;
        cursor: pointer;
      ">
        Open Settings
      </button>
    </div>
  `
}

const extractTokens = (text: string): string[] => {
  const tokenMap: { [key: string]: string } = {
    'bitcoin': 'BTC',
    'ethereum': 'ETH',
    'base': 'BASE',
    'solana': 'SOL',
    'polygon': 'MATIC',
    'defi': 'UNI',
    'uniswap': 'UNI',
    'sushiswap': 'SUSHI',
    'aave': 'AAVE',
    'compound': 'COMP',
    'curve': 'CRV',
    'nft': 'ENS',
    'ens': 'ENS',
  }

  const tokens: string[] = []
  for (const [keyword, token] of Object.entries(tokenMap)) {
    if (text.toLowerCase().includes(keyword)) {
      tokens.push(token)
    }
  }
  return tokens
}

const escapeHtml = (text: string): string => {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

if (['complete', 'interactive'].includes(document.readyState)) {
  bootstrap()
} else {
  document.addEventListener('DOMContentLoaded', bootstrap)
}
