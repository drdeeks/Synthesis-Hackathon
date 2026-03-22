export interface Settings {
  veniceApiKey: string;
  bankrUsername: string;
  bankrEnabled: boolean;
  bankrApiKey: string;
  githubToken: string;
}

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

export async function getSettings(): Promise<Settings | null> {
  try {
    const settings = await chrome.storage.local.get(['veniceApiKey', 'bankrUsername', 'bankrEnabled']);
    if (settings.veniceApiKey !== undefined || settings.bankrUsername !== undefined || settings.bankrEnabled !== undefined) {
      return {
        veniceApiKey: normalizeApiKey(settings.veniceApiKey),
        bankrUsername: settings.bankrUsername || '',
        bankrEnabled: settings.bankrEnabled !== undefined ? settings.bankrEnabled : true,
        bankrApiKey: normalizeApiKey(settings.bankrApiKey),
        githubToken: normalizeApiKey(settings.githubToken)
      };
    }
    return null;
  } catch (error) {
    console.error('Failed to get settings:', error);
    return null;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  try {
    await chrome.storage.local.set({
      ...settings,
      veniceApiKey: normalizeApiKey(settings.veniceApiKey)
    });
  } catch (error) {
    console.error('Failed to save settings:', error);
    throw error;
  }
}
