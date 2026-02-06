# Smart Web Collector

A Chrome Extension for intelligent web data collection, enrichment, and export.

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `smart-web-collector` folder

## Usage

### Collecting Data
1. Visit any webpage
2. Select text you want to save
3. Right-click → **Save to Smart Collector**
4. Data is automatically saved to the "Unsorted" collection

### Managing Collections
1. Click the extension icon in Chrome toolbar OR open the Side Panel
2. View all your collections in the sidebar
3. Click **+** to create a new collection
4. Click on a collection to view its items

### Enriching Data
1. Select a collection with items
2. Click **Enrich** button
3. Wait for the enrichment process to complete
4. Enriched items will show a ✨ badge

### Generating Templates
1. Select a collection with items
2. Click **Templates** button
3. Write your template using placeholders like `{name}`, `{company}`, `{source_url}`
4. Preview updates in real-time
5. Click **Copy All** to generate documents for all items

### Exporting Data
1. Select a collection
2. Click **Export** button
3. Map your data fields to standard columns (auto-mapping attempts to help)
4. Click **Export** to download CSV

- ✅ Web data collection via context menu
- ✅ Collection management (create, view, delete)
- ✅ AI Magic Bar for natural language extraction
- ✅ Data enrichment
- ✅ Data validation (email, phone, etc.)
- ✅ Smart column mapping
- ✅ Template-based document generation
- ✅ CSV export

## Troubleshooting

**Context menu not showing?**
- Make sure you've selected text before right-clicking
- Reload the extension at `chrome://extensions/`
- Check the service worker console for errors

**Side panel not opening?**
- Look for the Side Panel icon (≡) in Chrome's top-right area
- Alternatively, click the extension icon → "View All Collections"

## Development

### Project Structure
```
smart-web-collector/
├── public/                # Static assets & Manifest
│   ├── manifest.json      # Extension configuration
│   └── icons/             # Extension icons
├── src/                   # Source code
│   ├── background.js      # Service worker
│   ├── content.js         # Content script
│   ├── content-magic-bar.js # Magic Bar UI
│   ├── sidepanel.js       # Side panel logic
│   └── modules/           # Core library modules
│       ├── storage.js     # IndexedDB wrapper
│       ├── ai.js          # Gemini AI integration
│       └── export.js      # Export utilities
└── lib/                   # External libraries
```

### Tech Stack
- Vanilla JavaScript (ES6 modules)
- IndexedDB for local storage
- Chrome Extension Manifest V3

## License

MIT
