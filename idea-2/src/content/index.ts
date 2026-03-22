import { contentScript } from './contentScript';

// Initialize content script with error boundary
(async () => {
  try {
    await contentScript();
  } catch (err) {
    // Silently fail - don't crash the host page
    if (process.env.NODE_ENV === 'development') {
      console.error('Venice Reply Composer: init error', err);
    }
  }
})();
