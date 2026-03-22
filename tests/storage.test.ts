import { getSettings, saveSettings } from '../src/shared/storage';

// Mock chrome.storage.local
const mockStorageLocal = {
  get: jest.fn(),
  set: jest.fn(),
};

// @ts-ignore
global.chrome = {
  storage: {
    local: mockStorageLocal,
  },
};

describe('Storage Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSettings', () => {
    it('returns null when no settings are stored', async () => {
      mockStorageLocal.get.mockResolvedValue({});
      const result = await getSettings();
      expect(result).toBeNull();
    });

    it('returns settings when veniceApiKey is stored', async () => {
      mockStorageLocal.get.mockResolvedValue({
        veniceApiKey: 'vapi_test123',
        bankrUsername: '@user',
        bankrEnabled: true,
      });

      const result = await getSettings();
      expect(result).toEqual({
        veniceApiKey: 'vapi_test123',
        bankrUsername: '@user',
        bankrEnabled: true,
        bankrApiKey: '',
        githubToken: '',
      });
    });

    it('normalizes API key with Bearer prefix', async () => {
      mockStorageLocal.get.mockResolvedValue({
        veniceApiKey: 'Bearer vapi_test123',
      });

      const result = await getSettings();
      expect(result?.veniceApiKey).toBe('vapi_test123');
    });

    it('normalizes API key with VENICE_INFERENCE_KEY assignment', async () => {
      mockStorageLocal.get.mockResolvedValue({
        veniceApiKey: 'VENICE_INFERENCE_KEY=vapi_test123',
      });

      const result = await getSettings();
      expect(result?.veniceApiKey).toBe('vapi_test123');
    });

    it('normalizes API key with VENICE_API_KEY assignment', async () => {
      mockStorageLocal.get.mockResolvedValue({
        veniceApiKey: 'VENICE_API_KEY=vapi_mykey',
      });

      const result = await getSettings();
      expect(result?.veniceApiKey).toBe('vapi_mykey');
    });

    it('removes surrounding double quotes from API key', async () => {
      mockStorageLocal.get.mockResolvedValue({
        veniceApiKey: '"vapi_quoted"',
      });

      const result = await getSettings();
      expect(result?.veniceApiKey).toBe('vapi_quoted');
    });

    it('removes surrounding single quotes from API key', async () => {
      mockStorageLocal.get.mockResolvedValue({
        veniceApiKey: "'vapi_single'",
      });

      const result = await getSettings();
      expect(result?.veniceApiKey).toBe('vapi_single');
    });

    it('removes surrounding backticks from API key', async () => {
      mockStorageLocal.get.mockResolvedValue({
        veniceApiKey: '`vapi_backtick`',
      });

      const result = await getSettings();
      expect(result?.veniceApiKey).toBe('vapi_backtick');
    });

    it('defaults bankrEnabled to true when not specified', async () => {
      mockStorageLocal.get.mockResolvedValue({
        veniceApiKey: 'vapi_test',
      });

      const result = await getSettings();
      expect(result?.bankrEnabled).toBe(true);
    });

    it('preserves bankrEnabled as false when explicitly set', async () => {
      mockStorageLocal.get.mockResolvedValue({
        veniceApiKey: 'vapi_test',
        bankrEnabled: false,
      });

      const result = await getSettings();
      expect(result?.bankrEnabled).toBe(false);
    });

    it('returns null and logs error on storage failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockStorageLocal.get.mockRejectedValue(new Error('Storage error'));

      const result = await getSettings();
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('handles non-string veniceApiKey gracefully', async () => {
      mockStorageLocal.get.mockResolvedValue({
        veniceApiKey: 12345, // number instead of string
      });

      const result = await getSettings();
      expect(result?.veniceApiKey).toBe('');
    });

    it('handles empty string veniceApiKey', async () => {
      mockStorageLocal.get.mockResolvedValue({
        veniceApiKey: '   ',
        bankrUsername: '@user',
      });

      const result = await getSettings();
      expect(result?.veniceApiKey).toBe('');
    });
  });

  describe('saveSettings', () => {
    it('saves settings to chrome storage', async () => {
      mockStorageLocal.set.mockResolvedValue(undefined);

      await saveSettings({
        veniceApiKey: 'vapi_newkey',
        bankrUsername: '@newuser',
        bankrEnabled: true,
      });

      expect(mockStorageLocal.set).toHaveBeenCalledWith({
        veniceApiKey: 'vapi_newkey',
        bankrUsername: '@newuser',
        bankrEnabled: true,
        bankrApiKey: '',
        githubToken: '',
      });
    });

    it('normalizes API key before saving', async () => {
      mockStorageLocal.set.mockResolvedValue(undefined);

      await saveSettings({
        veniceApiKey: 'Bearer vapi_bearer_key',
        bankrUsername: '',
        bankrEnabled: true,
      });

      expect(mockStorageLocal.set).toHaveBeenCalledWith(
        expect.objectContaining({
          veniceApiKey: 'vapi_bearer_key',
        })
      );
    });

    it('normalizes assignment format API key before saving', async () => {
      mockStorageLocal.set.mockResolvedValue(undefined);

      await saveSettings({
        veniceApiKey: 'VENICE_API_KEY=vapi_assigned',
        bankrUsername: '',
        bankrEnabled: false,
      });

      expect(mockStorageLocal.set).toHaveBeenCalledWith(
        expect.objectContaining({
          veniceApiKey: 'vapi_assigned',
        })
      );
    });

    it('throws error on storage failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockStorageLocal.set.mockRejectedValue(new Error('Save failed'));

      await expect(
        saveSettings({
          veniceApiKey: 'vapi_test',
          bankrUsername: '',
          bankrEnabled: true,
        })
      ).rejects.toThrow('Save failed');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
