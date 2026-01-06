# Audible Library Scanner

A Chrome/Edge browser extension that scans your Audible library to track series and find new books available for purchase.

## Features

### Scanning
- **Library Scanning**: Automatically scans all pages of your Audible library via AJAX (no page refreshes)
- **Series Detection**: Extracts series names, book numbers, and series links
- **New Book Detection**: Checks series pages to find new books available for purchase
- **Parallel Processing**: Scans multiple series simultaneously for faster results
- **Incremental Scans**: New scans preserve existing data, only adding new books found
- **Scan Types**: Choose between Full Scan, Library Only, or Series Only modes
- **Multi-region Support**: Works with Audible sites worldwide

### Smart Detection
- **Bundle/Compilation Detection**: Recognizes compilations like "Books 1-3" and marks individual books as covered
- **Wishlist Detection**: Identifies books already in your Audible wishlist (shown with ❤️)
- **Unavailable Detection**: Marks books not available in your region (shown with ⊘)
- **Preorder Detection**: Tracks preordered books separately from owned books

### Organization
- **Ignore Series**: Hide series you're not interested in from results
- **Ignore Books**: Hide individual books you don't want to see
- **Wishlist Exclusion**: Option to exclude wishlisted books from "new" counts (enabled by default)

### Views
- **Dashboard**: Overview with stats and grid of new books found (click to open series page)
- **Library**: Full searchable list with sorting, filtering, and expandable series details
- **Settings**: Configure scan behavior, display preferences, and manage data

### Filtering & Sorting
- Search by series name, book title, or author
- Sort by new books, alphabetical, release date, book length, or owned count
- Filter by max books to buy
- Hide single-book series
- Show only series with new books available
- Expand/collapse individual series to see all books
- All filter settings persist across sessions

### Data Management
- **Data Export**: Export your complete library data as JSON with full metadata
- **Clear Data**: Reset all scan data when needed
- Local storage only - all data stays in your browser

## Data Collected

For each book in your library:
- Title, author, narrator
- Series name and book number
- Cover image
- Book length (with average length per series)
- Release date
- Star rating and number of ratings
- Language
- Ownership status (owned/preordered/not owned/covered by bundle/unavailable)
- Wishlist status
- Scan timestamp

## Installation

1. **Download or Clone** this repository
2. **Load in Browser**:
   - Open Chrome/Edge and go to `chrome://extensions/` (or `edge://extensions/`)
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select this extension folder
3. The extension icon will appear in your toolbar

## Usage

1. **Navigate to Audible**: Go to your Audible library page and log in
2. **Open Side Panel**: Click the extension icon to open the side panel
3. **Start Scan**: Click "Start Scan" on the Dashboard
4. **View Results**:
   - Dashboard shows new books found with cover images (click to open series)
   - Library tab shows all series with search/sort/filter options
   - Click ▶ to expand a series and see all books
   - Click 🚫 to ignore a series or book
5. **Export Data**: Go to Settings > Data Management to export as JSON

### Scan Types

- **Full Scan**: Scans library pages then checks each series for new books
- **Library Only**: Only scans library pages for your owned books (faster)
- **Series Only**: Only checks existing series for new books (uses saved library data)

### Status Indicators

- **Green**: Books you own
- **Orange**: Preordered books
- **Red**: Books available to buy
- **Pink**: Books in your wishlist
- **Gray/Italic**: Books unavailable in your region
- **Strikethrough**: Ignored books
- **(via bundle)**: Book covered by a compilation you own

## Supported Regions

- audible.com (US)
- audible.ca (Canada)
- audible.co.uk (UK)
- audible.de (Germany)
- audible.fr (France)
- audible.it (Italy)
- audible.es (Spain)
- audible.com.au (Australia)

## Privacy

- All data stays in your browser (chrome.storage.local)
- No external servers or tracking
- Only accesses Audible domains

## File Structure

```
audible-scanner/
├── manifest.json      # Extension configuration
├── sidepanel.html     # Side panel UI
├── sidepanel.js       # UI logic and state management
├── content.js         # Library scanning logic
├── background.js      # Service worker
├── icons/             # Extension icons
└── README.md
```

## License

MIT License
