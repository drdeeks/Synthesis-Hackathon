type AIProvider = 'venice' | 'github' | 'auto';

interface Settings {
  veniceApiKey: string;
  githubToken: string;
  aiProvider: AIProvider;
  bankrApiKey: string;
  bankrUsername: string;
  bankrEnabled: boolean;
  neynarApiKey: string;
  neynarEnabled: boolean;
}

interface AIConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  provider: 'venice' | 'github';
}

const AI_PROVIDERS = {
  venice: {
    name: 'Venice AI',
    baseURL: 'https://api.venice.ai/api/v1',
    model: 'venice-uncensored'
  },
  github: {
    name: 'GitHub Models',
    baseURL: 'https://models.inference.ai.azure.com',
    model: 'gpt-4o-mini'
  }
} as const;

type Platform = 'farcaster' | 'twitter' | 'reddit';

interface Post {
  author: string;
  content: string;
  element: HTMLElement;
  platform: Platform;
}

interface ReplySuggestion {
  text: string;
  confidence: number;
}

const POST_BOUND_ATTR = 'data-venice-reply-bound';
const SUGGESTIONS_CLASS = 'venice-reply-suggestions';
const FARCASTER_FALLBACK_ID = 'venice-farcaster-fallback';
const MANUAL_SUGGESTIONS_PANEL_ID = 'venice-manual-suggestions-panel';
let cachedSettings: Settings | null = null;
let decoratedPostCount = 0;

const PLATFORM_SELECTORS: Record<Platform, string[]> = {
  twitter: ['article[data-testid="tweet"]', 'article[role="article"]'],
  reddit: ['shreddit-post', 'article', 'div[data-testid="post-container"]', 'div[data-test-id="post-content"]'],
  farcaster: ['[data-post-id]', '[data-testid="cast"]', '[data-testid="cast-item"]', '[data-testid="feed-item"]', '[role="article"]', 'article']
};

function normalizeApiKey(value: unknown): string {
  if (typeof value !== 'string') return '';

  let normalized = value.trim();
  if (!normalized) return '';

  const assignmentMatch = normalized.match(/(?:VENICE_INFERENCE_KEY|VENICE_API_KEY)\s*=\s*(.+)$/i);
  if (assignmentMatch) {
    normalized = assignmentMatch[1].trim();
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

function toSettings(raw: unknown): Settings | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const settings = raw as Partial<Settings>;
  if (
    settings.veniceApiKey === undefined
    && settings.githubToken === undefined
    && settings.bankrUsername === undefined
    && settings.bankrEnabled === undefined
  ) {
    return null;
  }

  return {
    veniceApiKey: normalizeApiKey(settings.veniceApiKey),
    githubToken: normalizeApiKey(settings.githubToken),
    aiProvider: (settings.aiProvider as AIProvider) || 'auto',
    bankrApiKey: normalizeApiKey(settings.bankrApiKey),
    bankrUsername: typeof settings.bankrUsername === 'string' ? settings.bankrUsername : '',
    bankrEnabled: typeof settings.bankrEnabled === 'boolean' ? settings.bankrEnabled : true,
    neynarApiKey: normalizeApiKey(settings.neynarApiKey),
    neynarEnabled: typeof settings.neynarEnabled === 'boolean' ? settings.neynarEnabled : true
  };
}

function getAIConfig(settings: Settings, preferredProvider?: 'venice' | 'github'): AIConfig | null {
  const provider = preferredProvider || (settings.aiProvider === 'auto' ? null : settings.aiProvider);
  
  if (provider === 'venice' && settings.veniceApiKey) {
    return {
      baseURL: AI_PROVIDERS.venice.baseURL,
      apiKey: settings.veniceApiKey,
      model: AI_PROVIDERS.venice.model,
      provider: 'venice'
    };
  }
  
  if (provider === 'github' && settings.githubToken) {
    return {
      baseURL: AI_PROVIDERS.github.baseURL,
      apiKey: settings.githubToken,
      model: AI_PROVIDERS.github.model,
      provider: 'github'
    };
  }
  
  // Auto mode: try Venice first, then GitHub
  if (settings.aiProvider === 'auto' || !provider) {
    if (settings.veniceApiKey) {
      return {
        baseURL: AI_PROVIDERS.venice.baseURL,
        apiKey: settings.veniceApiKey,
        model: AI_PROVIDERS.venice.model,
        provider: 'venice'
      };
    }
    if (settings.githubToken) {
      return {
        baseURL: AI_PROVIDERS.github.baseURL,
        apiKey: settings.githubToken,
        model: AI_PROVIDERS.github.model,
        provider: 'github'
      };
    }
  }
  
  return null;
}

function getFallbackConfig(settings: Settings, failedProvider: 'venice' | 'github'): AIConfig | null {
  if (settings.aiProvider !== 'auto') return null;
  
  if (failedProvider === 'venice' && settings.githubToken) {
    return {
      baseURL: AI_PROVIDERS.github.baseURL,
      apiKey: settings.githubToken,
      model: AI_PROVIDERS.github.model,
      provider: 'github'
    };
  }
  
  if (failedProvider === 'github' && settings.veniceApiKey) {
    return {
      baseURL: AI_PROVIDERS.venice.baseURL,
      apiKey: settings.veniceApiKey,
      model: AI_PROVIDERS.venice.model,
      provider: 'venice'
    };
  }
  
  return null;
}

async function getSettingsFromBackground(): Promise<Settings | null> {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    return toSettings(response);
  } catch {
    return null;
  }
}

async function getSettingsFromStorage(): Promise<Settings | null> {
  const fromBackground = await getSettingsFromBackground();
  if (fromBackground) {
    return fromBackground;
  }

  try {
    const raw = await chrome.storage.local.get([
      'veniceApiKey', 'githubToken', 'aiProvider',
      'bankrApiKey', 'bankrUsername', 'bankrEnabled',
      'neynarApiKey', 'neynarEnabled'
    ]);
    return toSettings(raw);
  } catch (error) {
    console.warn('Venice Reply Composer: Failed to get settings in content script context.', error);
    return null;
  }
}

export async function contentScript() {
  if (document.readyState !== 'complete') {
    await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
  }

  cachedSettings = await getSettingsFromStorage();
  const aiConfig = cachedSettings ? getAIConfig(cachedSettings) : null;
  if (!cachedSettings || !aiConfig) {
    console.log('Venice Reply Composer: No AI provider configured (need Venice API key or GitHub token)');
    return;
  }

  const platform = detectPlatform();
  if (!platform) {
    console.log('Venice Reply Composer: Unsupported platform');
    return;
  }

  scanAndDecorate(document.body, platform);

  if (platform === 'farcaster') {
    window.setTimeout(() => {
      if (decoratedPostCount === 0) {
        ensureFarcasterFallbackLauncher();
      }
    }, 1400);
  }

  observePosts(platform);
}

function detectPlatform(): Platform | null {
  if (
    window.location.hostname.includes('farcaster')
    || window.location.hostname.includes('warpcast')
  ) {
    return 'farcaster';
  }
  if (window.location.hostname.includes('twitter') || window.location.hostname === 'x.com' || window.location.hostname.endsWith('.x.com')) return 'twitter';
  if (window.location.hostname.includes('reddit')) return 'reddit';
  return null;
}

function observePosts(platform: Platform) {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          scanAndDecorate(node, platform);

          if (platform === 'farcaster') {
            if (decoratedPostCount === 0) {
              ensureFarcasterFallbackLauncher();
            } else {
              removeFarcasterFallbackLauncher();
            }
          }
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function scanAndDecorate(container: HTMLElement, platform: Platform) {
  const posts = extractPosts(container, platform, container === document.body);
  posts.forEach((post) => {
    addReplyButtons(post);
  });
}

function extractPosts(container: HTMLElement, platform: Platform, allowFarcasterPageFallback = false): Post[] {
  const candidateElements = new Set<HTMLElement>();
  const selectors = PLATFORM_SELECTORS[platform];

  if (selectors.some(selector => container.matches(selector))) {
    candidateElements.add(container);
  }

  selectors.forEach((selector) => {
    container.querySelectorAll<HTMLElement>(selector).forEach((el) => candidateElements.add(el));
  });

  const posts: Post[] = [];
  candidateElements.forEach((element) => {
    if (element.getAttribute(POST_BOUND_ATTR) === 'true') {
      return;
    }

    const content = getPostContent(element, platform);
    if (!content || content.length < 20) {
      return;
    }

    const author = getAuthor(element, platform);
    posts.push({ author, content, element, platform });
  });

  if (platform === 'farcaster' && posts.length === 0 && allowFarcasterPageFallback) {
    const fallbackPost = detectFarcasterSingleCast(container);
    if (fallbackPost) {
      posts.push(fallbackPost);
    }
  }

  return posts;
}

function detectFarcasterSingleCast(container: HTMLElement): Post | null {
  const candidateSelectors = [
    'main [data-testid="cast-text"]',
    'main [data-testid="cast"] [dir="auto"]',
    'main [data-testid="cast-item"] [dir="auto"]',
    'main [data-post-content]',
    'main [dir="auto"]',
    'main p'
  ];

  const nodes: HTMLElement[] = [];
  candidateSelectors.forEach((selector) => {
    container.querySelectorAll<HTMLElement>(selector).forEach((node) => {
      nodes.push(node);
    });
  });

  let best: HTMLElement | null = null;
  let bestLength = 0;

  nodes.forEach((node) => {
    const text = node.innerText?.trim() || '';
    if (text.length > bestLength && text.length >= 16) {
      best = node;
      bestLength = text.length;
    }
  });

  if (!best) {
    return null;
  }

  const bestNode = best as HTMLElement;
  const hostElement = bestNode.closest<HTMLElement>('article, [data-testid="cast"], [data-testid="cast-item"], [data-testid="feed-item"]') || bestNode;
  if (hostElement.getAttribute(POST_BOUND_ATTR) === 'true') {
    return null;
  }

  return {
    author: getAuthor(hostElement, 'farcaster'),
    content: bestNode.innerText.trim(),
    element: hostElement,
    platform: 'farcaster'
  };
}

function getPostContent(element: HTMLElement, platform: Platform): string {
  if (platform === 'twitter') {
    const tweetText = element.querySelector<HTMLElement>('[data-testid="tweetText"]')?.innerText?.trim();
    if (tweetText) return tweetText;

    const fallbackLangText = Array.from(element.querySelectorAll<HTMLElement>('div[lang]'))
      .map((node) => node.innerText.trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    return fallbackLangText;
  }

  if (platform === 'reddit') {
    const selectors = ['[data-test-id="post-content"]', '[slot="text-body"]', '[data-click-id="text"]', '[data-adclicklocation="title"]'];
    for (const selector of selectors) {
      const text = element.querySelector<HTMLElement>(selector)?.innerText?.trim();
      if (text) return text;
    }
    return element.innerText?.trim() || '';
  }

  const farcasterSelectors = [
    '.post-content',
    '[data-testid="cast-text"]',
    '[data-post-content]',
    '[data-testid="cast"] [dir="auto"]',
    '[data-testid="feed-item"] [dir="auto"]',
    '[data-testid="cast-item"] [dir="auto"]',
    '[data-testid="cast"] p',
    '[data-testid="cast-item"] p'
  ];
  for (const selector of farcasterSelectors) {
    const text = element.querySelector<HTMLElement>(selector)?.innerText?.trim();
    if (text) return text;
  }
  return element.innerText?.trim() || '';
}

function getAuthor(element: HTMLElement, platform: Platform): string {
  if (platform === 'twitter') {
    return element.querySelector<HTMLElement>('[data-testid="User-Name"]')?.innerText?.trim() || 'unknown';
  }

  if (platform === 'reddit') {
    return element.querySelector<HTMLElement>('[data-testid="post_author_link"]')?.innerText?.trim()
      || element.querySelector<HTMLElement>('[data-test-id="author"]')?.innerText?.trim()
      || 'unknown';
  }

  return element.querySelector<HTMLElement>('[data-username]')?.innerText?.trim()
    || element.querySelector<HTMLElement>('[data-testid="display-name"]')?.innerText?.trim()
    || element.querySelector<HTMLElement>('a[href^="/"]')?.innerText?.trim()
    || 'unknown';
}

function addReplyButtons(post: Post) {
  if (post.element.getAttribute(POST_BOUND_ATTR) === 'true') {
    return;
  }

  post.element.setAttribute(POST_BOUND_ATTR, 'true');

  const container = document.createElement('div');
  container.className = 'venice-reply';
  container.style.cssText = 'margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;';

  const replyButton = document.createElement('button');
  replyButton.textContent = 'Suggest Reply';
  replyButton.className = 'btn-primary';
  replyButton.onclick = async () => {
    await showReplySuggestions(post);
  };

  container.appendChild(replyButton);

  const detectedTokens = extractTokens(post.content);
  if (cachedSettings?.bankrEnabled !== false && detectedTokens.length > 0) {
    const bankrButton = document.createElement('button');
    bankrButton.textContent = 'Trade';
    bankrButton.className = 'btn-secondary';
    bankrButton.onclick = async () => {
      await executeBankrTrade(post, detectedTokens);
    };
    container.appendChild(bankrButton);
  }

  post.element.appendChild(container);

  decoratedPostCount += 1;
  if (post.platform === 'farcaster' && decoratedPostCount > 0) {
    removeFarcasterFallbackLauncher();
  }
}

function ensureFarcasterFallbackLauncher() {
  if (document.getElementById(FARCASTER_FALLBACK_ID)) {
    return;
  }

  const fallback = document.createElement('div');
  fallback.id = FARCASTER_FALLBACK_ID;
  fallback.style.cssText = 'position: fixed; right: 16px; bottom: 16px; z-index: 2147483645; background: #0f172a; color: #ffffff; border-radius: 12px; padding: 10px; width: 260px; box-shadow: 0 10px 30px rgba(0,0,0,0.28); font-family: system-ui, sans-serif;';

  const launchParams = new URLSearchParams(window.location.search);
  const isFrameLaunch = launchParams.has('launchFrameUrl');

  const title = document.createElement('strong');
  title.textContent = 'Venice Manual Mode';
  title.style.cssText = 'display: block; font-size: 13px; margin-bottom: 4px;';

  const description = document.createElement('p');
  description.textContent = isFrameLaunch
    ? 'Frame page detected. No casts found here, but you can still generate reply ideas manually.'
    : 'No casts detected yet. Use manual mode to generate replies from selected text.';
  description.style.cssText = 'margin: 0 0 8px 0; font-size: 11px; line-height: 1.35; color: #cbd5e1;';

  const actionButton = document.createElement('button');
  actionButton.textContent = 'Generate Suggestions';
  actionButton.style.cssText = 'width: 100%; border: none; border-radius: 8px; background: linear-gradient(135deg, #2563eb, #14b8a6); color: #ffffff; font-size: 12px; font-weight: 600; padding: 8px 10px; cursor: pointer;';
  actionButton.onclick = async () => {
    await openManualSuggestionMode();
  };

  fallback.appendChild(title);
  fallback.appendChild(description);
  fallback.appendChild(actionButton);
  document.body.appendChild(fallback);
}

function removeFarcasterFallbackLauncher() {
  document.getElementById(FARCASTER_FALLBACK_ID)?.remove();
}

async function openManualSuggestionMode() {
  const settings = await getSettingsFromStorage();
  cachedSettings = settings;
  const aiConfig = settings ? getAIConfig(settings) : null;

  if (!settings || !aiConfig) {
    alert('Please configure an AI provider (Venice API key or GitHub token) in extension settings.');
    return;
  }

  const selectedText = window.getSelection()?.toString().trim() || '';
  const sourceText = window.prompt('Paste cast text or your draft prompt for Venice suggestions:', selectedText);
  if (!sourceText || sourceText.trim().length < 5) {
    return;
  }

  try {
    const suggestions = await getReplySuggestions(sourceText.trim(), settings);
    if (!suggestions.length) {
      showTransientNotice('No manual suggestions returned. Try different source text.');
      return;
    }
    renderManualSuggestionPanel(suggestions);
  } catch (error) {
    console.error('Venice Reply Composer: Manual suggestion error:', error);
    alert('Unable to generate manual suggestions right now.');
  }
}

function renderManualSuggestionPanel(suggestions: ReplySuggestion[]) {
  document.getElementById(MANUAL_SUGGESTIONS_PANEL_ID)?.remove();

  const panel = document.createElement('div');
  panel.id = MANUAL_SUGGESTIONS_PANEL_ID;
  panel.style.cssText = 'position: fixed; right: 16px; bottom: 92px; z-index: 2147483645; width: min(380px, calc(100vw - 24px)); max-height: 55vh; overflow-y: auto; background: #ffffff; border: 1px solid #d1d5db; border-radius: 10px; box-shadow: 0 12px 32px rgba(0,0,0,0.22); padding: 10px;';

  const heading = document.createElement('div');
  heading.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;';

  const title = document.createElement('strong');
  title.textContent = 'Manual Suggestions';

  const closeButton = document.createElement('button');
  closeButton.textContent = 'Close';
  closeButton.style.cssText = 'border: none; background: transparent; color: #475569; cursor: pointer; font-size: 12px;';
  closeButton.onclick = () => panel.remove();

  heading.appendChild(title);
  heading.appendChild(closeButton);
  panel.appendChild(heading);

  suggestions.forEach((suggestion) => {
    const button = document.createElement('button');
    button.textContent = suggestion.text;
    button.style.cssText = 'display: block; width: 100%; text-align: left; margin-bottom: 6px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 8px; padding: 8px; color: #0f172a; cursor: pointer;';
    button.onclick = async () => {
      await copyToClipboard(suggestion.text);
      showTransientNotice('Suggestion copied to clipboard.');
    };
    panel.appendChild(button);
  });

  document.body.appendChild(panel);
}

async function showReplySuggestions(post: Post) {
  try {
    const settings = await getSettingsFromStorage();
    cachedSettings = settings;
    const aiConfig = settings ? getAIConfig(settings) : null;
    if (!settings || !aiConfig) {
      alert('Please configure an AI provider (Venice API key or GitHub token) in extension settings.');
      return;
    }

    const suggestions = await getReplySuggestions(post.content, settings);
    if (!suggestions.length) {
      showTransientNotice('No suggestions returned for this post.');
      return;
    }

    const existingPanel = post.element.querySelector<HTMLElement>(`.${SUGGESTIONS_CLASS}`);
    if (existingPanel) {
      existingPanel.remove();
    }

    const panel = document.createElement('div');
    panel.className = SUGGESTIONS_CLASS;
    panel.style.cssText = 'margin-top: 8px; padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; background: #ffffff; box-shadow: 0 4px 14px rgba(0,0,0,0.08); max-width: 540px;';

    const headingRow = document.createElement('div');
    headingRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';

    const title = document.createElement('strong');
    title.textContent = 'Reply Suggestions';

    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.style.cssText = 'border: none; background: transparent; color: #374151; cursor: pointer; font-size: 12px;';
    closeButton.onclick = () => panel.remove();

    headingRow.appendChild(title);
    headingRow.appendChild(closeButton);
    panel.appendChild(headingRow);

    suggestions.forEach((suggestion, index) => {
      const item = document.createElement('button');
      item.textContent = suggestion.text;
      item.style.cssText = 'display: block; width: 100%; text-align: left; margin: 0 0 6px 0; padding: 8px; border: 1px solid #e5e7eb; border-radius: 6px; background: #f8fafc; color: #111827; cursor: pointer;';
      item.title = `Insert suggestion ${index + 1}`;
      item.onclick = async () => {
        await insertReply(post, suggestion.text);
      };
      panel.appendChild(item);
    });

    post.element.appendChild(panel);
  } catch (error) {
    console.error('Venice Reply Composer: Error getting suggestions:', error);
    alert('Error getting reply suggestions. Please verify your Venice API key.');
  }
}

async function fetchNeynarTrending(apiKey: string): Promise<string> {
  try {
    const response = await fetch('https://api.neynar.com/v2/farcaster/feed/trending?limit=5&time_window=24h', {
      headers: { 'api_key': apiKey }
    });
    if (!response.ok) return '';
    
    const data = await response.json();
    const casts = data?.casts || [];
    if (casts.length === 0) return '';
    
    // Extract trending topics from cast text
    const topics = new Set<string>();
    const tokens = new Set<string>();
    
    for (const cast of casts) {
      const text = cast?.text || '';
      // Extract hashtags
      const hashtags = text.match(/#[A-Za-z][A-Za-z0-9_]*/g) || [];
      hashtags.forEach((h: string) => topics.add(h.toLowerCase()));
      // Extract cashtags
      const cashtags = text.match(/\$[A-Za-z][A-Za-z0-9]*/g) || [];
      cashtags.forEach((c: string) => tokens.add(c.toUpperCase()));
    }
    
    const lines: string[] = ['[Trending on Farcaster]'];
    if (tokens.size > 0) lines.push(`Tokens: ${Array.from(tokens).slice(0, 5).join(', ')}`);
    if (topics.size > 0) lines.push(`Topics: ${Array.from(topics).slice(0, 5).join(', ')}`);
    
    return lines.length > 1 ? lines.join('\n') : '';
  } catch {
    return '';
  }
}

async function getReplySuggestionsWithConfig(content: string, config: AIConfig, trendingContext?: string): Promise<ReplySuggestion[]> {
  const systemPrompt = trendingContext
    ? `You generate concise, high-quality social replies. Return 5 unique replies, each under 280 characters.\n\n${trendingContext}`
    : 'You generate concise, high-quality social replies. Return 5 unique replies, each under 280 characters.';

  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content
        }
      ],
      max_tokens: 700,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${config.provider} API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content;
  if (!rawContent || typeof rawContent !== 'string') {
    return [];
  }

  const unique = new Set<string>();
  rawContent
    .split(/\n+/)
    .map((line: string) => line.replace(/^[-*\d.)\s]+/, '').trim())
    .filter((line: string) => line.length > 0)
    .forEach((line: string) => unique.add(line));

  return Array.from(unique)
    .slice(0, 5)
    .map((text, i) => ({ text, confidence: Math.max(0.55, 0.88 - i * 0.06) }));
}

async function getReplySuggestions(content: string, settings: Settings): Promise<ReplySuggestion[]> {
  const config = getAIConfig(settings);
  if (!config) {
    throw new Error('No AI provider configured');
  }

  // Fetch trending context if Neynar is enabled
  let trendingContext = '';
  if (settings.neynarEnabled && settings.neynarApiKey) {
    trendingContext = await fetchNeynarTrending(settings.neynarApiKey);
  }

  try {
    return await getReplySuggestionsWithConfig(content, config, trendingContext);
  } catch (error) {
    // Try fallback provider in auto mode
    const fallback = getFallbackConfig(settings, config.provider);
    if (fallback) {
      console.log(`Venice Reply Composer: ${config.provider} failed, trying ${fallback.provider}`);
      return await getReplySuggestionsWithConfig(content, fallback, trendingContext);
    }
    throw error;
  }
}

async function insertReply(post: Post, text: string) {
  const localSelectors = [
    'textarea',
    'div[role="textbox"][contenteditable="true"]',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"]'
  ];

  let target: HTMLElement | null = null;
  for (const selector of localSelectors) {
    target = post.element.querySelector<HTMLElement>(selector);
    if (target) break;
  }

  if (!target) {
    for (const selector of localSelectors) {
      target = document.querySelector<HTMLElement>(selector);
      if (target) break;
    }
  }

  if (!target) {
    await copyToClipboard(text);
    showTransientNotice('Copied suggestion to clipboard. Open a reply box and paste it.');
    return;
  }

  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    target.value = text;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    target.focus();
  } else {
    target.textContent = text;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.focus();
  }

  await copyToClipboard(text);
  showTransientNotice('Suggestion inserted and copied to clipboard.');
}

async function executeBankrTrade(post: Post, preDetectedTokens?: string[]) {
  const settings = await getSettingsFromStorage();
  cachedSettings = settings;

  const tokens = preDetectedTokens && preDetectedTokens.length > 0
    ? preDetectedTokens
    : extractTokens(post.content);
  if (!tokens.length) {
    alert('No token symbols found in this post.');
    return;
  }

  let selectedToken = tokens[0];
  if (tokens.length > 1) {
    const selected = window.prompt(`Multiple tokens found (${tokens.join(', ')}). Enter token symbol to trade:`, tokens[0]);
    if (!selected) {
      return;
    }

    const upper = selected.trim().toUpperCase();
    if (!tokens.includes(upper)) {
      alert(`Token ${upper} is not in detected list.`);
      return;
    }
    selectedToken = upper;
  }

  const amountInput = window.prompt('Amount in ETH to swap', '0.1');
  if (!amountInput) {
    return;
  }

  const parsedAmount = Number.parseFloat(amountInput);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    alert('Please enter a valid positive amount.');
    return;
  }

  // If Bankr API key is configured, use the Agent API
  if (settings?.bankrApiKey?.trim()) {
    try {
      showTransientNotice('Submitting trade to Bankr...');
      
      const prompt = `swap ${parsedAmount} ETH to ${selectedToken} on base`;
      const response = await fetch('https://api.bankr.bot/agent/prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': settings.bankrApiKey.trim()
        },
        body: JSON.stringify({ prompt })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Bankr API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      if (data.success && data.jobId) {
        showTransientNotice(`Trade submitted! Job ID: ${data.jobId.slice(0, 8)}...`);
        
        // Poll for result (simplified - just show status)
        setTimeout(async () => {
          try {
            const statusResponse = await fetch(`https://api.bankr.bot/agent/job/${data.jobId}`, {
              headers: { 'X-API-Key': settings.bankrApiKey.trim() }
            });
            const statusData = await statusResponse.json();
            if (statusData.status === 'completed') {
              showTransientNotice('Trade completed! ✅');
            } else if (statusData.status === 'failed') {
              showTransientNotice('Trade failed: ' + (statusData.error || 'Unknown error'));
            } else {
              showTransientNotice(`Trade status: ${statusData.status}`);
            }
          } catch {
            // Ignore polling errors
          }
        }, 5000);
        
        return;
      } else {
        throw new Error(data.message || 'Failed to submit trade');
      }
    } catch (error) {
      console.error('Bankr API trade error:', error);
      showTransientNotice('Bankr API error - falling back to link mode');
      // Fall through to link mode
    }
  }

  // Fallback: Open Bankr trade link
  const url = new URL('https://bankr.bot/trade');
  url.searchParams.set('tokenIn', 'ETH');
  url.searchParams.set('tokenOut', selectedToken);
  url.searchParams.set('amount', parsedAmount.toString());
  url.searchParams.set('source', 'venice-reply-composer');
  if (settings?.bankrUsername?.trim()) {
    url.searchParams.set('user', settings.bankrUsername.trim());
  }

  const win = window.open(url.toString(), '_blank', 'noopener,noreferrer');
  if (!win) {
    alert('Popup blocked. Please allow popups for this site and try again.');
  }
}

function extractTokens(content: string): string[] {
  const keywordMap: Record<string, string> = {
    bitcoin: 'BTC',
    ethereum: 'ETH',
    solana: 'SOL',
    polygon: 'MATIC',
    matic: 'MATIC',
    uniswap: 'UNI',
    defi: 'UNI',
    aave: 'AAVE',
    chainlink: 'LINK',
    arb: 'ARB',
    arbitrum: 'ARB',
    optimism: 'OP'
  };

  const tokenSet = new Set<string>();
  const lower = content.toLowerCase();
  Object.entries(keywordMap).forEach(([keyword, symbol]) => {
    const keywordRegex = new RegExp(`(^|[^a-z0-9])${keyword}([^a-z0-9]|$)`, 'i');
    if (keywordRegex.test(lower)) {
      tokenSet.add(symbol);
    }
  });

  const cashtagMatches = content.match(/\$([A-Za-z][A-Za-z0-9]{1,9})/g) || [];
  cashtagMatches.forEach((match) => {
    tokenSet.add(match.replace('$', '').toUpperCase());
  });

  return Array.from(tokenSet).slice(0, 5);
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Best-effort fallback only.
  }
}

function showTransientNotice(message: string) {
  const existing = document.getElementById('venice-reply-toast');
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement('div');
  toast.id = 'venice-reply-toast';
  toast.textContent = message;
  toast.style.cssText = 'position: fixed; right: 16px; bottom: 16px; z-index: 2147483646; background: #111827; color: #ffffff; padding: 10px 12px; border-radius: 8px; font-size: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.22);';
  document.body.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 2600);
}

(window as any).veniceReplyContentScript = {
  contentScript,
  detectPlatform,
  extractPosts,
  addReplyButtons
};
