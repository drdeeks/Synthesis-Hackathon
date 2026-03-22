import { getCurrentTab } from '../src/shared/tab';

// Mock chrome.tabs.query
const mockTabsQuery = jest.fn();

// @ts-ignore
global.chrome = {
  tabs: {
    query: mockTabsQuery,
  },
};

describe('Tab Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrentTab', () => {
    it('returns the first active tab', async () => {
      const mockTab = { id: 123, url: 'https://twitter.com' };
      mockTabsQuery.mockImplementation((query, callback) => {
        callback([mockTab]);
      });

      const result = await getCurrentTab();

      expect(result).toEqual(mockTab);
      expect(mockTabsQuery).toHaveBeenCalledWith(
        { active: true, currentWindow: true },
        expect.any(Function)
      );
    });

    it('returns null when no tabs are found', async () => {
      mockTabsQuery.mockImplementation((query, callback) => {
        callback([]);
      });

      const result = await getCurrentTab();
      expect(result).toBeNull();
    });

    it('returns null when tabs array is undefined', async () => {
      mockTabsQuery.mockImplementation((query, callback) => {
        callback(undefined);
      });

      const result = await getCurrentTab();
      expect(result).toBeNull();
    });

    it('returns tab with all properties', async () => {
      const fullTab = {
        id: 456,
        url: 'https://warpcast.com/user',
        title: 'Warpcast',
        active: true,
        windowId: 1,
      };
      mockTabsQuery.mockImplementation((query, callback) => {
        callback([fullTab]);
      });

      const result = await getCurrentTab();
      expect(result?.id).toBe(456);
      expect(result?.url).toBe('https://warpcast.com/user');
    });

    it('returns first tab when multiple tabs match', async () => {
      const tabs = [
        { id: 1, url: 'https://first.com' },
        { id: 2, url: 'https://second.com' },
      ];
      mockTabsQuery.mockImplementation((query, callback) => {
        callback(tabs);
      });

      const result = await getCurrentTab();
      expect(result?.id).toBe(1);
    });

    it('handles tab without id', async () => {
      const tabWithoutId = { url: 'https://example.com' };
      mockTabsQuery.mockImplementation((query, callback) => {
        callback([tabWithoutId]);
      });

      const result = await getCurrentTab();
      expect(result?.id).toBeUndefined();
      expect(result?.url).toBe('https://example.com');
    });

    it('handles tab without url', async () => {
      const tabWithoutUrl = { id: 789 };
      mockTabsQuery.mockImplementation((query, callback) => {
        callback([tabWithoutUrl]);
      });

      const result = await getCurrentTab();
      expect(result?.id).toBe(789);
      expect(result?.url).toBeUndefined();
    });
  });
});
