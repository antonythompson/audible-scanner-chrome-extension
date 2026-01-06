# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Audible Library Scanner is a Chrome/Edge Manifest V3 browser extension that scans Audible audiobook libraries to detect owned books, track series, and identify new releases available for purchase. Supports 8 Audible regions (US, CA, UK, DE, FR, IT, ES, AU).

## Development

**No build process required** - pure vanilla JavaScript, load directly as unpacked extension.

```bash
# Load in browser
1. Open chrome://extensions/
2. Enable "Developer mode"
3. Click "Load unpacked" and select this folder
```

**Testing:**
- Content script: Visit Audible library page, check browser console
- Sidepanel: Click extension icon to open
- Background: Inspect service worker from chrome://extensions/

## Architecture

```
┌─────────────────────────────────────────┐
│         Audible Tab (content.js)        │
│    AudibleLibraryScanner class          │
│    - Library page scanning (AJAX)       │
│    - Series page fetching               │
│    - Book data extraction               │
└──────────────────┬──────────────────────┘
                   │ chrome.runtime messages
    ┌──────────────┴──────────────┐
    ▼                             ▼
background.js              sidepanel.js
(Service Worker)           (UI & State)
- Badge management         - AudibleScannerSidePanel class
- Storage bridging         - Filtering/sorting
- Message routing          - Settings management
```

**Message Flow:**
- Sidepanel → Content: `startScan`, `stopScan`, `getScanStatus`
- Content → Sidepanel: `bookFound`, `scanProgress`, `seriesUpdate`, `scanComplete`, `scanError`
- Both ↔ Background: `getStoredData`, `saveData`, `updateBadge`

## Key Patterns

**Multi-selector DOM extraction** (content.js): Uses fallback selectors for Audible's varying HTML structure:
```javascript
const selectors = ['.adbl-library-content-row', '[id^="adbl-library-content-row-"]', ...];
```

**Parallel series processing**: Configurable batch size (default 5 concurrent) with 300ms delays between batches.

**Pagination handling**: Extracts all page URLs upfront from first page's pagination, then fetches sequentially to avoid infinite loops.

**Debug logger**: All files use consistent `debug.log/warn/error` pattern that respects `debugMode` setting from storage.

## Storage Schema

```javascript
chrome.storage.local = {
  scanResults: [{ id, title, series, bookNumber, seriesUrl, allSeriesBooks: [...] }],
  settings: { concurrentRequests, scanType, excludeWishlisted, ... },
  filters: { search, sortBy, onlyWithNew, ... },
  ignoredSeries: [], ignoredBooks: [],
  lastScanDate, badgeCount, debugMode
}
```

## Key Files

| File | Purpose |
|------|---------|
| `content.js` | `AudibleLibraryScanner` - DOM extraction, AJAX pagination, series checking |
| `sidepanel.js` | `AudibleScannerSidePanel` - UI state, filtering, settings persistence |
| `background.js` | Service worker - storage bridge, badge updates |
| `analytics.js` | GA4 Measurement Protocol tracking (opt-in) |
