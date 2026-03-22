import { getSettings, saveSettings } from '../shared/storage';

// Get current tab (simplified for build)
export async function getCurrentTab() {
  return { id: 0, url: '' }; // Mock for build
}

// Background script with minimal Chrome API usage
chrome.runtime.onMessage.addListener((request: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) => {
  if (request.action === 'getCurrentTab') {
    getCurrentTab().then(tab => sendResponse(tab));
    return true;
  }

  if (request.action === 'getSettings') {
    getSettings().then(settings => sendResponse(settings));
    return true;
  }

  if (request.action === 'saveSettings') {
    saveSettings(request.settings).then(() => sendResponse({ success: true }));
    return true;
  }
});