/// <reference types="chrome" />

import { getSettings, saveSettings } from '../shared/storage';

chrome.runtime.onMessage.addListener((request: any, _sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) => {
  if (request.action === 'getCurrentTab') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const result = tabs[0] || null;
      sendResponse(result);
    });
    return true; // Keep message channel open for async response
  }

  if (request.action === 'getSettings') {
    getSettings().then(settings => sendResponse(settings), _error => sendResponse(null));
    return true;
  }

  if (request.action === 'saveSettings') {
    saveSettings(request.settings).then(() => sendResponse({ success: true }), _error => sendResponse(null));
    return true;
  }
});