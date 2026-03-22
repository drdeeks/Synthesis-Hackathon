interface Settings {
  veniceApiKey: string;
  bankrUsername: string;
  bankrEnabled: boolean;
  bankrApiKey: string;
  githubToken: string;
}

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
    && settings.bankrUsername === undefined
    && settings.bankrEnabled === undefined
  ) {
    return null;
  }

  return {
    veniceApiKey: normalizeApiKey(settings.veniceApiKey),
    bankrUsername: typeof settings.bankrUsername === 'string' ? settings.bankrUsername : '',
    bankrEnabled: typeof settings.bankrEnabled === 'boolean' ? settings.bankrEnabled : true,
    bankrApiKey: normalizeApiKey(settings.bankrApiKey),
    githubToken: normalizeApiKey(settings.githubToken)
  };
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
    const raw = await chrome.storage.local.get(['veniceApiKey', 'bankrUsername', 'bankrEnabled', 'bankrApiKey', 'githubToken']);
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
  if (!cachedSettings || !cachedSettings.veniceApiKey.trim()) {
    console.log('Venice Reply Composer: No API key configured');
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

  if (!settings || !settings.veniceApiKey.trim()) {
    alert('Please configure Venice API key in extension settings.');
    return;
  }

  const selectedText = window.getSelection()?.toString().trim() || '';
  const sourceText = window.prompt('Paste cast text or your draft prompt for Venice suggestions:', selectedText);
  if (!sourceText || sourceText.trim().length < 5) {
    return;
  }

  try {
    const suggestions = await getReplySuggestions(sourceText.trim(), settings.veniceApiKey);
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
    if (!settings || !settings.veniceApiKey.trim()) {
      alert('Please configure Venice API key in extension settings.');
      return;
    }

    const suggestions = await getReplySuggestions(post.content, settings.veniceApiKey);
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

interface AIProvider {
  name: string;
  url: string;
  model: string;
  authHeader: (key: string) => Record<string, string>;
  key: string;
}

function getProviderChain(settings: Settings): AIProvider[] {
  const providers: AIProvider[] = [];

  // 1. Venice (primary — private inference, no data retention)
  if (settings.veniceApiKey?.trim()) {
    providers.push({
      name: 'Venice',
      url: 'https://api.venice.ai/api/v1/chat/completions',
      model: 'venice-uncensored',
      authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
      key: settings.veniceApiKey.trim()
    });
  }

  // 2. Bankr LLM Gateway (fallback — 6 models available)
  if (settings.bankrApiKey?.trim()) {
    providers.push({
      name: 'Bankr',
      url: 'https://llm.bankr.bot/v1/chat/completions',
      model: 'gemini-2.5-flash',
      authHeader: (k) => ({ 'X-API-Key': k }),
      key: settings.bankrApiKey.trim()
    });
  }

  // 3. GitHub Models (free fallback)
  if (settings.githubToken?.trim()) {
    providers.push({
      name: 'GitHub',
      url: 'https://models.inference.ai.azure.com/chat/completions',
      model: 'gpt-4o-mini',
      authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
      key: settings.githubToken.trim()
    });
  }

  return providers;
}

async function callAIProvider(provider: AIProvider, content: string): Promise<string> {
  const response = await fetch(provider.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...provider.authHeader(provider.key)
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        {
          role: 'system',
          content: 'You generate concise, high-quality social replies. Return 5 unique replies, each under 280 characters.'
        },
        { role: 'user', content }
      ],
      max_tokens: 700,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${provider.name} API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content;
  if (!rawContent || typeof rawContent !== 'string') {
    throw new Error(`${provider.name}: empty response`);
  }
  return rawContent;
}

async function getReplySuggestions(content: string, apiKey: string): Promise<ReplySuggestion[]> {
  const settings = cachedSettings || { veniceApiKey: apiKey, bankrUsername: '', bankrEnabled: true, bankrApiKey: '', githubToken: '' };
  const providers = getProviderChain(settings);

  if (providers.length === 0) {
    throw new Error('No AI provider configured. Add a Venice, Bankr, or GitHub API key in settings.');
  }

  let lastError: Error | null = null;
  for (const provider of providers) {
    try {
      console.log(`Venice Reply Composer: trying ${provider.name}...`);
      const rawContent = await callAIProvider(provider, content);

      const unique = new Set<string>();
      rawContent
        .split(/\n+/)
        .map((line: string) => line.replace(/^[-*\d.)\s]+/, '').trim())
        .filter((line: string) => line.length > 0)
        .forEach((line: string) => unique.add(line));

      const suggestions = Array.from(unique)
        .slice(0, 5)
        .map((text, i) => ({ text, confidence: Math.max(0.55, 0.88 - i * 0.06) }));

      console.log(`Venice Reply Composer: ${provider.name} returned ${suggestions.length} suggestions`);
      return suggestions;
    } catch (err) {
      console.warn(`Venice Reply Composer: ${provider.name} failed, trying next...`, err);
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error('All AI providers failed');
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

  // Remove any existing trade modal
  document.getElementById('venice-trade-modal')?.remove();

  let selectedToken = tokens[0];

  // Build inline trade modal
  const overlay = document.createElement('div');
  overlay.id = 'venice-trade-modal';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:999999;display:flex;align-items:center;justify-content:center;';

  const modal = document.createElement('div');
  modal.style.cssText = 'background:#1a1a2e;border-radius:12px;padding:24px;min-width:320px;max-width:400px;color:#fff;font-family:system-ui,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.4);position:relative;';

  // Draggable header
  const dragBar = document.createElement('div');
  dragBar.style.cssText = 'cursor:grab;padding:4px 0 8px;display:flex;justify-content:center;';
  const dragHandle = document.createElement('div');
  dragHandle.style.cssText = 'width:40px;height:4px;background:#333;border-radius:2px;';
  dragBar.appendChild(dragHandle);
  modal.appendChild(dragBar);

  // Make modal draggable
  let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;
  dragBar.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragBar.style.cursor = 'grabbing';
    const rect = modal.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    // Switch from centered flex to absolute positioning
    overlay.style.alignItems = 'flex-start';
    overlay.style.justifyContent = 'flex-start';
    modal.style.position = 'fixed';
    modal.style.left = rect.left + 'px';
    modal.style.top = rect.top + 'px';
    modal.style.margin = '0';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    modal.style.left = (e.clientX - dragOffsetX) + 'px';
    modal.style.top = (e.clientY - dragOffsetY) + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (isDragging) { isDragging = false; dragBar.style.cursor = 'grab'; }
  });

  const title = document.createElement('h3');
  title.textContent = '🔄 Swap via Bankr';
  title.style.cssText = 'margin:0 0 12px;font-size:18px;color:#a78bfa;';

  // Wallet connection section
  const walletSection = document.createElement('div');
  walletSection.style.cssText = 'margin-bottom:16px;padding:10px;border-radius:8px;border:1px solid #333;background:#0a0a1a;';
  const walletStatus = document.createElement('div');
  walletStatus.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';
  const walletInfo = document.createElement('span');
  walletInfo.style.cssText = 'font-size:12px;color:#888;';
  walletInfo.textContent = '🔌 No wallet connected';
  const walletBalance = document.createElement('span');
  walletBalance.style.cssText = 'font-size:12px;color:#4ade80;display:none;';
  const connectBtn = document.createElement('button');
  connectBtn.textContent = 'Connect';
  connectBtn.style.cssText = 'padding:4px 12px;border-radius:6px;border:none;background:#a78bfa;color:#fff;font-size:12px;cursor:pointer;';

  let connectedAddress = '';
  const ethereum = (window as unknown as Record<string, unknown>).ethereum as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } | undefined;

  connectBtn.onclick = async () => {
    if (!ethereum) {
      walletInfo.textContent = '❌ No wallet found';
      walletInfo.style.color = '#f87171';
      return;
    }
    try {
      connectBtn.textContent = '...';
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      if (accounts?.length > 0) {
        connectedAddress = accounts[0];
        const short = connectedAddress.slice(0, 6) + '...' + connectedAddress.slice(-4);
        walletInfo.textContent = `✅ ${short}`;
        walletInfo.style.color = '#4ade80';
        connectBtn.textContent = 'Connected';
        connectBtn.style.background = '#1a3a1a';
        connectBtn.disabled = true;

        // Fetch balance
        try {
          const balHex = await ethereum.request({ method: 'eth_getBalance', params: [connectedAddress, 'latest'] }) as string;
          const balEth = parseInt(balHex, 16) / 1e18;
          walletBalance.textContent = `${balEth.toFixed(4)} ETH`;
          walletBalance.style.display = 'inline';
        } catch { /* balance fetch optional */ }
      }
    } catch (err) {
      walletInfo.textContent = '❌ Connection rejected';
      walletInfo.style.color = '#f87171';
      connectBtn.textContent = 'Retry';
    }
  };

  // Auto-connect if already authorized
  if (ethereum) {
    ethereum.request({ method: 'eth_accounts' }).then((accounts) => {
      const accts = accounts as string[];
      if (accts?.length > 0) {
        connectedAddress = accts[0];
        const short = connectedAddress.slice(0, 6) + '...' + connectedAddress.slice(-4);
        walletInfo.textContent = `✅ ${short}`;
        walletInfo.style.color = '#4ade80';
        connectBtn.textContent = 'Connected';
        connectBtn.style.background = '#1a3a1a';
        connectBtn.disabled = true;
        ethereum.request({ method: 'eth_getBalance', params: [connectedAddress, 'latest'] }).then((balHex) => {
          const balEth = parseInt(balHex as string, 16) / 1e18;
          walletBalance.textContent = `${balEth.toFixed(4)} ETH`;
          walletBalance.style.display = 'inline';
        }).catch(() => {});
      }
    }).catch(() => {});
  } else {
    connectBtn.textContent = 'No Wallet';
    connectBtn.disabled = true;
    connectBtn.style.background = '#333';
  }

  walletStatus.appendChild(walletInfo);
  walletStatus.appendChild(walletBalance);
  walletStatus.appendChild(connectBtn);
  walletSection.appendChild(walletStatus);

  // Token selector
  const tokenLabel = document.createElement('label');
  tokenLabel.textContent = 'Token';
  tokenLabel.style.cssText = 'display:block;font-size:12px;color:#888;margin-bottom:4px;';
  const tokenSelect = document.createElement('select');
  tokenSelect.style.cssText = 'width:100%;padding:10px;border-radius:8px;border:1px solid #333;background:#16213e;color:#fff;font-size:14px;margin-bottom:12px;';
  for (const t of tokens) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    tokenSelect.appendChild(opt);
  }

  // Amount input
  const amountLabel = document.createElement('label');
  amountLabel.textContent = 'Amount (ETH)';
  amountLabel.style.cssText = 'display:block;font-size:12px;color:#888;margin-bottom:4px;';
  const amountInput = document.createElement('input');
  amountInput.type = 'number';
  amountInput.step = '0.01';
  amountInput.min = '0';
  amountInput.value = '0.1';
  amountInput.placeholder = '0.1';
  amountInput.style.cssText = 'width:100%;padding:10px;border-radius:8px;border:1px solid #333;background:#16213e;color:#fff;font-size:14px;margin-bottom:4px;box-sizing:border-box;';

  // USD estimate display
  const usdEstimate = document.createElement('div');
  usdEstimate.style.cssText = 'font-size:12px;color:#888;margin-bottom:16px;';
  usdEstimate.textContent = '≈ $0.00 USD';

  // Fetch ETH price and update estimate
  let ethPrice = 0;
  fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd')
    .then(r => r.json())
    .then(data => {
      ethPrice = data?.ethereum?.usd || 0;
      const val = parseFloat(amountInput.value) || 0;
      usdEstimate.textContent = ethPrice > 0 ? `≈ $${(val * ethPrice).toFixed(2)} USD` : '';
    })
    .catch(() => { usdEstimate.textContent = ''; });

  amountInput.addEventListener('input', () => {
    const val = parseFloat(amountInput.value) || 0;
    usdEstimate.textContent = ethPrice > 0 ? `≈ $${(val * ethPrice).toFixed(2)} USD` : '';
  });

  // Quick amount buttons
  const quickAmounts = document.createElement('div');
  quickAmounts.style.cssText = 'display:flex;gap:8px;margin-bottom:16px;';
  for (const amt of [0.01, 0.05, 0.1, 0.5]) {
    const btn = document.createElement('button');
    btn.textContent = `${amt} ETH`;
    btn.style.cssText = 'flex:1;padding:6px;border-radius:6px;border:1px solid #333;background:#16213e;color:#a78bfa;font-size:12px;cursor:pointer;';
    btn.onmouseover = () => { btn.style.background = '#1a1a4e'; };
    btn.onmouseout = () => { btn.style.background = '#16213e'; };
    btn.onclick = () => {
      amountInput.value = amt.toString();
      amountInput.dispatchEvent(new Event('input'));
    };
    quickAmounts.appendChild(btn);
  }

  // Status area for trade results
  const statusArea = document.createElement('div');
  statusArea.style.cssText = 'display:none;padding:12px;border-radius:8px;margin-bottom:12px;font-size:13px;';

  // Buttons
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'flex:1;padding:10px;border-radius:8px;border:1px solid #333;background:transparent;color:#888;font-size:14px;cursor:pointer;';
  cancelBtn.onclick = () => overlay.remove();

  const swapBtn = document.createElement('button');
  swapBtn.textContent = 'Swap via Bankr';
  swapBtn.style.cssText = 'flex:2;padding:10px;border-radius:8px;border:none;background:#a78bfa;color:#fff;font-size:14px;font-weight:600;cursor:pointer;';
  swapBtn.onmouseover = () => { swapBtn.style.background = '#8b6fd4'; };
  swapBtn.onmouseout = () => { swapBtn.style.background = '#a78bfa'; };
  swapBtn.onclick = async () => {
    const amount = parseFloat(amountInput.value);
    if (!amount || amount <= 0) {
      amountInput.style.borderColor = '#ff4444';
      return;
    }
    selectedToken = tokenSelect.value;

    // Check for Bankr API key
    const bankrKey = settings?.bankrUsername?.trim();

    swapBtn.textContent = '⏳ Submitting...';
    swapBtn.style.background = '#333';
    swapBtn.disabled = true;
    statusArea.style.display = 'block';
    statusArea.style.background = '#16213e';
    statusArea.style.color = '#a78bfa';
    statusArea.textContent = `Submitting: swap ${amount} ETH → ${selectedToken} via Bankr...`;

    try {
      // Use Bankr Agent API to submit the trade
      const response = await fetch('https://api.bankr.bot/agent/prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(bankrKey ? { 'X-API-Key': bankrKey } : {})
        },
        body: JSON.stringify({
          prompt: `swap ${amount} ETH for ${selectedToken}`,
          source: 'venice-reply-composer'
        })
      });

      if (response.ok) {
        const data = await response.json();
        const jobId = data?.jobId || data?.job_id || data?.id;
        statusArea.style.background = '#1a3a1a';
        statusArea.style.color = '#4ade80';
        statusArea.innerHTML = `✅ Trade submitted!${jobId ? `<br><small style="color:#888;">Job ID: ${jobId}</small>` : ''}<br><small style="color:#888;">Check Bankr for confirmation</small>`;
        swapBtn.textContent = '✓ Submitted';
        swapBtn.style.background = '#1a3a1a';
      } else {
        // API failed — fall back to opening Bankr with pre-filled params
        const bankrUrl = `https://bankr.bot/?swap=${selectedToken}&amount=${amount}&from=ETH`;
        statusArea.style.background = '#3a2a1a';
        statusArea.style.color = '#fbbf24';
        statusArea.innerHTML = `⚠️ API unavailable — opening Bankr directly...<br><small style="color:#888;">Complete the swap in the new tab</small>`;
        swapBtn.textContent = 'Open Bankr ↗';
        swapBtn.style.background = '#a78bfa';
        swapBtn.disabled = false;
        swapBtn.onclick = () => {
          window.open(bankrUrl, '_blank', 'noopener,noreferrer');
          overlay.remove();
        };
      }
    } catch {
      // Network error — open Bankr website as fallback
      const bankrUrl = `https://bankr.bot/?swap=${selectedToken}&amount=${amount}&from=ETH`;
      statusArea.style.background = '#3a1a1a';
      statusArea.style.color = '#f87171';
      statusArea.innerHTML = `❌ Network error — opening Bankr directly...`;
      setTimeout(() => {
        window.open(bankrUrl, '_blank', 'noopener,noreferrer');
        overlay.remove();
      }, 1500);
    }
  };

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(swapBtn);

  modal.appendChild(title);
  modal.appendChild(walletSection);
  modal.appendChild(tokenLabel);
  modal.appendChild(tokenSelect);
  modal.appendChild(amountLabel);
  modal.appendChild(amountInput);
  modal.appendChild(usdEstimate);
  modal.appendChild(quickAmounts);
  modal.appendChild(statusArea);
  modal.appendChild(btnRow);
  overlay.appendChild(modal);

  // Close on overlay click
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  // Close on Escape
  const escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);

  document.body.appendChild(overlay);
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
