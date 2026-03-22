# Venice-Powered AI Reply Composer for Onchain Social

A browser extension that suggests AI-generated replies using Venice's private inference API, with a Bankr button to execute token trades inline.

## Overview

This extension enhances social media experiences by:
- Analyzing post content with Venice AI for context-aware reply suggestions
- Providing quick reply options with one click
- Adding a Bankr button to execute token trades mentioned in posts

## Features

- **Private AI Replies**: Venice's no-data-retention inference powers suggestions
- **Bankr Integration**: Execute trades inline with Bankr deeplinks
- **Cross-Platform**: Works on Farcaster, X (Twitter), Reddit, and more
- **Context Awareness**: Understands post context for relevant replies
- **Privacy First**: No data collection, all processing local

## Architecture

```
Social Media Page → Content Script → Venice AI → Reply Suggestions
                                      ↓
                                 Bankr Deeplink → Onchain Trade
```

## Stack

- **Chrome Extension (Manifest V3)** - Cross-browser compatibility
- **React + TypeScript** - Modern UI with type safety
- **Vite** - Fast development and bundling
- **Venice AI** - Private inference API
- **Bankr Deeplinks** - Onchain execution

## Setup

1. Install dependencies
2. Configure Venice API key
3. Build extension
4. Load into browser
5. Configure social platforms

## API Keys

- Venice AI API Key (required)
- Bankr account (for deeplinks)

## Supported Platforms

- Farcaster
- X (Twitter)
- Reddit
- Discord (limited)

## Security

- No data collection
- All processing local
- Bankr transactions require user confirmation
- Venice API calls are private

## Future Enhancements

- Support for more platforms
- Custom reply templates
- Analytics dashboard
- Mobile browser support

## License

MIT