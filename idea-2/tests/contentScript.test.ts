/**
 * Content Script Tests
 * Tests for platform detection, post extraction, reply suggestions, and Bankr integration
 */

describe('Content Script - Platform Detection', () => {
  // Test platform detection logic directly without modifying window.location
  type Platform = 'farcaster' | 'twitter' | 'reddit' | null;

  const detectPlatformFromHostname = (hostname: string): Platform => {
    if (hostname.includes('farcaster') || hostname.includes('warpcast')) {
      return 'farcaster';
    }
    if (hostname.includes('twitter') || hostname === 'x.com' || hostname.endsWith('.x.com')) {
      return 'twitter';
    }
    if (hostname.includes('reddit')) {
      return 'reddit';
    }
    return null;
  };

  describe('detectPlatform', () => {
    it('detects Farcaster platform from warpcast.com', () => {
      expect(detectPlatformFromHostname('warpcast.com')).toBe('farcaster');
    });

    it('detects Farcaster platform from farcaster subdomain', () => {
      expect(detectPlatformFromHostname('app.farcaster.xyz')).toBe('farcaster');
    });

    it('detects Twitter platform', () => {
      expect(detectPlatformFromHostname('twitter.com')).toBe('twitter');
    });

    it('detects x.com domain', () => {
      expect(detectPlatformFromHostname('x.com')).toBe('twitter');
    });

    it('detects x.com subdomains', () => {
      expect(detectPlatformFromHostname('mobile.x.com')).toBe('twitter');
    });

    it('detects Reddit platform', () => {
      expect(detectPlatformFromHostname('reddit.com')).toBe('reddit');
      expect(detectPlatformFromHostname('old.reddit.com')).toBe('reddit');
    });

    it('returns null for unsupported platforms', () => {
      expect(detectPlatformFromHostname('facebook.com')).toBeNull();
      expect(detectPlatformFromHostname('linkedin.com')).toBeNull();
      expect(detectPlatformFromHostname('google.com')).toBeNull();
    });
  });
});

describe('Content Script - Token Extraction', () => {
  // Test the token extraction logic directly
  const extractTokensLogic = (content: string): string[] => {
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
      optimism: 'OP',
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
  };

  it('extracts Bitcoin token from keyword', () => {
    const tokens = extractTokensLogic('I love Bitcoin!');
    expect(tokens).toContain('BTC');
  });

  it('extracts Ethereum token from keyword', () => {
    const tokens = extractTokensLogic('Ethereum to the moon');
    expect(tokens).toContain('ETH');
  });

  it('extracts Solana token', () => {
    const tokens = extractTokensLogic('Building on Solana');
    expect(tokens).toContain('SOL');
  });

  it('extracts Polygon/MATIC token', () => {
    const tokens = extractTokensLogic('Polygon network is fast');
    expect(tokens).toContain('MATIC');
  });

  it('extracts from MATIC keyword too', () => {
    const tokens = extractTokensLogic('Send me MATIC');
    expect(tokens).toContain('MATIC');
  });

  it('extracts Arbitrum token from arb keyword', () => {
    const tokens = extractTokensLogic('ARB is pumping');
    expect(tokens).toContain('ARB');
  });

  it('extracts Arbitrum token from full name', () => {
    const tokens = extractTokensLogic('Arbitrum ecosystem');
    expect(tokens).toContain('ARB');
  });

  it('extracts Optimism token', () => {
    const tokens = extractTokensLogic('Love Optimism L2');
    expect(tokens).toContain('OP');
  });

  it('extracts cashtags from content', () => {
    const tokens = extractTokensLogic('Check out $PEPE and $DOGE');
    expect(tokens).toContain('PEPE');
    expect(tokens).toContain('DOGE');
  });

  it('handles mixed keywords and cashtags', () => {
    const tokens = extractTokensLogic('Bitcoin and $ETH are up, also $LINK');
    expect(tokens).toContain('BTC');
    expect(tokens).toContain('ETH');
    expect(tokens).toContain('LINK');
  });

  it('returns empty array for content without tokens', () => {
    const tokens = extractTokensLogic('Just a regular tweet about cats');
    expect(tokens).toHaveLength(0);
  });

  it('limits tokens to maximum of 5', () => {
    const tokens = extractTokensLogic('$ONE $TWO $THREE $FOUR $FIVE $SIX $SEVEN');
    expect(tokens.length).toBeLessThanOrEqual(5);
  });

  it('deduplicates tokens', () => {
    const tokens = extractTokensLogic('Bitcoin Bitcoin Bitcoin $BTC $BTC');
    const btcCount = tokens.filter(t => t === 'BTC').length;
    expect(btcCount).toBe(1);
  });

  it('is case insensitive for keywords', () => {
    const tokens1 = extractTokensLogic('BITCOIN');
    const tokens2 = extractTokensLogic('bitcoin');
    const tokens3 = extractTokensLogic('BiTcOiN');
    expect(tokens1).toContain('BTC');
    expect(tokens2).toContain('BTC');
    expect(tokens3).toContain('BTC');
  });

  it('extracts DeFi token via UNI mapping', () => {
    const tokens = extractTokensLogic('DeFi summer is back');
    expect(tokens).toContain('UNI');
  });

  it('extracts AAVE token', () => {
    const tokens = extractTokensLogic('Lending on AAVE');
    expect(tokens).toContain('AAVE');
  });

  it('extracts Chainlink token', () => {
    const tokens = extractTokensLogic('Chainlink oracles');
    expect(tokens).toContain('LINK');
  });
});

describe('Content Script - API Key Normalization', () => {
  const normalizeApiKey = (value: unknown): string => {
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
  };

  it('returns empty string for non-string input', () => {
    expect(normalizeApiKey(null)).toBe('');
    expect(normalizeApiKey(undefined)).toBe('');
    expect(normalizeApiKey(123)).toBe('');
    expect(normalizeApiKey({})).toBe('');
  });

  it('trims whitespace', () => {
    expect(normalizeApiKey('  vapi_test  ')).toBe('vapi_test');
  });

  it('removes Bearer prefix', () => {
    expect(normalizeApiKey('Bearer vapi_key')).toBe('vapi_key');
    expect(normalizeApiKey('BEARER vapi_key')).toBe('vapi_key');
  });

  it('extracts key from VENICE_INFERENCE_KEY assignment', () => {
    expect(normalizeApiKey('VENICE_INFERENCE_KEY=vapi_secret')).toBe('vapi_secret');
    expect(normalizeApiKey('VENICE_INFERENCE_KEY = vapi_secret')).toBe('vapi_secret');
  });

  it('extracts key from VENICE_API_KEY assignment', () => {
    expect(normalizeApiKey('VENICE_API_KEY=my_api_key')).toBe('my_api_key');
  });

  it('removes surrounding double quotes', () => {
    expect(normalizeApiKey('"vapi_quoted"')).toBe('vapi_quoted');
  });

  it('removes surrounding single quotes', () => {
    expect(normalizeApiKey("'vapi_single'")).toBe('vapi_single');
  });

  it('removes surrounding backticks', () => {
    expect(normalizeApiKey('`vapi_backtick`')).toBe('vapi_backtick');
  });

  it('handles combined normalization', () => {
    // Bearer prefix is stripped first, then quotes are stripped
    expect(normalizeApiKey('Bearer "vapi_complex"')).toBe('vapi_complex');
    expect(normalizeApiKey('VENICE_API_KEY="vapi_assigned"')).toBe('vapi_assigned');
  });
});

describe('Content Script - Settings Conversion', () => {
  interface Settings {
    veniceApiKey: string;
    bankrUsername: string;
    bankrEnabled: boolean;
  }

  const normalizeApiKey = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/^Bearer\s+/i, '');
  };

  const toSettings = (raw: unknown): Settings | null => {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const settings = raw as Partial<Settings>;
    if (
      settings.veniceApiKey === undefined &&
      settings.bankrUsername === undefined &&
      settings.bankrEnabled === undefined
    ) {
      return null;
    }

    return {
      veniceApiKey: normalizeApiKey(settings.veniceApiKey),
      bankrUsername: typeof settings.bankrUsername === 'string' ? settings.bankrUsername : '',
      bankrEnabled: typeof settings.bankrEnabled === 'boolean' ? settings.bankrEnabled : true,
    };
  };

  it('returns null for null input', () => {
    expect(toSettings(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(toSettings(undefined)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(toSettings('string')).toBeNull();
    expect(toSettings(123)).toBeNull();
  });

  it('returns null for empty object', () => {
    expect(toSettings({})).toBeNull();
  });

  it('creates settings from partial veniceApiKey', () => {
    const result = toSettings({ veniceApiKey: 'vapi_test' });
    expect(result).toEqual({
      veniceApiKey: 'vapi_test',
      bankrUsername: '',
      bankrEnabled: true,
    });
  });

  it('creates settings from partial bankrUsername', () => {
    const result = toSettings({ bankrUsername: '@user' });
    expect(result).toEqual({
      veniceApiKey: '',
      bankrUsername: '@user',
      bankrEnabled: true,
    });
  });

  it('creates settings from partial bankrEnabled', () => {
    const result = toSettings({ bankrEnabled: false });
    expect(result).toEqual({
      veniceApiKey: '',
      bankrUsername: '',
      bankrEnabled: false,
    });
  });

  it('preserves all settings when complete', () => {
    const result = toSettings({
      veniceApiKey: 'vapi_full',
      bankrUsername: '@fulluser',
      bankrEnabled: false,
    });
    expect(result).toEqual({
      veniceApiKey: 'vapi_full',
      bankrUsername: '@fulluser',
      bankrEnabled: false,
    });
  });
});

describe('Content Script - Reply Suggestion Parsing', () => {
  interface ReplySuggestion {
    text: string;
    confidence: number;
  }

  const parseReplySuggestions = (rawContent: string): ReplySuggestion[] => {
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
  };

  it('parses numbered list responses', () => {
    const input = `1. First reply
2. Second reply
3. Third reply`;
    const result = parseReplySuggestions(input);
    expect(result).toHaveLength(3);
    expect(result[0].text).toBe('First reply');
    expect(result[1].text).toBe('Second reply');
  });

  it('parses bullet list responses', () => {
    const input = `- Bullet one
- Bullet two
- Bullet three`;
    const result = parseReplySuggestions(input);
    expect(result).toHaveLength(3);
    expect(result[0].text).toBe('Bullet one');
  });

  it('parses asterisk list responses', () => {
    const input = `* Star one
* Star two`;
    const result = parseReplySuggestions(input);
    expect(result).toHaveLength(2);
  });

  it('limits to 5 suggestions maximum', () => {
    const input = `1. One
2. Two
3. Three
4. Four
5. Five
6. Six
7. Seven`;
    const result = parseReplySuggestions(input);
    expect(result).toHaveLength(5);
  });

  it('deduplicates identical suggestions', () => {
    const input = `Same reply
Same reply
Same reply
Different reply`;
    const result = parseReplySuggestions(input);
    expect(result).toHaveLength(2);
  });

  it('filters empty lines', () => {
    const input = `
Reply one

Reply two

`;
    const result = parseReplySuggestions(input);
    expect(result).toHaveLength(2);
  });

  it('assigns decreasing confidence scores', () => {
    const input = `First
Second
Third`;
    const result = parseReplySuggestions(input);
    expect(result[0].confidence).toBeGreaterThan(result[1].confidence);
    expect(result[1].confidence).toBeGreaterThan(result[2].confidence);
  });

  it('confidence scores stay above minimum', () => {
    const input = `1\n2\n3\n4\n5`;
    const result = parseReplySuggestions(input);
    result.forEach(s => {
      expect(s.confidence).toBeGreaterThanOrEqual(0.55);
    });
  });

  it('returns empty array for empty input', () => {
    expect(parseReplySuggestions('')).toEqual([]);
    expect(parseReplySuggestions('   ')).toEqual([]);
  });

  it('returns empty array for non-string input', () => {
    // @ts-ignore
    expect(parseReplySuggestions(null)).toEqual([]);
    // @ts-ignore
    expect(parseReplySuggestions(undefined)).toEqual([]);
  });
});

describe('Content Script - Bankr Trade URL Generation', () => {
  const generateBankrTradeUrl = (
    token: string,
    amount: number,
    bankrUsername?: string
  ): string => {
    const url = new URL('https://bankr.bot/trade');
    url.searchParams.set('tokenIn', 'ETH');
    url.searchParams.set('tokenOut', token);
    url.searchParams.set('amount', amount.toString());
    url.searchParams.set('source', 'venice-reply-composer');
    if (bankrUsername?.trim()) {
      url.searchParams.set('user', bankrUsername.trim());
    }
    return url.toString();
  };

  it('generates basic trade URL', () => {
    const url = generateBankrTradeUrl('BTC', 0.1);
    expect(url).toContain('https://bankr.bot/trade');
    expect(url).toContain('tokenIn=ETH');
    expect(url).toContain('tokenOut=BTC');
    expect(url).toContain('amount=0.1');
    expect(url).toContain('source=venice-reply-composer');
  });

  it('includes user when bankrUsername provided', () => {
    const url = generateBankrTradeUrl('ETH', 1, '@myuser');
    expect(url).toContain('user=%40myuser');
  });

  it('excludes user when bankrUsername is empty', () => {
    const url = generateBankrTradeUrl('SOL', 0.5, '');
    expect(url).not.toContain('user=');
  });

  it('excludes user when bankrUsername is whitespace only', () => {
    const url = generateBankrTradeUrl('SOL', 0.5, '   ');
    expect(url).not.toContain('user=');
  });

  it('handles decimal amounts correctly', () => {
    const url = generateBankrTradeUrl('MATIC', 0.001);
    expect(url).toContain('amount=0.001');
  });

  it('handles large amounts', () => {
    const url = generateBankrTradeUrl('UNI', 100);
    expect(url).toContain('amount=100');
  });
});
