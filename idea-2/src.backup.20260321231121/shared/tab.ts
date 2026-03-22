interface Tab {
  id?: number;
  url?: string;
}

async function getCurrentTab(): Promise<Tab | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        resolve(tabs[0]);
      } else {
        resolve(null);
      }
    });
  });
}

export { getCurrentTab };