# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Smart Web Collector is a Chrome Extension (Manifest V3) for intelligent web data collection, enrichment, and export. It uses vanilla JavaScript (ES6 modules) with no build step - files are loaded directly as native ES modules.

## Development Setup

### Loading the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `/Users/aayush07/Desktop/smart-web-collector` folder
5. Extension ID: `ebohhjfipgpbmjobfenajldkimehapoa` (stable due to `key.pem`)

### Extension ID Stability

The `key.pem` file in the repository ensures the Extension ID remains stable across reloads. Do not delete this file during development, as it will change the Extension ID and break existing `chrome.storage` data.

## Architecture

### Core Components

| Component | File | Purpose |
|-----------|------|---------|
| Background Service Worker | `background.js` | Central coordinator; handles context menus, message passing, AI requests |
| Content Script | `content.js` | Captures text selection; shows collection picker overlay |
| Magic Bar | `content-magic-bar.js` | AI-powered floating command bar (Ctrl+Z / Cmd+Z) |
| Side Panel | `sidepanel.html/js/css` | Main management interface for collections |
| Item View | `item-view.html/js/css` | Individual item detail view with AI chat |
| Popup | `popup.html/js` | Extension icon popup |

### Module System (`modules/`)

| Module | Purpose |
|--------|---------|
| `storage.js` | IndexedDB wrapper (`SmartWebCollectorDB`, version 2) |
| `ai.js` | Google Gemini API integration with model fallback |
| `export.js` | CSV export utilities |
| `parser.js` | Data type detection (`DataDetector` class) |
| `auth.js` | Authentication handling |
| `github.js` | GitHub integration for auto-commit |
| `self_audit.js` | Self-audit validation before GitHub commit |
| `enrichment.js` | Data enrichment logic (mock API) |
| `mapping.js` | Smart column mapping |
| `templates.js` | Template engine with `{placeholders}` |
| `validation.js` | Data validation (email, phone, etc.) |
| `background-effect.js` | Visual effects |

### Message Flow

```
Content Script (content.js)
    ↓ (sendMessage)
Background Service Worker (background.js)
    ↓ (import/modules)
Storage (modules/storage.js) or AI (modules/ai.js)
```

The Magic Bar operates directly in the content script but delegates AI calls to the background worker due to CORS restrictions.

### Data Storage

IndexedDB database `SmartWebCollectorDB` (version 2) with stores:
- `collections` - Main data store for collected items
- `versions` - Version history (new in v2)
- `audits` - Audit logs (new in v2)

Item structure:
```javascript
{
  type: 'text' | 'contact' | 'price' | 'ai_extraction',
  data: { content, html?, structured? },
  source: { url, title, timestamp },
  enriched: {},
  validation: { status, issues },
  tags: []
}
```

## Critical Areas (Do Not Modify Without Care)

1. **`manifest.json`** - Defines permissions and security headers. Syntax errors prevent extension loading.
2. **`modules/storage.js`** - Changing `DB_NAME` or `DB_VERSION` without migration scripts causes data loss.
3. **`modules/ai.js`** - Prompts are tuned for structured JSON output. Changes can cause invalid JSON responses.
4. **`content-magic-bar.js`** - Shadow DOM injection logic is critical for UI isolation. Changing z-index may break visibility.
5. **`key.pem`** - Deleting changes Extension ID, breaking existing storage data.

## Testing

### Manual Testing

Use `test-page.html` for development testing:
```bash
open /Users/aayush07/Desktop/smart-web-collector/test-page.html
```

### Automated Testing

QA tests use Puppeteer (located in `tests/qa_test.js`). Run with:
```bash
node tests/qa_test.js
```

Note: Automated tests require the extension to be loaded with the specific Extension ID.

### Debug Commands

In the Side Panel console:
```javascript
// View all collections
storage.getCollections().then(c => console.log(c));

// View specific collection
storage.getCollection(id).then(c => console.log(c));

// Check item structure
storage.getCollections().then(c => console.log(JSON.stringify(c[0].items[0], null, 2)));
```

## AI Integration

The extension integrates with Google AI Studio (Gemini API). API key is stored in `chrome.storage.sync` with key `google_ai_api_key`.

Model fallback strategy in `modules/ai.js`:
1. `gemini-2.0-flash`
2. `gemini-2.0-flash-exp`
3. `gemini-1.5-flash`

## File Organization

- Root-level files are entry points (content scripts, background, HTML pages)
- `modules/` contains shared business logic
- `lib/` contains third-party libraries (Three.js)
- `assets/` contains icons and static resources
- `tests/` contains QA automation tests

## Common Tasks

### Adding a New Module

1. Create file in `modules/`
2. Export classes/functions: `export class MyModule { }`
3. Import in `background.js`: `import { MyModule } from './modules/my-module.js'`

### Adding Content Script Features

Content scripts are defined in `manifest.json`. The Magic Bar and content script communicate via `chrome.runtime.sendMessage`.

### Debugging Service Worker

1. Go to `chrome://extensions/`
2. Click "Inspect service worker" on the extension card
3. Check console for background script errors
