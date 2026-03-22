import { jest } from '@jest/globals';

// Mock storage module
const mockGetSettings = jest.fn();
const mockSaveSettings = jest.fn();

jest.mock('../src/shared/storage', () => ({
  getSettings: () => mockGetSettings(),
  saveSettings: (settings: any) => mockSaveSettings(settings),
}));

// Mock chrome API
const messageListeners: Array<(request: any, sender: any, sendResponse: (response: any) => void) => boolean | void> = [];

const mockChrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn((listener: any) => {
        messageListeners.push(listener);
      }),
    },
  },
  tabs: {
    query: jest.fn(),
  },
};

// @ts-ignore
global.chrome = mockChrome;

describe('Background Script Message Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    messageListeners.length = 0;
  });

  const simulateMessage = async (request: any): Promise<any> => {
    // Load the background script which registers listeners
    jest.isolateModules(() => {
      require('../src/background/background');
    });

    return new Promise((resolve) => {
      const sendResponse = jest.fn((response: any) => resolve(response));
      const listener = messageListeners[0];
      if (listener) {
        listener(request, {} as chrome.runtime.MessageSender, sendResponse);
      }
    });
  };

  describe('getCurrentTab action', () => {
    it('returns the current active tab', async () => {
      const mockTab = { id: 123, url: 'https://twitter.com' };
      mockChrome.tabs.query.mockImplementation((query: any, callback: any) => {
        callback([mockTab]);
      });

      const response = await simulateMessage({ action: 'getCurrentTab' });
      expect(response).toEqual(mockTab);
      expect(mockChrome.tabs.query).toHaveBeenCalledWith(
        { active: true, currentWindow: true },
        expect.any(Function)
      );
    });

    it('returns null when no tabs available', async () => {
      mockChrome.tabs.query.mockImplementation((query: any, callback: any) => {
        callback([]);
      });

      const response = await simulateMessage({ action: 'getCurrentTab' });
      expect(response).toBeNull();
    });
  });

  describe('getSettings action', () => {
    it('returns settings from storage', async () => {
      const mockSettings = {
        veniceApiKey: 'vapi_test',
        bankrUsername: '@user',
        bankrEnabled: true,
      };
      mockGetSettings.mockResolvedValue(mockSettings);

      const response = await simulateMessage({ action: 'getSettings' });
      expect(response).toEqual(mockSettings);
    });

    it('returns null when no settings exist', async () => {
      mockGetSettings.mockResolvedValue(null);

      const response = await simulateMessage({ action: 'getSettings' });
      expect(response).toBeNull();
    });

    it('returns null on error', async () => {
      mockGetSettings.mockRejectedValue(new Error('Storage error'));

      const response = await simulateMessage({ action: 'getSettings' });
      expect(response).toBeNull();
    });
  });

  describe('saveSettings action', () => {
    it('saves settings and returns success', async () => {
      mockSaveSettings.mockResolvedValue(undefined);

      const settingsToSave = {
        veniceApiKey: 'vapi_new',
        bankrUsername: '@newuser',
        bankrEnabled: false,
      };

      const response = await simulateMessage({
        action: 'saveSettings',
        settings: settingsToSave,
      });

      expect(response).toEqual({ success: true });
      expect(mockSaveSettings).toHaveBeenCalledWith(settingsToSave);
    });

    it('returns null on save error', async () => {
      mockSaveSettings.mockRejectedValue(new Error('Save failed'));

      const response = await simulateMessage({
        action: 'saveSettings',
        settings: { veniceApiKey: 'test' },
      });

      expect(response).toBeNull();
    });
  });
});
