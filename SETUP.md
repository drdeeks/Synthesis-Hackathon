# Venice-Powered AI Reply Composer — Setup & Deployment

## Prerequisites

- Node.js 18+
- npm or yarn
- Chrome browser (or any Chromium-based browser)
- Venice AI API key
- Bankr account

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Build the extension:
```bash
npm run build
```

3. Load into Chrome:
   - Open chrome://extensions/
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

4. Configure Venice API key in the extension popup

## Configuration

Create `.env` file:

```
VENICE_API_KEY=your_venice_api_key_here
```

## Usage

1. Install the extension
2. Open any supported social platform (Farcaster, X, Reddit)
3. Click the extension icon to configure settings
4. Navigate to posts to see reply suggestions
5. Click "Suggest Reply" for AI suggestions
6. Click "Trade" to execute token trades via Bankr

## Supported Platforms

- **Farcaster**: Full support with post detection
- **X (Twitter)**: Full support with tweet detection
- **Reddit**: Full support with post detection
- **Discord**: Limited support (requires manual activation)

## API Keys

- **Venice AI**: Required for AI suggestions
- **Bankr**: Optional for trade execution

## Security

- All AI processing happens via Venice's private API
- No data collection or storage
- Bankr trades require user confirmation
- Extension only runs on supported platforms

## Testing

- Unit tests: `npm test`
- Manual testing in Chrome
- Test on each supported platform

## Deployment

To publish to Chrome Web Store:

1. Update version in `manifest.json`
2. Update icons
3. Run `npm run build`
4. Create ZIP of `dist` folder
5. Upload to Chrome Web Store

## Troubleshooting

**Extension not loading:** Check console for errors, verify permissions in `manifest.json`

**AI suggestions not appearing:** Verify Venice API key and network connectivity

**Bankr buttons not working:** Ensure Bankr account is active and deeplinks are supported

## License

MIT