# Zappo: Smart Web Collector

A risk-controlled browser automation layer and intelligence transformation engine. Zappo bridges the gap between raw web data and actionable structured intelligence through a secure, governable, and vendor-independent architecture.

---

## Core Value Proposition

Zappo provides enterprise-ready web intelligence automation directly within the browser ecosystem. It replaces brittle scraping scripts and uncontrolled AI workflows with a structured, verifiable, and auditable pipeline.

- **Risk-Controlled AI Automation:** Executes data extraction with explicit intent, avoiding runaway LLM loops or unchecked web crawling.
- **Structured Intelligence Transformation:** Converts unstructured web data (pages, RSS feeds, deep links) into reliable, schema-compliant JSON formats.
- **Built-in Audit & Traceability:** Every extraction generates a permanent `auditId` and immutable version snapshot, ensuring clear lineage for all data decisions.
- **Vendor-Independent AI Core:** An abstracted routing layer allows seamless switching between major AI providers (Anthropic, OpenAI, Google) to prevent vendor lock-in and optimize for specific models.
- **Local-First Architecture:** Eliminates third-party server risks by managing state, API keys, and collected intelligence securely within the browser's local sandbox (IndexedDB and secure sync).
- **Reduced Operational Risk:** Replaces manual research time with structured, parallelized collection while respecting domain bot protections and rate limits.
- **Faster Decision Cycles:** Accelerates time-to-insight through automated Deep Enrich workflows and real-time Explainable Intelligence panels.

---

## Feature Overview

- **Magic Bar Interface**
  - *Function:* An intent-driven command palette overlay (accessible via `Cmd+Z`) for executing natural language extraction requests on any web page.
  - *Value:* Removes the need for complex, predefined scrapers by allowing users to define extraction schemas dynamically.

- **RSS Feed Ingestion Strategy**
  - *Function:* Aggregates and normalizes 10+ items from multiple trusted feed sources based on user intent (e.g., "Extract latest AI funding news").
  - *Value:* Dramatically accelerates market research and situational awareness by providing pre-structured, multi-source intelligence briefs.

- **Deep Enrich Intelligence Pipeline**
  - *Function:* Paralleled expansion of linked top-level entities (max 7 concurrent requests). Visits underlying URLs, extracts full text, and generates consolidated executive briefs.
  - *Value:* Multiplies research depth automatically without requiring users to manually open dozens of tabs, compiling vast amounts of data into strategic signals.

- **Self-Verifying AI Architecture**
  - *Function:* A rigorous two-pass pipeline. Pass 1 extracts data; Pass 2 acts as a deterministic auditor comparing the output against the exact source text, generating confidence scores.
  - *Value:* Eliminates AI hallucination risks by flagging unsupported data before it enters the workflow.

- **Explainable Web Intelligence Panel**
  - *Function:* A dedicated UI layer that exposes the underlying extraction logic, displaying confidence scores, extraction reasoning, and exact source text snippets for every data point.
  - *Value:* Builds trust in automated outputs by keeping the "black box" of AI completely transparent to the user.

- **Immutable Version Snapshots**
  - *Function:* Every modification, extraction, or deep enrichment creates a timestamped, irreversible snapshot of the data state.
  - *Value:* Provides robust governance and rollback capabilities, ensuring data integrity over the lifecycle of a document.

- **AI Assistant Tab**
  - *Function:* A conversational interface deeply integrated into the Item View, allowing users to interact directly with the extracted intelligence (e.g., summarize, rewrite, analyze).
  - *Value:* Enhances workflow efficiency by allowing immediate, context-aware AI operations on governed data without leaving the application.

- **Provider-Agnostic AI Router**
  - *Function:* Interfaces with Google Gemini, Anthropic Claude, and OpenAI via a unified API abstraction layer.
  - *Value:* Ensures operational continuity and the capability to leverage the best-in-class model for specific extraction tasks without rewriting core logic.

- **Controlled Parallel Processing**
  - *Function:* Manages simultaneous data fetching operations (like fetching feeds or Deep Enrich) within strict concurrency limits (e.g., max 3 active connections).
  - *Value:* Prevents browser lockups, respects remote server limits, and ensures network stability during mass ingestion events.

- **Graceful Bot Handling**
  - *Function:* Automatically detects and skips domains guarded by Cloudflare challenges, CAPTCHAs, or aggressive rate limiting without crashing the primary thread.
  - *Value:* Ensures robust pipeline stability and maintains operational stealth, preventing IP bans and workflow disruptions.
  - *Improvement over Typical Macros:* Standard macros fail catastrophically on bot-walls. Zappo recognizes them, logs the blockage, and gracefully continues processing remaining items.

---

## Architecture Flow

The system operates on an explicit, linear pipeline ensuring maximum transparency and control at every stage.

```text
User Intent (Magic Bar / Dashboard)
       ↓
Source Data Retrieval (DOM / RSS Feeds / Deep Links)
       ↓
Standardization & Normalization
       ↓
AI Extraction Pass (Schema Enforcement)
       ↓
AI Verification Pass (Hallucination Check)
       ↓
Immutable Version Snapshot Creation
       ↓
Storage (Local IndexedDB Repository)
       ↓
Explainable Intelligence Presentation (UI)
       ↓
Optional Deep Enrich Expansion
```

**Key Architectural Tenets:**
- **Separation of Concerns:** Intent parsing, data retrieval, AI routing, and persistence are strictly decoupled.
- **Provider Abstraction:** The core pipeline never calls an API directly; all requests flow through the `AIRouter` interface.
- **Controlled Enrichment:** Background fetching mechanisms are intentionally bottlenecked (e.g. max 7 links) to ensure responsible crawling and to shield the user from chaotic data dumps.
- **Governance Layer:** The `storage.js` module acts as a gatekeeper, enforcing append-only history logs and preventing silent data overwrites.

---

## Setup Instructions

### Requirements
- Node.js (Not strictly required for running the extension, but useful if future build scripts are added)
- Google Chrome browser (Manifest V3 compatible)
- Valid API key from at least one supported provider:
  - Anthropic (Claude 3.5 Sonnet / 3.7 Sonnet)
  - OpenAI (GPT-4o)
  - Google (Gemini 1.5 Pro)

### Installation
1. Clone this repository to your local machine:
   ```bash
   git clone https://github.com/your-org/smart-web-collector.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer Mode** toggle in the top right corner.
4. Click **Load unpacked** and select the cloned repository directory (`smart-web-collector/`).

### API Configuration
API keys are intentionally never hardcoded and must be provided locally by the user post-installation.

1. Click the Zappo extension icon in the Chrome toolbar.
2. Navigate to the **Settings** panel via the gear icon.
3. Select your preferred AI Provider from the dropdown menu.
4. Securely input your API key. (Keys are stored using Chrome's encrypted `chrome.storage.sync` API natively and are never exposed to the DOM).
5. Click **Save Preferences**. The extension is now active and ready for intent execution.

---

## Deep Enrich Infrastructure

The Deep Enrich module transforms surface-level feed lists into comprehensive intelligence briefs by actively visiting downstream links.

- **Strict Bounding:** Enriches a maximum of exactly 7 high-value links per session to maintain high signal-to-noise ratios and prevent unbounded crawling.
- **Safeguarded Parallelism:** Limits concurrent background fetches to a maximum of 3 active requests, preventing browser throttling and respecting remote server loads.
- **Resilient Fetching:** Implements strict 5-second connection timeouts, dropping unresponsive nodes to keep the main thread agile.
- **Graceful Skipping:** Actively parses return headers and DOM structures to skip over anti-bot services (Cloudflare, Distil, CAPTCHAs) without throwing fatal errors.
- **Structured Executive Generation:** Feeds all successfully extracted text batches through a final AI consolidation prompt to produce a unified Strategic Brief and Metric Data Table.
- **Governance First:** Enrichment results are presented to the user dynamically. Only upon explicit manual confirmation ("Save Enriched Intelligence") does the system commit the findings as an irreversible version snapshot.

**Why this is safer than auto-scraping:**
Traditional scrapers operate on unverified DOM selectors and unbounded recursion. Zappo requires explicit human authorization, respects domain limits natively, and forces AI validation on ingested content, fundamentally preventing junk-data contamination.

---

## Security & Governance

Zappo is engineered for enterprise deployment where data lineage and security context are paramount.

- **Local-First Architecture:** All collections, version histories, and AI intelligence configurations are stored exclusively in the browser's local IndexedDB container. No intermediate servers or telemetry endpoints broker your data.
- **Explicit Execution:** The system performs zero background crawling autonomously. All AI extraction and deep enrichment tasks are initiated explicitly by a human operator.
- **Verification Before Trust:** The mandatory two-pass LLM pipeline guarantees that extracted data is proven against the source DOM, assigning explicit confidence scores to AI assertions.
- **Immutable Version History:** All data state changes commit an immutable snapshot. This ensures that no extraction is ever overwritten silently.
- **Audit Traceability:** Every piece of extracted intelligence carries an internal `auditId` and a human-readable AI reasoning payload, making the origin of all data fundamentally verifiable.

---

## Limitations & Guardrails

To strictly control risk and ensure high reliability, the system operates under the following native constraints:

- **Public Content Restriction:** The background worker cannot authenticate into proprietary portals or bypass complex SSO login flows for automated collection runs. Use the foreground Magic Bar for gated content.
- **Bot Protection Deference:** The Deep Enrich engine actively detects and retreats from domain-level defenses (Cloudflare challenges, CAPTCHA walls) rather than attempting to bypass them.
- **AI Output Variance:** Output structure relies heavily on the quality and formatting of the target DOM or RSS feed.
- **Source Dependency:** The reliability of intelligence aggregation is directly proportional to the credibility of the user-provided RSS feeds and target domains.

---

## Future Roadmap

Zappo is building towards a comprehensive knowledge operating system for the browser:

- **Team Workspace Sync:** Secure, end-to-end encrypted synchronization of intelligence collections across enterprise domains and teams.
- **Enterprise Dashboard:** Centralized management of intelligence collections, featuring advanced comparative analytics and trend tracking.
- **Role-Based Controls:** Institutional enforcement mechanisms capable of locking specific AI providers, token limits, or model usage for specific user groups.
- **On-Device AI Support:** Integration with WebGPU and local-LLM architectures (like Llama.cpp WebAssembly) for complete zero-network data extraction capabilities.
- **Automated Workflow Templates:** Pre-configured, reusable intent schemas for standardized operational research routines (e.g., Daily Competitor Pricing Scrapes).
- **API Exposure Layer:** Enabling external downstream applications to securely query the local intelligence repository.
