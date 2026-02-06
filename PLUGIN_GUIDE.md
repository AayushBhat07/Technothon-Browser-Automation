# 🚀 Smart Web Collector: System Documentation & Guide

Welcome to the **Smart Web Collector** architecture guide. This document provides a comprehensive overview of how the plugin works, its core features, implementation details, critical "don't touch" areas, and its future potential.

---

## 🛠 How It Works

The Smart Web Collector is a Chrome Extension (Manifest V3) designed to transform the way users gather and organize information from the web. It uses a combination of **Content Scripts**, **Background Service Workers**, and **Side Panels** to provide a seamless experience.

1.  **Selection Capture**: When a user selects text and uses the context menu, a content script (`content.js`) captures the text and metadata (URL, Title).
2.  **Magic Bar**: A floating, AI-powered command bar (`content-magic-bar.js`) can be toggled to perform "Deep Extraction" using natural language queries.
3.  **Local Storage**: All data is stored locally in the browser using **IndexedDB**, ensuring privacy and offline access.
4.  **AI Integration**: The system integrates with **Google AI Studio (Gemini)** to structure, verify, and transform unstructured web data into actionable information.

---

## ✨ Implemented Features

| Feature | Description |
| :--- | :--- |
| **Context Menu Save** | Right-click any selection to save it to a specific collection. |
| **AI Magic Bar** | Command-Shift-E (Mac) or Ctrl-Shift-E (Win) to open a bar that extracts data via natural language. |
| **Collection Manager** | Organizes items into custom folders (Collections). |
| **AI Enrichment** | Automatically structures messy text into JSON-like objects (Name, Email, Price, etc.). |
| **Smart Mapping** | Maps extracted fields to standard columns for clean exports. |
| **Template Engine** | Generates personalized documents or messages using `{placeholders}` from your data. |
| **CSV Export** | Clean download of all collected data for use in Excel/Google Sheets. |
| **Theme System** | Multiple visual styles including Modern, Glassmorphism, and Dark Mode. |

---

## 🏗 Implementation Details (The Internal Hub)

The project is built with **Vanilla JavaScript (ES6)** for maximum performance.

-   **Manifest V3**: Compliant with the latest Chrome standards using Service Workers.
-   **Shadow DOM**: The Magic Bar is injected into pages via a Shadow Root to prevent style leaks or conflicts with host websites.
-   **IndexedDB**: Wrapped in `storage.js` for robust, asynchronous data persistence.
-   **Gemini API**: Native integration in `ai.js` using a two-step "Extract & Verify" pipeline for high accuracy.
-   **Message Bus**: `background.js` acts as the central coordinator between the UI and the browser's lower-level APIs.

---

## ⚠️ CRITICAL: Important Things (Do Not Touch)

To maintain system stability, the following areas should **not be edited, deleted, or modified** unless specifically instructed.

### 1. `manifest.json` (The Core Blueprint)
> [!IMPORTANT]
> This file defines permissions (`activeTab`, `storage`, `scripting`) and security headers. Even a small syntax error here can prevent the extension from loading or break AI communication.

### 2. `src/modules/storage.js` (The Data Vault)
> [!CAUTION]
> Changing the IndexedDB name (`SmartWebCollectorDB`) or version without a migration script will cause **permanent data loss** for the user.

### 3. `src/modules/ai.js` (The Prompt Architecture)
The prompts in this file are highly tuned for structured JSON output. Small changes to the "System Instructions" can cause the AI to return invalid JSON or start "hallucinating" data.

### 4. `src/content-magic-bar.js` (UI Isolation)
The injection logic using `.attachShadow({ mode: 'open' })` is critical. Moving this or changing the z-index may cause the bar to become invisible or break event listeners on complex sites.

### 5. `key.pem`
This file ensures the Extension ID remains stable during development. Deleting it will change the Extension ID, breaking existing `chrome.storage` data.

---

## 🔮 Potential & Future Roadmap

The Smart Web Collector is a foundation for a much larger intelligence suite:

-   **Browser Automation**: Expanding the Magic Bar to *perform actions* (e.g., "Find all LinkedIn profiles on this page and send them a connection request").
-   **Cloud Synchronization**: Real-time sync across devices using Firebase or Supabase.
-   **Direct Integrations**: One-click "Export to Notion," "Export to Google Sheets," or "Sync to Salesforce."
-   **Local AI (WebGPU)**: Running Gemini Nano or smaller models entirely in the browser for 100% private, free extractions.
-   **Collaborative Collections**: Shared workspaces where teams can collect and enrich data together.

---

> [!TIP]
> Always use the **Side Panel** for the best management experience. You can open it via the Chrome Sidebar icon or by double-clicking "Overview" in the extension menu.
