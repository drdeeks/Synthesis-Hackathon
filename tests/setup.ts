import { jest } from '@jest/globals';
import '@testing-library/jest-dom';

// Mock chrome API
const mockChrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn(),
    },
    sendMessage: jest.fn(),
    getURL: jest.fn(),
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
    },
  },
  tabs: {
    query: jest.fn(),
    create: jest.fn(),
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
  },
};

// @ts-ignore
global.chrome = mockChrome;

// Mock fetch
// @ts-ignore
global.fetch = jest.fn();

// Mock window.open
// @ts-ignore
global.window.open = jest.fn();