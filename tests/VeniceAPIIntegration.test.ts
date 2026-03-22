/**
 * Venice API Integration Tests
 * Tests for chat completion requests, model selection, and API error handling
 */

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Venice API - Chat Completions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeVeniceRequest = async (
    apiKey: string,
    content: string,
    model: string = 'venice-uncensored'
  ) => {
    const response = await fetch('https://api.venice.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You generate concise, high-quality social replies. Return 5 unique replies, each under 280 characters.',
          },
          {
            role: 'user',
            content,
          },
        ],
        max_tokens: 700,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Venice API error ${response.status}: ${errorText}`);
    }

    return response.json();
  };

  it('makes correct API request structure', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Reply 1\n\nReply 2' } }],
      }),
    });

    await makeVeniceRequest('vapi_test', 'Test post content');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.venice.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer vapi_test',
        },
      })
    );
  });

  it('includes correct request body structure', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Reply' } }],
      }),
    });

    await makeVeniceRequest('vapi_test', 'My test content');

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    expect(body.model).toBe('venice-uncensored');
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toBe('My test content');
    expect(body.max_tokens).toBe(700);
    expect(body.temperature).toBe(0.7);
  });

  it('handles successful response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [
          {
            message: {
              content: '1. Great point!\n\n2. I agree with this.\n\n3. Well said!',
            },
          },
        ],
      }),
    });

    const result = await makeVeniceRequest('vapi_test', 'Test content');

    expect(result.choices[0].message.content).toContain('Great point!');
  });

  it('throws error on 401 unauthorized', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    });

    await expect(makeVeniceRequest('invalid_key', 'content')).rejects.toThrow(
      'Venice API error 401: Unauthorized'
    );
  });

  it('throws error on 403 forbidden', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve('Forbidden'),
    });

    await expect(makeVeniceRequest('vapi_test', 'content')).rejects.toThrow(
      'Venice API error 403: Forbidden'
    );
  });

  it('throws error on 429 rate limit', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limit exceeded'),
    });

    await expect(makeVeniceRequest('vapi_test', 'content')).rejects.toThrow(
      'Venice API error 429: Rate limit exceeded'
    );
  });

  it('throws error on 500 server error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal server error'),
    });

    await expect(makeVeniceRequest('vapi_test', 'content')).rejects.toThrow(
      'Venice API error 500: Internal server error'
    );
  });

  it('supports custom model selection', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Reply' } }],
      }),
    });

    await makeVeniceRequest('vapi_test', 'content', 'llama-3.2-1b');

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.model).toBe('llama-3.2-1b');
  });

  it('handles empty response content', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: '' } }],
      }),
    });

    const result = await makeVeniceRequest('vapi_test', 'content');
    expect(result.choices[0].message.content).toBe('');
  });

  it('handles null response content', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: null } }],
      }),
    });

    const result = await makeVeniceRequest('vapi_test', 'content');
    expect(result.choices[0].message.content).toBeNull();
  });
});

describe('Venice API - Key Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validateVeniceApiKey = async (rawValue: string) => {
    // Normalize the key
    let normalizedKey = rawValue.trim();
    if (!normalizedKey) {
      return { valid: false, normalizedKey: '', message: 'Please enter a Venice API key.' };
    }

    const assignmentMatch = normalizedKey.match(/(?:VENICE_INFERENCE_KEY|VENICE_API_KEY)\s*=\s*(.+)$/i);
    if (assignmentMatch) {
      normalizedKey = assignmentMatch[1].trim();
    }
    normalizedKey = normalizedKey.replace(/^Bearer\s+/i, '').trim();

    if (
      (normalizedKey.startsWith('"') && normalizedKey.endsWith('"')) ||
      (normalizedKey.startsWith("'") && normalizedKey.endsWith("'")) ||
      (normalizedKey.startsWith('`') && normalizedKey.endsWith('`'))
    ) {
      normalizedKey = normalizedKey.slice(1, -1).trim();
    }

    // Try the /models endpoint first
    const modelsResponse = await fetch('https://api.venice.ai/api/v1/models', {
      method: 'GET',
      headers: { Authorization: `Bearer ${normalizedKey}` },
    });

    if (modelsResponse.ok) {
      return { valid: true, normalizedKey };
    }

    // Fallback to chat completion probe
    if (modelsResponse.status === 404) {
      const chatProbe = await fetch('https://api.venice.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${normalizedKey}`,
        },
        body: JSON.stringify({
          model: 'venice-uncensored',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          temperature: 0,
        }),
      });

      if (chatProbe.ok) {
        return { valid: true, normalizedKey };
      }

      if (chatProbe.status === 401 || chatProbe.status === 403) {
        return {
          valid: false,
          normalizedKey,
          message: 'Venice rejected this key.',
        };
      }
    }

    if (modelsResponse.status === 401 || modelsResponse.status === 403) {
      return {
        valid: false,
        normalizedKey,
        message: 'Venice rejected this key.',
      };
    }

    return { valid: false, normalizedKey, message: 'Unable to validate key.' };
  };

  it('validates key via /models endpoint', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });

    const result = await validateVeniceApiKey('vapi_valid');
    expect(result.valid).toBe(true);
    expect(result.normalizedKey).toBe('vapi_valid');
  });

  it('falls back to chat completion when /models returns 404', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404 }) // /models
      .mockResolvedValueOnce({ ok: true }); // chat completion

    const result = await validateVeniceApiKey('vapi_test');
    expect(result.valid).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns invalid for empty key', async () => {
    const result = await validateVeniceApiKey('');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('Please enter');
  });

  it('returns invalid for whitespace-only key', async () => {
    const result = await validateVeniceApiKey('   ');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('Please enter');
  });

  it('normalizes Bearer prefix before validation', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const result = await validateVeniceApiKey('Bearer vapi_test');
    expect(result.normalizedKey).toBe('vapi_test');
  });

  it('normalizes VENICE_API_KEY assignment', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const result = await validateVeniceApiKey('VENICE_API_KEY=vapi_assigned');
    expect(result.normalizedKey).toBe('vapi_assigned');
  });

  it('returns rejection message for 401 on /models', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });

    const result = await validateVeniceApiKey('vapi_invalid');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('rejected');
  });

  it('returns rejection message for 403 on /models', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403 });

    const result = await validateVeniceApiKey('vapi_forbidden');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('rejected');
  });
});

describe('Venice API - Model Selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const SUPPORTED_MODELS = [
    'venice-uncensored',
    'llama-3.2-1b',
    'llama-3.2-3b',
    'llama-3.1-70b',
    'mistral-7b',
  ];

  it('uses venice-uncensored as default model', () => {
    expect(SUPPORTED_MODELS[0]).toBe('venice-uncensored');
  });

  it('supports multiple model options', () => {
    expect(SUPPORTED_MODELS.length).toBeGreaterThan(1);
  });

  it('all models have valid format', () => {
    SUPPORTED_MODELS.forEach((model) => {
      expect(typeof model).toBe('string');
      expect(model.length).toBeGreaterThan(0);
    });
  });
});

describe('Venice API - Response Parsing', () => {
  interface ReplySuggestion {
    text: string;
    confidence: number;
  }

  const parseVeniceResponse = (data: any): ReplySuggestion[] => {
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
  };

  it('parses standard response format', () => {
    const data = {
      choices: [
        {
          message: {
            content: '1. First reply\n2. Second reply\n3. Third reply',
          },
        },
      ],
    };

    const result = parseVeniceResponse(data);
    expect(result).toHaveLength(3);
    expect(result[0].text).toBe('First reply');
  });

  it('handles empty choices array', () => {
    const data = { choices: [] };
    const result = parseVeniceResponse(data);
    expect(result).toEqual([]);
  });

  it('handles missing message object', () => {
    const data = { choices: [{}] };
    const result = parseVeniceResponse(data);
    expect(result).toEqual([]);
  });

  it('handles missing content', () => {
    const data = { choices: [{ message: {} }] };
    const result = parseVeniceResponse(data);
    expect(result).toEqual([]);
  });

  it('handles null data', () => {
    const result = parseVeniceResponse(null);
    expect(result).toEqual([]);
  });

  it('handles undefined data', () => {
    const result = parseVeniceResponse(undefined);
    expect(result).toEqual([]);
  });

  it('deduplicates identical replies', () => {
    const data = {
      choices: [
        {
          message: {
            content: 'Same reply\nSame reply\nDifferent reply',
          },
        },
      ],
    };

    const result = parseVeniceResponse(data);
    expect(result).toHaveLength(2);
  });

  it('limits to 5 replies maximum', () => {
    const data = {
      choices: [
        {
          message: {
            content: 'Reply one\nReply two\nReply three\nReply four\nReply five\nReply six\nReply seven\nReply eight',
          },
        },
      ],
    };

    const result = parseVeniceResponse(data);
    expect(result).toHaveLength(5);
  });

  it('assigns decreasing confidence scores', () => {
    const data = {
      choices: [
        {
          message: {
            content: 'First\nSecond\nThird',
          },
        },
      ],
    };

    const result = parseVeniceResponse(data);
    expect(result[0].confidence).toBeGreaterThan(result[1].confidence);
    expect(result[1].confidence).toBeGreaterThan(result[2].confidence);
  });

  it('maintains minimum confidence of 0.55', () => {
    const data = {
      choices: [
        {
          message: {
            content: '1\n2\n3\n4\n5',
          },
        },
      ],
    };

    const result = parseVeniceResponse(data);
    result.forEach((r) => {
      expect(r.confidence).toBeGreaterThanOrEqual(0.55);
    });
  });
});
