// Debug Logger - respects debugMode setting
const debug = {
  enabled: false,
  async init() {
    const data = await chrome.storage.local.get(['debugMode']);
    this.enabled = data.debugMode === true;
  },
  log(...args) {
    if (this.enabled) console.log(...args);
  },
  warn(...args) {
    if (this.enabled) console.warn(...args);
  },
  error(...args) {
    // Always log errors
    console.error(...args);
  }
};
debug.init();

class AudibleLibraryScanner {
  constructor() {
    debug.log('AudibleLibraryScanner constructor called');
    this.isScanning = false;
    this.scannedBooks = new Set();
    this.scanResults = [];
    this.currentPage = 1;
    this.totalPages = null;
    this.seriesCache = new Map();
    this.CONCURRENT_SERIES_REQUESTS = 5; // Number of parallel series fetches

    this.init();
    debug.log('AudibleLibraryScanner initialized');
  }

  init() {
    debug.log('Setting up message listener...');
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      debug.log('Content script received message:', message);
      this.handleMessage(message, sendResponse);
      return true; // Keep message channel open for async responses
    });
    debug.log('Message listener set up');
  }

  handleMessage(message, sendResponse) {
    debug.log('Handling message:', message.action);
    switch (message.action) {
      case 'startScan':
        debug.log('Starting scan from message handler with options:', message.options);
        this.startScan(message.options || {});
        break;
      case 'stopScan':
        debug.log('Stopping scan from message handler');
        this.stopScan();
        break;
      case 'getScanStatus':
        debug.log('Returning scan status:', this.isScanning);
        sendResponse({
          isScanning: this.isScanning,
          isBackgroundScan: this.isBackgroundScan || false,
          booksFound: this.scanResults.length,
          currentPage: this.currentPage,
          totalPages: this.totalPages
        });
        break;
      case 'triggerBackgroundScan':
        debug.log('Triggering background scan manually');
        this.triggerBackgroundScanManually();
        break;
      default:
        debug.log('Unknown message action:', message.action);
    }
  }

  async startScan(options = {}) {
    debug.log('startScan called with options:', options);

    if (this.isScanning) {
      debug.log('Already scanning, returning');
      return;
    }

    this.isScanning = true;
    this.scanOptions = {
      currentPageOnly: options.currentPageOnly || false,
      scanType: options.scanType || 'full',  // 'full', 'library', or 'series'
      concurrentRequests: options.concurrentRequests || 5
    };
    this.CONCURRENT_SERIES_REQUESTS = this.scanOptions.concurrentRequests;

    debug.log('Scan options:', this.scanOptions);

    // Send immediate confirmation that scan started
    this.sendMessage('scanProgress', {
      currentPage: 0,
      totalPages: null,
      status: 'Loading existing data...'
    });

    // Load existing scan data to preserve it
    await this.loadExistingData();

    this.sendMessage('scanProgress', {
      currentPage: 0,
      totalPages: null,
      status: 'Initializing scan...'
    });

    try {
      debug.log('Checking if on library page...');
      debug.log('Current URL:', window.location.href);
      debug.log('Pathname:', window.location.pathname);

      // Check if we're on the library page
      if (!this.isLibraryPage()) {
        debug.log('Not on library page');
        throw new Error('Please navigate to your Audible library page');
      }

      debug.log('On library page, starting scan...');
      const newBooksFound = this.scanResults.length;
      const scanType = this.scanOptions.scanType;

      // Library scan (for 'full' and 'library' modes)
      if (scanType === 'full' || scanType === 'library') {
        await this.scanAllPages();
        debug.log(`Library scan complete. Found ${this.scanResults.length - newBooksFound} new books.`);
      } else {
        debug.log('Skipping library scan (series-only mode)');
      }

      const newBooksAfterLibrary = this.scanResults.length - newBooksFound;

      // Series scan (for 'full' and 'series' modes)
      if (scanType === 'full' || scanType === 'series') {
        if (this.scanResults.length > 0) {
          await this.scanSeriesForNewBooks();
        } else {
          debug.log('No books in library to scan series for');
        }
      } else {
        debug.log('Skipping series scan (library-only mode)');
      }

      this.sendMessage('scanComplete', {
        totalBooks: this.scanResults.length,
        newBooksFound: newBooksAfterLibrary,
        seriesCount: new Set(this.scanResults.map(b => b.series)).size,
        allResults: this.scanResults  // Send all results so sidepanel can rebuild
      });

    } catch (error) {
      console.error('Scan error:', error);
      this.sendMessage('scanError', error.message);
    } finally {
      this.isScanning = false;
    }
  }

  async loadExistingData() {
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'getStoredData' }, resolve);
      });

      if (response && response.success && response.data && response.data.scanResults) {
        const existingResults = response.data.scanResults;
        debug.log(`Loaded ${existingResults.length} existing books from storage`);

        // Populate scannedBooks Set with existing book IDs
        this.scannedBooks.clear();
        existingResults.forEach(book => {
          this.scannedBooks.add(book.id);
        });

        // Keep existing results
        this.scanResults = existingResults;
      } else {
        debug.log('No existing data found, starting fresh');
        this.scannedBooks.clear();
        this.scanResults = [];
      }

      // Always clear series cache to get fresh series data
      this.seriesCache.clear();
    } catch (error) {
      console.warn('Failed to load existing data:', error);
      this.scannedBooks.clear();
      this.scanResults = [];
      this.seriesCache.clear();
    }
  }

  stopScan() {
    this.isScanning = false;
  }

  isLibraryPage() {
    debug.log('Checking library page...');
    
    // Check URL patterns
    const urlCheck = window.location.pathname.includes('/library') || 
                     window.location.href.includes('/lib/') ||
                     window.location.href.includes('library');
    debug.log('URL check:', urlCheck);
    
    // Check for various book container selectors
    const selectors = [
      '[data-test-id="library-book"]',
      '.adbl-library-content-row',
      '.bc-list-item',
      '.library-item',
      '.adbl-library-item',
      '.bc-row-responsive',
      '.productListItem',
      '[class*="library"]',
      '[class*="Library"]'
    ];
    
    let elementCheck = false;
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      debug.log(`Selector ${selector}:`, elements.length, 'elements found');
      if (elements.length > 0) {
        elementCheck = true;
        break;
      }
    }
    
    // Also check for common Audible library text
    const textCheck = document.body.textContent.includes('My Library') ||
                      document.body.textContent.includes('Your Library') ||
                      document.title.toLowerCase().includes('library');
    debug.log('Text check:', textCheck);
    
    const result = urlCheck || elementCheck || textCheck;
    debug.log('Final library page check result:', result);
    
    return result;
  }

  async scanAllPages() {
    // Detect current page from the DOM
    this.currentPage = this.getCurrentPage();
    this.totalPages = this.getTotalPages();

    // Get all page URLs upfront from the pagination on the first page
    const pageUrls = this.getAllPageUrls();

    // If we found pagination links, use that as the total pages count
    if (pageUrls.length > 0) {
      const maxPage = Math.max(...pageUrls.map(p => p.page));
      if (this.totalPages === null || maxPage > this.totalPages) {
        this.totalPages = maxPage;
      }
    }

    debug.log(`Starting page scan. Current page: ${this.currentPage}, Total pages: ${this.totalPages || 'unknown'}, Found ${pageUrls.length} page URLs`);

    // Scan the current page first (already loaded)
    this.sendMessage('scanProgress', {
      currentPage: this.currentPage,
      totalPages: this.totalPages,
      isBackgroundScan: this.isBackgroundScan || false
    });

    const booksFoundBefore = this.scanResults.length;
    await this.scanCurrentPage();
    const booksFoundOnPage = this.scanResults.length - booksFoundBefore;
    debug.log(`Page ${this.currentPage}: found ${booksFoundOnPage} new books (total: ${this.scanResults.length})`);

    // If currentPageOnly is set, skip fetching other pages
    if (this.scanOptions && this.scanOptions.currentPageOnly) {
      debug.log('Current page only mode - skipping other pages');
      debug.log(`Page scan complete. Total books found: ${this.scanResults.length}`);
      return;
    }

    // If no additional pages found, we're done
    if (pageUrls.length === 0) {
      debug.log('No additional pages found in pagination');
      debug.log(`Page scan complete. Total books found: ${this.scanResults.length}`);
      return;
    }

    // Now fetch remaining pages via AJAX using the URLs we extracted upfront
    for (const pageInfo of pageUrls) {
      if (!this.isScanning) {
        debug.log('Scanning stopped by user');
        break;
      }

      this.currentPage = pageInfo.page;

      this.sendMessage('scanProgress', {
        currentPage: this.currentPage,
        totalPages: this.totalPages,
        isBackgroundScan: this.isBackgroundScan || false
      });

      // Fetch page via AJAX
      debug.log(`Fetching page ${this.currentPage}: ${pageInfo.url}`);
      const pageDoc = await this.fetchPage(pageInfo.url);

      if (pageDoc) {
        const booksFoundBefore = this.scanResults.length;
        await this.scanPageDocument(pageDoc);
        const booksFoundOnPage = this.scanResults.length - booksFoundBefore;
        debug.log(`Page ${this.currentPage}: found ${booksFoundOnPage} new books (total: ${this.scanResults.length})`);
      } else {
        console.warn(`Failed to fetch page ${this.currentPage}`);
        // Continue to next page instead of breaking entirely
      }

      // Brief pause between pages to be nice to the server
      await this.sleep(300);
    }

    debug.log(`Page scan complete. Total books found: ${this.scanResults.length}`);
  }

  getAllPageUrls() {
    // Wrapper that uses the current document
    return this.getAllPageUrlsFromDocument(document);
  }

  getAllPageUrlsFromDocument(doc) {
    // Extract all page URLs from the pagination on a document
    // Used by both main scan (with document) and background scan (with fetched doc)
    const pageUrls = [];
    const seenUrls = new Set();

    const paginationSelectors = [
      '.pageNumberElement a',
      '.pagingElements a',
      '.bc-pagination a',
      '.adbl-pagination a',
      '[data-test-id="pagination"] a'
    ];

    for (const selector of paginationSelectors) {
      const links = doc.querySelectorAll(selector);
      links.forEach(link => {
        if (link.href && !seenUrls.has(link.href)) {
          seenUrls.add(link.href);
          const pageMatch = link.href.match(/[?&]page=(\d+)/);
          const pageNum = pageMatch ? parseInt(pageMatch[1]) : null;
          if (pageNum && pageNum > 1) {
            pageUrls.push({ page: pageNum, url: link.href });
          }
        }
      });
    }

    // Also check the next button
    const nextButton = doc.querySelector('.nextButton a');
    if (nextButton && nextButton.href && !seenUrls.has(nextButton.href)) {
      const pageMatch = nextButton.href.match(/[?&]page=(\d+)/);
      const pageNum = pageMatch ? parseInt(pageMatch[1]) : null;
      if (pageNum) {
        pageUrls.push({ page: pageNum, url: nextButton.href });
        seenUrls.add(nextButton.href);
      }
    }

    // Sort by page number
    pageUrls.sort((a, b) => a.page - b.page);

    debug.log(`Found ${pageUrls.length} additional page URLs from pagination`);
    return pageUrls;
  }

  async fetchPage(url) {
    try {
      const response = await fetch(url, {
        credentials: 'include' // Include cookies for authentication
      });

      if (!response.ok) {
        console.error(`Failed to fetch page: ${response.status}`);
        return null;
      }

      const html = await response.text();
      const parser = new DOMParser();
      return parser.parseFromString(html, 'text/html');
    } catch (error) {
      console.error('Error fetching page:', error);
      return null;
    }
  }

  async scanPageDocument(doc) {
    // Extract books from the fetched document (not the current DOM)
    const books = this.extractBooksFromDocument(doc);

    for (const book of books) {
      if (!this.scannedBooks.has(book.id)) {
        this.scannedBooks.add(book.id);
        this.scanResults.push(book);
        this.sendMessage('bookFound', book);
      }
    }
  }

  extractBooksFromDocument(doc) {
    debug.log('Extracting books from fetched document...');
    const books = [];

    let bookElements = doc.querySelectorAll('.adbl-library-content-row');
    debug.log(`Found ${bookElements.length} book elements`);

    if (bookElements.length === 0) {
      const alternativeSelectors = [
        '[id^="adbl-library-content-row-"]',
        '[data-test-id="library-book"]',
        '.library-item'
      ];

      for (const selector of alternativeSelectors) {
        const elements = doc.querySelectorAll(selector);
        if (elements.length > 0) {
          bookElements = elements;
          break;
        }
      }
    }

    bookElements.forEach((element, index) => {
      try {
        const book = this.extractBookInfo(element, index);
        if (book) {
          books.push(book);
        }
      } catch (error) {
        console.warn(`Error extracting book info for element ${index}:`, error);
      }
    });

    return books;
  }

  async scanCurrentPage() {
    const books = this.extractBooksFromPage();
    
    for (const book of books) {
      if (!this.scannedBooks.has(book.id)) {
        this.scannedBooks.add(book.id);
        this.scanResults.push(book);
        this.sendMessage('bookFound', book);
      }
    }
  }

  extractBooksFromPage() {
    debug.log('Extracting books from current page...');
    const books = [];

    // Primary selector: each book is in an .adbl-library-content-row
    let bookElements = document.querySelectorAll('.adbl-library-content-row');
    debug.log(`Found ${bookElements.length} book elements using .adbl-library-content-row selector`);

    if (bookElements.length === 0) {
      debug.log('No book elements found. Trying alternative selectors...');

      // Try alternative selectors if the main one doesn't work
      const alternativeSelectors = [
        '[id^="adbl-library-content-row-"]',
        '[data-test-id="library-book"]',
        '.library-item',
        '.adbl-library-item'
      ];

      for (const selector of alternativeSelectors) {
        const elements = document.querySelectorAll(selector);
        debug.log(`Trying selector ${selector}: found ${elements.length} elements`);
        if (elements.length > 0) {
          bookElements = elements;
          break;
        }
      }
    }

    if (bookElements.length === 0) {
      debug.log('No book elements found with any selector');
      return books;
    }

    debug.log(`Processing ${bookElements.length} book elements...`);

    bookElements.forEach((element, index) => {
      try {
        const book = this.extractBookInfo(element, index);
        if (book) {
          books.push(book);
          debug.log(`Successfully extracted book ${index + 1}: "${book.title}"`);
        } else {
          debug.log(`Failed to extract book ${index + 1}`);
        }
      } catch (error) {
        console.warn(`Error extracting book info for element ${index}:`, error);
      }
    });

    debug.log(`Successfully extracted ${books.length} books from page`);
    return books;
  }

  extractBookInfo(element, index) {
    debug.log(`Extracting info for book element ${index + 1}`);

    // Extract title - look for span.bc-size-headline3 inside a link
    let title = '';
    let bookUrl = '';

    // Try multiple title selectors
    const titleSelectors = [
      '.bc-size-headline3',
      'span.bc-size-headline3',
      'li a span.bc-size-headline3',
      'h1.bc-heading a',
      'h2.bc-heading a',
      'h3.bc-heading a'
    ];

    for (const selector of titleSelectors) {
      const titleElement = element.querySelector(selector);
      if (titleElement && titleElement.textContent.trim()) {
        title = titleElement.textContent.trim();
        // Get the book URL from the parent link
        const linkElement = titleElement.closest('a') || element.querySelector('a[href*="/pd/"]');
        if (linkElement) {
          bookUrl = linkElement.href;
        }
        break;
      }
    }

    if (!title) {
      debug.log('No title element found');
      return null;
    }

    debug.log(`Found title: "${title}"`);
    debug.log(`Found book URL: "${bookUrl}"`);

    // Extract author - look for .authorLabel
    let author = '';
    const authorElement = element.querySelector('.authorLabel a, .authorLabel');
    if (authorElement) {
      // Get the author name from the link inside authorLabel, or parse the text
      const authorLink = authorElement.querySelector('a') || (authorElement.tagName === 'A' ? authorElement : null);
      if (authorLink) {
        author = authorLink.textContent.trim();
      } else {
        // Parse "By: Author Name" format
        const authorText = authorElement.textContent.trim();
        author = authorText.replace(/^By:\s*/i, '').trim();
      }
      debug.log(`Found author: "${author}"`);
    }

    // Extract narrator
    let narrator = '';
    const narratorElement = element.querySelector('.narratorLabel a, .narratorLabel');
    if (narratorElement) {
      const narratorLink = narratorElement.querySelector('a') || (narratorElement.tagName === 'A' ? narratorElement : null);
      if (narratorLink) {
        narrator = narratorLink.textContent.trim();
      } else {
        const narratorText = narratorElement.textContent.trim();
        narrator = narratorText.replace(/^Narrated by:\s*/i, '').trim();
      }
      debug.log(`Found narrator: "${narrator}"`);
    }

    // Extract series information
    const seriesInfo = this.extractSeriesInfo(element);

    // Generate unique ID from the element's ID or create one
    let id = element.id || '';
    if (id.startsWith('adbl-library-content-row-')) {
      id = id.replace('adbl-library-content-row-', '');
    } else {
      id = `${title}-${author}`.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    }

    // Extract cover image
    let coverImage = '';
    const imgElement = element.querySelector('img.bc-pub-block, img.bc-image-inset-border, img[src*="media-amazon.com"]');
    if (imgElement && imgElement.src) {
      coverImage = imgElement.src;
    }

    const bookInfo = {
      id,
      title,
      author,
      narrator,
      bookUrl,
      coverImage,
      series: seriesInfo.name,
      bookNumber: seriesInfo.number,
      seriesUrl: seriesInfo.url,
      scannedAt: new Date().toISOString(),
      newBooksAvailable: 0 // Will be updated when scanning series pages
    };

    debug.log('Extracted book info:', bookInfo);
    return bookInfo;
  }

  extractSeriesInfo(element) {
    debug.log('Extracting series info...');

    // Look for series info in .seriesLabel
    const seriesLabelElement = element.querySelector('.seriesLabel, li.seriesLabel');
    if (!seriesLabelElement) {
      debug.log('No seriesLabel element found');
      return { name: null, number: null, url: null };
    }

    // Find the series link within the label
    const seriesLink = seriesLabelElement.querySelector('a[href*="/series/"]');
    if (!seriesLink) {
      debug.log('No series link found in seriesLabel');
      return { name: null, number: null, url: null };
    }

    const seriesName = seriesLink.textContent.trim();
    const seriesUrl = seriesLink.href;

    debug.log(`Found series: "${seriesName}" at ${seriesUrl}`);

    // Extract book number - it's usually in a span.bc-text after the series link
    // The structure is: "Series: <a>Series Name</a> , <span>Book 5</span>"
    let bookNumber = null;

    // Get all text content from the series label area
    const seriesLabelText = seriesLabelElement.textContent;
    debug.log(`Series label text: "${seriesLabelText}"`);

    // Try to find book number in various formats
    const numberPatterns = [
      /Book\s+(\d+(?:\.\d+)?)/i,
      /#\s*(\d+)/,
      /Volume\s+(\d+)/i,
      /Part\s+(\d+)/i,
      /(\d+)(?:st|nd|rd|th)?\s+book/i
    ];

    for (const pattern of numberPatterns) {
      const match = seriesLabelText.match(pattern);
      if (match) {
        bookNumber = match[1];
        debug.log(`Found book number: ${bookNumber}`);
        break;
      }
    }

    // Also check the title for book number if not found in series label
    if (!bookNumber) {
      const titleElement = element.querySelector('.bc-size-headline3');
      if (titleElement) {
        const titleText = titleElement.textContent;
        for (const pattern of numberPatterns) {
          const match = titleText.match(pattern);
          if (match) {
            bookNumber = match[1];
            debug.log(`Found book number in title: ${bookNumber}`);
            break;
          }
        }
      }
    }

    return {
      name: seriesName,
      number: bookNumber,
      url: seriesUrl
    };
  }

  findElement(parent, selectors) {
    for (const selector of selectors) {
      const element = parent.querySelector(selector);
      if (element) return element;
    }
    return null;
  }

  getTotalPages() {
    // Method 1: Find all page number elements and get the highest number
    const pageNumberElements = document.querySelectorAll('.pageNumberElement');
    let maxPage = 0;

    pageNumberElements.forEach(el => {
      const text = el.textContent.trim();
      const num = parseInt(text);
      if (!isNaN(num) && num > maxPage) {
        maxPage = num;
      }
    });

    if (maxPage > 0) {
      debug.log(`Found total pages from pageNumberElement: ${maxPage}`);
      return maxPage;
    }

    // Method 2: Try legacy pagination selectors
    const paginationSelectors = [
      '.bc-pagination-summary',
      '.adbl-pagination-summary',
      '[data-test-id="pagination-summary"]'
    ];

    for (const selector of paginationSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent;
        const match = text.match(/of\s+(\d+)/i);
        if (match) {
          debug.log(`Found total pages from summary: ${match[1]}`);
          return parseInt(match[1]);
        }
      }
    }

    debug.log('Could not determine total pages');
    return null;
  }

  getCurrentPage() {
    // Method 1: Check hidden input
    const pageInput = document.querySelector('input[name="page"]');
    if (pageInput && pageInput.value) {
      return parseInt(pageInput.value);
    }

    // Method 2: Find the page number that's a span (not a link) - that's the current page
    const pageNumberElements = document.querySelectorAll('.pageNumberElement');
    for (const el of pageNumberElements) {
      if (el.tagName === 'SPAN' && !el.closest('a')) {
        const num = parseInt(el.textContent.trim());
        if (!isNaN(num)) {
          return num;
        }
      }
    }

    return 1;
  }

  hasNextPage() {
    // Check for next button with a link inside (not disabled)
    const nextButton = document.querySelector('.nextButton');
    if (nextButton) {
      const link = nextButton.querySelector('a');
      if (link && link.href) {
        debug.log('Found next page button');
        return true;
      }
    }

    // Legacy selectors
    const legacySelectors = [
      '.bc-pagination-next:not(.bc-pagination-disabled) a',
      '.adbl-pagination-next:not(.disabled) a',
      '[data-test-id="pagination-next"]:not(.disabled) a'
    ];

    for (const selector of legacySelectors) {
      if (document.querySelector(selector)) {
        return true;
      }
    }

    debug.log('No next page button found');
    return false;
  }

  async goToNextPage() {
    // Method 1: Click the next button
    const nextButton = document.querySelector('.nextButton a');
    if (nextButton) {
      debug.log('Clicking next button:', nextButton.href);
      nextButton.click();
      await this.waitForPageLoad();
      return;
    }

    // Method 2: Legacy selectors
    const legacySelectors = [
      '.bc-pagination-next:not(.bc-pagination-disabled) a',
      '.adbl-pagination-next:not(.disabled) a',
      '[data-test-id="pagination-next"]:not(.disabled) a'
    ];

    for (const selector of legacySelectors) {
      const button = document.querySelector(selector);
      if (button) {
        debug.log('Clicking legacy next button');
        button.click();
        await this.waitForPageLoad();
        return;
      }
    }

    throw new Error('Could not find next page button');
  }

  async waitForPageLoad() {
    // Store current book IDs to detect when new content loads
    const previousBookIds = new Set(
      Array.from(document.querySelectorAll('.adbl-library-content-row'))
        .map(el => el.id)
    );

    return new Promise(resolve => {
      let attempts = 0;
      const maxAttempts = 100; // 10 seconds max for full page navigation

      const checkLoaded = () => {
        attempts++;

        // Check if page is ready and has book elements
        const bookElements = document.querySelectorAll('.adbl-library-content-row');
        const currentBookIds = new Set(Array.from(bookElements).map(el => el.id));

        // Page is loaded if we have books AND they're different from before (new page)
        const hasBooks = bookElements.length > 0;
        const hasDifferentBooks = currentBookIds.size > 0 &&
          ![...currentBookIds].every(id => previousBookIds.has(id));

        if (document.readyState === 'complete' && hasBooks && hasDifferentBooks) {
          debug.log(`Page loaded with ${bookElements.length} books (new content detected)`);
          setTimeout(resolve, 500); // Extra wait for dynamic content
        } else if (attempts >= maxAttempts) {
          console.warn('Page load timeout after', attempts * 100, 'ms');
          resolve();
        } else {
          setTimeout(checkLoaded, 100);
        }
      };

      // Start checking after a brief delay to allow navigation to begin
      setTimeout(checkLoaded, 200);
    });
  }

  async scanSeriesForNewBooks() {
    const seriesUrls = [...new Set(this.scanResults
      .filter(book => book.seriesUrl)
      .map(book => book.seriesUrl))];

    const totalSeries = seriesUrls.length;
    debug.log(`Scanning ${totalSeries} unique series for new books...`);

    this.sendMessage('scanProgress', {
      status: `Checking ${totalSeries} series for new books...`
    });

    // Process series in parallel batches
    for (let i = 0; i < seriesUrls.length; i += this.CONCURRENT_SERIES_REQUESTS) {
      if (!this.isScanning) break;

      const batch = seriesUrls.slice(i, i + this.CONCURRENT_SERIES_REQUESTS);
      const completed = Math.min(i + this.CONCURRENT_SERIES_REQUESTS, totalSeries);

      this.sendMessage('scanProgress', {
        status: `Checking series ${completed}/${totalSeries}...`
      });

      // Fetch all series in this batch in parallel
      const results = await Promise.all(
        batch.map(async (seriesUrl) => {
          try {
            const seriesData = await this.checkSeriesForNewBooks(seriesUrl);
            return { seriesUrl, ...seriesData };
          } catch (error) {
            console.warn('Error checking series:', seriesUrl, error);
            return { seriesUrl, newBooksCount: 0, totalInSeries: 0, error: true };
          }
        })
      );

      // Update all books with the results
      for (const result of results) {
        this.scanResults.forEach(book => {
          if (book.seriesUrl === result.seriesUrl) {
            book.newBooksAvailable = result.newBooksCount;
            book.totalInSeries = result.totalInSeries;
            book.ownedInSeries = result.ownedCount;
            book.preorderedInSeries = result.preorderCount;
            book.allSeriesBooks = result.allBooks;
          }
        });

        // Send update for all series (even those without new books, for accurate counts)
        this.sendMessage('seriesUpdate', {
          seriesUrl: result.seriesUrl,
          newBooksCount: result.newBooksCount,
          totalInSeries: result.totalInSeries,
          ownedCount: result.ownedCount,
          preorderCount: result.preorderCount,
          allBooks: result.allBooks
        });
      }

      // Small delay between batches to be nice to the server
      if (i + this.CONCURRENT_SERIES_REQUESTS < seriesUrls.length) {
        await this.sleep(300);
      }
    }

    // Sort results: series with new books first, then by number of new books
    this.scanResults.sort((a, b) => {
      // Books with new available first
      if (b.newBooksAvailable !== a.newBooksAvailable) {
        return b.newBooksAvailable - a.newBooksAvailable;
      }
      // Then by series name
      if (a.series && b.series) {
        return a.series.localeCompare(b.series);
      }
      // Books with series before books without
      if (a.series && !b.series) return -1;
      if (!a.series && b.series) return 1;
      return 0;
    });
  }

  async checkSeriesForNewBooks(seriesUrl) {
    if (this.seriesCache.has(seriesUrl)) {
      return this.seriesCache.get(seriesUrl);
    }

    try {
      const response = await fetch(seriesUrl);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Find all book items on the series page
      const bookItems = doc.querySelectorAll('.productListItem, li[id^="product-list-item-"]');
      const totalBooksInSeries = bookItems.length;

      debug.log(`Found ${totalBooksInSeries} books in series page`);

      // First pass: collect all books and identify owned compilations
      const allBooks = [];
      const ownedCompilationRanges = [];
      let bookNumber = 0;

      bookItems.forEach((item) => {
        bookNumber++;
        const asin = item.id?.replace('product-list-item-', '') || '';
        const bookTitle = item.getAttribute('aria-label') || '';

        // Extract book number from heading (e.g., "Book 1")
        const bookNumHeading = item.querySelector('h2.bc-heading');
        let extractedBookNum = bookNumber;
        if (bookNumHeading) {
          const numMatch = bookNumHeading.textContent.match(/Book\s+(\d+(?:\.\d+)?)/i);
          if (numMatch) {
            extractedBookNum = parseFloat(numMatch[1]);
          }
        }

        // Check if this is a compilation (e.g., "Books 1-3.5")
        // First check the title/aria-label
        let compilationRange = this.parseBookRange(bookTitle);

        // If not found in title, check the item's text content for "Books X-Y" pattern
        if (!compilationRange) {
          const itemText = item.textContent || '';
          compilationRange = this.parseBookRange(itemText);
        }

        const isCompilation = compilationRange !== null;

        // Extract length (e.g., "Length: 48 hrs and 7 mins")
        let length = '';
        let lengthMinutes = 0;
        const runtimeLabel = item.querySelector('.runtimeLabel span, li.runtimeLabel span');
        if (runtimeLabel) {
          length = runtimeLabel.textContent.replace('Length:', '').trim();
          lengthMinutes = this.parseLengthToMinutes(length);
        }

        // Extract release date (e.g., "Release date: 10-09-2019")
        let releaseDate = '';
        const releaseDateLabel = item.querySelector('.releaseDateLabel span, li.releaseDateLabel span');
        if (releaseDateLabel) {
          releaseDate = releaseDateLabel.textContent.replace('Release date:', '').trim();
        }

        // Extract author
        let author = '';
        const authorLabel = item.querySelector('li.authorLabel span, .authorLabel span');
        if (authorLabel) {
          const authorLink = authorLabel.querySelector('a');
          author = authorLink ? authorLink.textContent.trim() : authorLabel.textContent.replace('By:', '').trim();
        }

        // Extract narrator
        let narrator = '';
        const narratorLabel = item.querySelector('li.narratorLabel span, .narratorLabel span');
        if (narratorLabel) {
          const narratorLink = narratorLabel.querySelector('a');
          narrator = narratorLink ? narratorLink.textContent.trim() : narratorLabel.textContent.replace('Narrated by:', '').trim();
        }

        // Extract language
        let language = '';
        const languageLabel = item.querySelector('li.languageLabel span, .languageLabel span');
        if (languageLabel) {
          language = languageLabel.textContent.replace('Language:', '').trim();
        }

        // Extract rating (e.g., "4.5 out of 5 stars")
        let rating = 0;
        const ratingElement = item.querySelector('.bc-review-stars[aria-label], [aria-label*="out of 5 stars"]');
        if (ratingElement) {
          const ratingMatch = ratingElement.getAttribute('aria-label').match(/([\d.]+)\s*out of 5/);
          if (ratingMatch) {
            rating = parseFloat(ratingMatch[1]);
          }
        }

        // Extract number of ratings
        let ratingsCount = 0;
        const ratingsLabel = item.querySelector('li.ratingsLabel, .ratingsLabel');
        if (ratingsLabel) {
          const ratingsText = ratingsLabel.textContent;
          const ratingsMatch = ratingsText.match(/([\d,]+)\s*ratings?/i);
          if (ratingsMatch) {
            ratingsCount = parseInt(ratingsMatch[1].replace(/,/g, ''));
          }
        }

        // Determine ownership status
        let status = 'unknown';
        const inLibraryBtn = item.querySelector('.adblBuyBoxInLibraryButton, [class*="InLibraryButton"]');
        const preorderBtn = item.querySelector('.adblBuyBoxPreorderButton, [class*="PreorderButton"]');
        const addToCartBtn = item.querySelector('.adblAddToCartButton, .adblAddToCartText, [class*="AddToCartButton"]');
        const addToLibraryBtn = item.querySelector('.adblAddToLibrary, [class*="AddToLibrary"]');

        if (inLibraryBtn && !inLibraryBtn.classList.contains('bc-hidden')) {
          status = 'owned';
          // Track compilation ranges that are owned
          if (isCompilation && compilationRange) {
            ownedCompilationRanges.push(compilationRange);
            debug.log(`Found owned compilation: "${bookTitle}" covering books ${compilationRange.start}-${compilationRange.end}`);
          }
        } else if (preorderBtn && !preorderBtn.classList.contains('bc-hidden')) {
          status = 'preordered';
          // Also track preordered compilations
          if (isCompilation && compilationRange) {
            ownedCompilationRanges.push(compilationRange);
            debug.log(`Found preordered compilation: "${bookTitle}" covering books ${compilationRange.start}-${compilationRange.end}`);
          }
        } else if (addToLibraryBtn && !addToLibraryBtn.classList.contains('bc-hidden')) {
          status = 'plus_catalog';
          debug.log(`Book "${bookTitle}" is available in Plus catalog`);
        } else if (addToCartBtn && !addToCartBtn.classList.contains('bc-hidden')) {
          status = 'not_owned';
        } else {
          // Fallback: check text content
          const itemText = item.textContent || '';
          if (itemText.includes('In your Library')) {
            status = 'owned';
            if (isCompilation && compilationRange) {
              ownedCompilationRanges.push(compilationRange);
            }
          } else if (itemText.includes('In your Pre-orders')) {
            status = 'preordered';
            if (isCompilation && compilationRange) {
              ownedCompilationRanges.push(compilationRange);
            }
          } else if (itemText.includes('Add to Library') || itemText.includes('Add to library')) {
            status = 'plus_catalog';
          } else if (itemText.includes('Add to cart')) {
            status = 'not_owned';
          }
        }

        // Check if book is in wishlist
        // The "Go to Wishlist" button is visible when book IS in wishlist
        // The "Add to Wishlist" button is visible when book is NOT in wishlist
        let inWishlist = false;
        const goToWishlistBtn = item.querySelector('.adblGoToWishlistButton, [class*="GoToWishlistButton"]');
        if (goToWishlistBtn && !goToWishlistBtn.classList.contains('bc-hidden')) {
          inWishlist = true;
        }

        // Check if book is unavailable in this region
        let isUnavailable = false;
        const errorBuyBox = item.querySelector('.adblErrorBuyBox, [class*="ErrorBuyBox"]');
        if (errorBuyBox) {
          const errorText = errorBuyBox.textContent || '';
          if (errorText.includes('Not Available')) {
            isUnavailable = true;
            status = 'unavailable';
            debug.log(`Book "${bookTitle}" is not available in this region`);
          }
        }
        // Also check for unavailable cover image
        if (!isUnavailable) {
          const coverImg = item.querySelector('img[src*="prod-unavailable"]');
          if (coverImg) {
            isUnavailable = true;
            status = 'unavailable';
            debug.log(`Book "${bookTitle}" has unavailable cover - marking as unavailable`);
          }
        }

        allBooks.push({
          asin,
          title: bookTitle,
          bookNumber: extractedBookNum,
          isCompilation,
          compilationRange,
          length,
          lengthMinutes,
          releaseDate,
          author,
          narrator,
          language,
          rating,
          ratingsCount,
          status,
          inWishlist,
          scannedAt: new Date().toISOString()
        });
      });

      // Second pass: adjust status for individual books covered by owned compilations
      let ownedCount = 0;
      let preorderCount = 0;
      let notOwnedCount = 0;
      let unavailableCount = 0;
      let plusCatalogCount = 0;

      allBooks.forEach(book => {
        // If book is not owned (including plus_catalog) but is covered by an owned compilation, mark it as covered
        if ((book.status === 'not_owned' || book.status === 'plus_catalog') && !book.isCompilation) {
          if (this.isBookCoveredByCompilation(book.bookNumber, ownedCompilationRanges)) {
            book.status = 'covered_by_compilation';
            debug.log(`Book "${book.title}" (#${book.bookNumber}) is covered by an owned compilation`);
          }
        }

        // Count final statuses
        if (book.status === 'owned' || book.status === 'covered_by_compilation') {
          ownedCount++;
        } else if (book.status === 'preordered') {
          preorderCount++;
        } else if (book.status === 'not_owned') {
          notOwnedCount++;
        } else if (book.status === 'plus_catalog') {
          plusCatalogCount++;
        } else if (book.status === 'unavailable') {
          unavailableCount++;
        }
      });

      debug.log(`Series breakdown: ${ownedCount} owned (incl. compilation coverage), ${preorderCount} preordered, ${notOwnedCount} to buy, ${plusCatalogCount} in Plus, ${unavailableCount} unavailable`);

      const result = {
        newBooksCount: notOwnedCount,
        totalInSeries: totalBooksInSeries,
        ownedCount,
        preorderCount,
        allBooks
      };

      this.seriesCache.set(seriesUrl, result);
      return result;

    } catch (error) {
      console.warn('Failed to fetch series page:', error);
      return { newBooksCount: 0, totalInSeries: 0, ownedCount: 0, preorderCount: 0, allBooks: [] };
    }
  }

  parseLengthToMinutes(lengthStr) {
    if (!lengthStr) return 0;

    let totalMinutes = 0;

    // Match hours (e.g., "48 hrs", "1 hr")
    const hoursMatch = lengthStr.match(/(\d+)\s*hrs?/i);
    if (hoursMatch) {
      totalMinutes += parseInt(hoursMatch[1]) * 60;
    }

    // Match minutes (e.g., "7 mins", "30 min")
    const minsMatch = lengthStr.match(/(\d+)\s*mins?/i);
    if (minsMatch) {
      totalMinutes += parseInt(minsMatch[1]);
    }

    return totalMinutes;
  }

  /**
   * Parse book range from compilation titles like "Books 1-3", "Books 1-3.5", etc.
   * Returns an object with start/end numbers, or null if not a compilation.
   */
  parseBookRange(title) {
    if (!title) return null;

    // Match patterns like "Books 1-3", "Books 1-3.5", "Book 1-5", "Books 1 - 3"
    const rangeMatch = title.match(/Books?\s+(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/i);
    if (rangeMatch) {
      return {
        start: parseFloat(rangeMatch[1]),
        end: parseFloat(rangeMatch[2])
      };
    }

    return null;
  }

  /**
   * Check if a book number is covered by any of the owned compilation ranges.
   */
  isBookCoveredByCompilation(bookNumber, ownedRanges) {
    if (!bookNumber || ownedRanges.length === 0) return false;

    const num = parseFloat(bookNumber);
    if (isNaN(num)) return false;

    return ownedRanges.some(range => num >= range.start && num <= range.end);
  }

  sendMessage(type, data) {
    debug.log('Sending message:', type, data);
    try {
      chrome.runtime.sendMessage({ type, data });
      debug.log('Message sent:', type);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Background scan methods
  async scanLibraryPagesBackground() {
    debug.log('Background scan: fetching library pages...');

    // Build library URL with pageSize=50 for faster scanning
    const baseUrl = window.location.origin;
    const firstPageUrl = `${baseUrl}/library/titles?pageSize=50&page=1`;

    // Fetch first page
    debug.log(`Background scan: fetching first page: ${firstPageUrl}`);
    this.sendMessage('scanProgress', {
      currentPage: 1,
      status: 'Background scan: page 1...',
      isBackgroundScan: true
    });

    const firstPageDoc = await this.fetchPage(firstPageUrl);
    if (!firstPageDoc) {
      debug.log('Background scan: failed to fetch first page, stopping');
      return;
    }

    // Extract books from first page
    const booksFoundBefore = this.scanResults.length;
    await this.scanPageDocument(firstPageDoc);
    const booksFoundOnPage = this.scanResults.length - booksFoundBefore;
    debug.log(`Background scan: page 1 found ${booksFoundOnPage} books (total: ${this.scanResults.length})`);

    // Extract all page URLs from the first page's pagination (same approach as main scan)
    const pageUrls = this.getAllPageUrlsFromDocument(firstPageDoc);
    const totalPages = pageUrls.length > 0 ? Math.max(...pageUrls.map(p => p.page)) : 1;

    debug.log(`Background scan: found ${pageUrls.length} additional pages, total: ${totalPages}`);

    // Iterate through remaining pages (finite list)
    for (const pageInfo of pageUrls) {
      if (!this.isScanning) {
        debug.log('Background scan: stopped by user');
        break;
      }

      this.sendMessage('scanProgress', {
        currentPage: pageInfo.page,
        totalPages: totalPages,
        status: `Background scan: page ${pageInfo.page}/${totalPages}...`,
        isBackgroundScan: true
      });

      debug.log(`Background scan: fetching page ${pageInfo.page}: ${pageInfo.url}`);
      const pageDoc = await this.fetchPage(pageInfo.url);

      if (pageDoc) {
        const booksFoundBefore = this.scanResults.length;
        await this.scanPageDocument(pageDoc);
        const booksFoundOnPage = this.scanResults.length - booksFoundBefore;
        debug.log(`Background scan: page ${pageInfo.page} found ${booksFoundOnPage} books (total: ${this.scanResults.length})`);
      } else {
        debug.log(`Background scan: failed to fetch page ${pageInfo.page}, continuing...`);
      }

      // Brief pause between pages
      await this.sleep(300);
    }

    debug.log(`Background scan: library scan complete. Total books: ${this.scanResults.length}`);
  }

  async checkBackgroundScan() {
    try {
      // Check settings
      const data = await chrome.storage.local.get(['settings', 'lastBackgroundScan']);
      const settings = data.settings || {};

      if (!settings.backgroundScan) {
        debug.log('Background scan: disabled in settings');
        return;
      }

      // Check if last scan was more than 24 hours ago
      const lastScan = data.lastBackgroundScan ? new Date(data.lastBackgroundScan) : null;
      const now = new Date();
      const hoursSinceLastScan = lastScan ? (now - lastScan) / (1000 * 60 * 60) : 999;

      if (hoursSinceLastScan < 24) {
        debug.log(`Background scan: last scan was ${hoursSinceLastScan.toFixed(1)} hours ago, skipping`);
        return;
      }

      debug.log('Background scan: starting...');
      await this.runBackgroundScan(settings);
    } catch (error) {
      console.error('Background scan check failed:', error);
    }
  }

  async triggerBackgroundScanManually() {
    // Manual trigger bypasses the 24-hour check
    const data = await chrome.storage.local.get(['settings']);
    const settings = data.settings || {};
    debug.log('Manual background scan triggered');
    await this.runBackgroundScan(settings);
  }

  async runBackgroundScan(settings) {
    if (this.isScanning) {
      debug.log('Background scan: already scanning');
      return;
    }

    this.isScanning = true;
    this.isBackgroundScan = true;
    this.scanOptions = {
      currentPageOnly: false,
      scanType: settings.scanType || 'full',
      concurrentRequests: settings.concurrentRequests || 5
    };
    this.CONCURRENT_SERIES_REQUESTS = this.scanOptions.concurrentRequests;

    // Show loading badge
    chrome.runtime.sendMessage({ type: 'scanStarted' });

    try {
      // Load existing data
      await this.loadExistingData();

      // Scan library pages (fetches via HTTP, works from any Audible page)
      await this.scanLibraryPagesBackground();

      // Scan series for new books if full scan
      if (this.scanOptions.scanType === 'full' || this.scanOptions.scanType === 'series') {
        if (this.scanResults.length > 0) {
          await this.scanSeriesForNewBooks();
        }
      }

      // Save results
      await this.saveBackgroundScanResults();

      debug.log('Background scan: complete');
    } catch (error) {
      console.error('Background scan failed:', error);
    } finally {
      this.isScanning = false;
      this.isBackgroundScan = false;
      // Hide loading badge
      chrome.runtime.sendMessage({ type: 'scanEnded' });
    }
  }

  async saveBackgroundScanResults() {
    // Save scan results
    await chrome.storage.local.set({
      scanResults: this.scanResults,
      lastScanDate: new Date().toISOString(),
      lastBackgroundScan: new Date().toISOString()
    });

    // Calculate new books count and update badge
    const newBooksCount = await this.calculateNewBooksCount();
    chrome.runtime.sendMessage({ type: 'updateBadge', count: newBooksCount });

    // Send completion message (sidepanel will receive if open)
    this.sendMessage('scanComplete', {
      totalBooks: this.scanResults.length,
      newBooksFound: newBooksCount,
      seriesCount: new Set(this.scanResults.map(b => b.series)).size,
      allResults: this.scanResults
    });

    debug.log(`Background scan saved: ${this.scanResults.length} books, ${newBooksCount} new`);
  }

  async calculateNewBooksCount() {
    const data = await chrome.storage.local.get(['settings', 'ignoredSeries', 'ignoredBooks']);
    const settings = data.settings || {};
    const ignoredSeries = new Set(data.ignoredSeries || []);
    const ignoredBooks = new Set(data.ignoredBooks || []);

    let total = 0;

    // Group by series
    const seriesMap = new Map();
    this.scanResults.forEach(book => {
      const seriesKey = book.series || 'No Series';
      if (!seriesMap.has(seriesKey)) {
        seriesMap.set(seriesKey, { allSeriesBooks: [], books: [] });
      }
      seriesMap.get(seriesKey).books.push(book);
      if (book.allSeriesBooks) {
        seriesMap.get(seriesKey).allSeriesBooks = book.allSeriesBooks;
      }
    });

    seriesMap.forEach((seriesData, seriesName) => {
      // Skip ignored series (unless showIgnored)
      if (ignoredSeries.has(seriesName) && !settings.showIgnored) return;

      // Skip single-book series if setting enabled
      if (settings.hideSingleBook && seriesData.books.length <= 1) return;

      // Count new books
      if (seriesData.allSeriesBooks) {
        const count = seriesData.allSeriesBooks.filter(b => {
          if (b.status === 'owned') return false;
          if (settings.excludeBundled && b.status === 'covered_by_compilation') return false;
          if (settings.excludePreordered && b.status === 'preordered') return false;
          if (settings.excludeUnavailable && b.status === 'unavailable') return false;
          if (!settings.showIgnored && ignoredBooks.has(b.asin)) return false;
          if (settings.excludeWishlisted && b.inWishlist) return false;
          return true;
        }).length;
        total += count;
      }
    });

    return total;
  }
}

// Initialize scanner when content script loads
debug.log('Audible Library Scanner content script loaded');
debug.log('Document ready state:', document.readyState);
debug.log('Current URL:', window.location.href);

let scanner;

if (document.readyState === 'loading') {
  debug.log('Waiting for DOM to load...');
  document.addEventListener('DOMContentLoaded', () => {
    debug.log('DOM loaded, initializing scanner...');
    scanner = new AudibleLibraryScanner();
    // Check for background scan after a short delay to let page fully load
    setTimeout(() => scanner.checkBackgroundScan(), 2000);
  });
} else {
  debug.log('DOM already loaded, initializing scanner...');
  scanner = new AudibleLibraryScanner();
  // Check for background scan after a short delay to let page fully load
  setTimeout(() => scanner.checkBackgroundScan(), 2000);
}
