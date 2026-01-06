class AudibleScannerSidePanel {
  constructor() {
    this.isScanning = false;
    this.scanResults = [];
    this.currentView = 'dashboard';
    this.ignoredSeries = new Set();
    this.ignoredBooks = new Set();  // Store by ASIN
    this.expandedSeries = new Set();  // Track individually expanded series
    this.filters = {
      search: '',
      sortBy: 'newBooks-desc',
      maxToBuy: null,
      showAllDetails: false,
      onlyWithNew: true
    };
    this.settings = {
      concurrentRequests: 5,
      autoScan: false,
      backgroundScan: false,  // Scan when visiting Audible (once per day)
      defaultSort: 'newBooks-desc',
      excludeWishlisted: true,
      excludePreordered: true,
      excludeUnavailable: true,
      excludeBundled: true,
      hideSingleBook: false,  // Hide series with only one book
      defaultView: 'dashboard',
      showDetailsByDefault: false,
      currentPageOnly: false,
      scanType: 'full',  // 'full', 'library', or 'series'
      showIgnored: false,
      showBadge: true
    };
    this.init();
  }

  async init() {
    // Ensure clean state on init
    this.isScanning = false;

    // Load settings first
    await this.loadSettings();

    // Set initial button states
    document.getElementById('startScan').disabled = false;
    document.getElementById('stopScan').disabled = true;

    // Navigation tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchView(tab.dataset.view));
    });

    // Scan controls
    document.getElementById('startScan').addEventListener('click', () => this.startScan());
    document.getElementById('stopScan').addEventListener('click', () => this.stopScan());
    document.getElementById('exportData').addEventListener('click', () => this.exportData());

    // Filter controls
    document.getElementById('searchInput').addEventListener('input', (e) => {
      this.filters.search = e.target.value.toLowerCase();
      this.updateResultsDisplay();
      this.saveFilters();
      // Track search (debounced - only track if user stops typing)
      clearTimeout(this.searchTrackTimeout);
      this.searchTrackTimeout = setTimeout(() => {
        if (this.filters.search) analytics.trackFilterUsed('search', 'used');
      }, 1000);
    });

    document.getElementById('sortBy').addEventListener('change', (e) => {
      this.filters.sortBy = e.target.value;
      this.updateResultsDisplay();
      this.saveFilters();
      analytics.trackSortUsed(e.target.value);
    });

    document.getElementById('maxToBuy').addEventListener('input', (e) => {
      this.filters.maxToBuy = e.target.value ? parseInt(e.target.value) : null;
      this.updateResultsDisplay();
      this.saveFilters();
      if (this.filters.maxToBuy) analytics.trackFilterUsed('maxToBuy', this.filters.maxToBuy);
    });

    document.getElementById('showAllDetails').addEventListener('change', (e) => {
      this.filters.showAllDetails = e.target.checked;
      this.updateResultsDisplay();
      this.saveFilters();
      analytics.trackFilterUsed('showAllDetails', e.target.checked);
    });

    document.getElementById('onlyWithNew').addEventListener('change', (e) => {
      this.filters.onlyWithNew = e.target.checked;
      this.updateResultsDisplay();
      this.saveFilters();
      analytics.trackFilterUsed('onlyWithNew', e.target.checked);
    });

    // Settings controls
    document.getElementById('settingConcurrent').addEventListener('change', (e) => {
      this.settings.concurrentRequests = parseInt(e.target.value) || 5;
      this.saveSettings();
      analytics.trackSettingChanged('concurrentRequests', this.settings.concurrentRequests);
    });

    document.getElementById('settingAutoScan').addEventListener('change', (e) => {
      this.settings.autoScan = e.target.checked;
      this.saveSettings();
      analytics.trackSettingChanged('autoScan', e.target.checked);
    });

    document.getElementById('settingBackgroundScan').addEventListener('change', (e) => {
      this.settings.backgroundScan = e.target.checked;
      this.saveSettings();
      analytics.trackSettingChanged('backgroundScan', e.target.checked);
    });

    document.getElementById('triggerBackgroundScan').addEventListener('click', async () => {
      await this.triggerBackgroundScan();
    });

    document.getElementById('settingDefaultSort').addEventListener('change', (e) => {
      this.settings.defaultSort = e.target.value;
      this.saveSettings();
      analytics.trackSettingChanged('defaultSort', e.target.value);
    });

    document.getElementById('settingDefaultView').addEventListener('change', (e) => {
      this.settings.defaultView = e.target.value;
      this.saveSettings();
      analytics.trackSettingChanged('defaultView', e.target.value);
    });

    document.getElementById('settingShowDetails').addEventListener('change', (e) => {
      this.settings.showDetailsByDefault = e.target.checked;
      this.saveSettings();
      analytics.trackSettingChanged('showDetailsByDefault', e.target.checked);
    });

    document.getElementById('settingCurrentPageOnly').addEventListener('change', (e) => {
      this.settings.currentPageOnly = e.target.checked;
      this.saveSettings();
      analytics.trackSettingChanged('currentPageOnly', e.target.checked);
    });

    document.getElementById('settingScanType').addEventListener('change', (e) => {
      this.settings.scanType = e.target.value;
      this.updateScanTypeDescription();
      this.saveSettings();
      analytics.trackSettingChanged('scanType', e.target.value);
    });

    document.getElementById('settingExcludeWishlisted').addEventListener('change', (e) => {
      this.settings.excludeWishlisted = e.target.checked;
      this.saveSettings();
      this.updateResultsDisplay();
      this.updateDashboardGrid();
      this.updateStats();
      analytics.trackSettingChanged('excludeWishlisted', e.target.checked);
    });

    document.getElementById('settingExcludePreordered').addEventListener('change', (e) => {
      this.settings.excludePreordered = e.target.checked;
      this.saveSettings();
      this.updateResultsDisplay();
      this.updateDashboardGrid();
      this.updateStats();
      analytics.trackSettingChanged('excludePreordered', e.target.checked);
    });

    document.getElementById('settingExcludeUnavailable').addEventListener('change', (e) => {
      this.settings.excludeUnavailable = e.target.checked;
      this.saveSettings();
      this.updateResultsDisplay();
      this.updateDashboardGrid();
      this.updateStats();
      analytics.trackSettingChanged('excludeUnavailable', e.target.checked);
    });

    document.getElementById('settingExcludeBundled').addEventListener('change', (e) => {
      this.settings.excludeBundled = e.target.checked;
      this.saveSettings();
      this.updateResultsDisplay();
      this.updateDashboardGrid();
      this.updateStats();
      analytics.trackSettingChanged('excludeBundled', e.target.checked);
    });

    document.getElementById('settingHideSingleBook').addEventListener('change', (e) => {
      this.settings.hideSingleBook = e.target.checked;
      this.saveSettings();
      this.updateResultsDisplay();
      this.updateDashboardGrid();
      this.updateStats();
      analytics.trackSettingChanged('hideSingleBook', e.target.checked);
    });

    document.getElementById('settingShowIgnored').addEventListener('change', (e) => {
      this.settings.showIgnored = e.target.checked;
      this.saveSettings();
      this.updateResultsDisplay();
      this.updateDashboardGrid();
      analytics.trackSettingChanged('showIgnored', e.target.checked);
    });

    document.getElementById('settingShowBadge').addEventListener('change', (e) => {
      this.settings.showBadge = e.target.checked;
      this.saveSettings();
      this.updateBadge();
      analytics.trackSettingChanged('showBadge', e.target.checked);
    });

    document.getElementById('settingAnalytics').addEventListener('change', (e) => {
      analytics.setEnabled(e.target.checked);
    });

    document.getElementById('settingDebugMode').addEventListener('change', async (e) => {
      await chrome.storage.local.set({ debugMode: e.target.checked });
      debug.enabled = e.target.checked;
    });

    document.getElementById('clearData').addEventListener('click', () => this.clearData());

    // Backup/Restore buttons
    document.getElementById('backupSettings').addEventListener('click', () => this.backupSettings());
    document.getElementById('restoreSettings').addEventListener('click', () => document.getElementById('restoreFile').click());
    document.getElementById('restoreFile').addEventListener('change', (e) => this.restoreSettings(e));

    // Load saved filters (or apply defaults if none saved)
    await this.loadFilters();

    // Load existing results from storage
    await this.loadResults();

    // Switch to default view
    this.switchView(this.settings.defaultView);

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message);
    });

    // Check if a scan is already running (e.g., background scan)
    await this.checkForActiveScan();

    // Auto-scan if enabled - check if we're on an Audible page first
    if (this.settings.autoScan && !this.isScanning) {
      this.switchView('dashboard');
      // Wait a bit longer for the side panel to fully initialize
      setTimeout(async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url && (tab.url.includes('audible.com') || tab.url.includes('audible.'))) {
          this.startScan();
        } else {
          debug.log('Auto-scan skipped: not on Audible page');
        }
      }, 800);
    }
  }

  async checkForActiveScan() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getScanStatus' });

      if (response?.isScanning) {
        debug.log('Active scan detected:', response);
        this.isScanning = true;
        this.updateUI();

        if (response.isBackgroundScan) {
          const pageInfo = response.totalPages
            ? `page ${response.currentPage}/${response.totalPages}`
            : `${response.booksFound} books found`;
          this.updateStatus(`Background scan: ${pageInfo}...`, 'scanning');
        } else {
          const pageInfo = response.totalPages
            ? `page ${response.currentPage}/${response.totalPages}`
            : '';
          this.updateStatus(`Scan in progress${pageInfo ? ': ' + pageInfo : ''}...`, 'scanning');
        }
      }
    } catch (error) {
      // Content script not available or not on Audible page
      debug.log('Could not check scan status:', error.message);
    }
  }

  switchView(viewName) {
    this.currentView = viewName;

    // Track view change
    analytics.trackViewChanged(viewName);

    // Update tab states
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === viewName);
    });

    // Update view visibility
    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active');
    });
    document.getElementById(`${viewName}View`).classList.add('active');

    // Update last scan info in settings
    if (viewName === 'settings') {
      this.updateLastScanInfo();
    }
  }

  async startScan() {
    debug.log('SidePanel startScan called');

    // Immediately disable button to prevent double-clicks
    if (this.isScanning) {
      debug.log('Already scanning, ignoring click');
      return;
    }

    const startBtn = document.getElementById('startScan');
    const stopBtn = document.getElementById('stopScan');
    startBtn.disabled = true;
    stopBtn.disabled = false;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    debug.log('Active tab:', tab.url);

    if (!tab.url || (!tab.url.includes('audible.com') && !tab.url.includes('audible.'))) {
      this.updateStatus('Please navigate to your Audible library first', 'error');
      startBtn.disabled = false;
      stopBtn.disabled = true;
      return;
    }

    const scanTypeLabels = {
      'full': 'full scan',
      'library': 'library scan',
      'series': 'series scan'
    };
    this.updateStatus(`Starting ${scanTypeLabels[this.settings.scanType] || 'scan'}...`, 'scanning');

    debug.log('Sending startScan message to tab:', tab.id);
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'startScan',
        options: {
          currentPageOnly: this.settings.currentPageOnly,
          scanType: this.settings.scanType,
          concurrentRequests: this.settings.concurrentRequests
        }
      });
      debug.log('Message sent successfully');

      // Only clear results and set scanning state AFTER message succeeds
      this.isScanning = true;
      this.scanResults = [];
      this.updateUI();

      // Show loading badge
      chrome.runtime.sendMessage({ type: 'scanStarted' });

      // Track scan started
      analytics.trackScanStarted(this.settings.scanType);
    } catch (error) {
      console.error('Failed to send message to content script:', error);
      this.updateStatus('Extension not loaded. Please refresh the Audible page.', 'error');
      analytics.trackScanError('Extension not loaded');
      this.isScanning = false;
      // Ensure button states are correct
      startBtn.disabled = false;
      stopBtn.disabled = true;
      this.updateUI();
    }
  }

  async triggerBackgroundScan() {
    debug.log('Triggering background scan manually');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url || !tab.url.includes('audible.')) {
      this.updateStatus('Please navigate to any Audible page first', 'error');
      return;
    }

    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'triggerBackgroundScan' });
      this.updateStatus('Background scan started...', 'scanning');
      this.isScanning = true;
      this.updateUI();
    } catch (error) {
      console.error('Failed to trigger background scan:', error);
      this.updateStatus('Extension not loaded. Please refresh the Audible page.', 'error');
    }
  }

  stopScan() {
    this.isScanning = false;
    this.updateUI();
    this.updateStatus('Scan stopped');

    // Hide loading badge
    chrome.runtime.sendMessage({ type: 'scanEnded' });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'stopScan' });
      }
    });
  }

  handleMessage(message) {
    switch (message.type) {
      case 'scanProgress':
        this.updateProgress(message.data);
        break;
      case 'bookFound':
        this.addBookResult(message.data);
        break;
      case 'seriesUpdate':
        this.onSeriesUpdate(message.data);
        break;
      case 'scanComplete':
        this.onScanComplete(message.data);
        break;
      case 'scanError':
        this.onScanError(message.data);
        break;
    }
  }

  updateProgress(data) {
    debug.log('Progress update:', data);

    if (data.status) {
      this.updateStatus(data.status, 'scanning');
    } else if (data.currentPage !== undefined) {
      const prefix = data.isBackgroundScan ? 'Background scan: ' : 'Scanning ';
      const pageInfo = `page ${data.currentPage}${data.totalPages ? '/' + data.totalPages : ''}`;
      this.updateStatus(`${prefix}${pageInfo}...`, 'scanning');
    }

    if (data.totalPages && data.currentPage > 0) {
      const progress = (data.currentPage / data.totalPages) * 100;
      document.getElementById('progressBar').style.display = 'block';
      document.getElementById('progressFill').style.width = `${progress}%`;
    }
  }

  addBookResult(book) {
    this.scanResults.push(book);
    this.updateResultsDisplay();
    this.updateDashboardGrid();
    this.updateStats();
  }

  onSeriesUpdate(data) {
    this.scanResults.forEach(book => {
      if (book.seriesUrl === data.seriesUrl) {
        book.newBooksAvailable = data.newBooksCount;
        book.totalInSeries = data.totalInSeries;
        book.ownedInSeries = data.ownedCount;
        book.preorderedInSeries = data.preorderCount;
        book.allSeriesBooks = data.allBooks;
      }
    });
    this.updateResultsDisplay();
    this.updateDashboardGrid();
    this.updateStats();
    this.saveResults();
  }

  onScanComplete(data) {
    this.isScanning = false;
    this.updateUI();

    // Use all results from content script (includes existing + new books)
    if (data.allResults && data.allResults.length > 0) {
      this.scanResults = data.allResults;
      this.updateResultsDisplay();
      this.updateDashboardGrid();
      this.updateStats();
    }

    const newBooksCount = this.countNewBooks();
    const seriesCount = this.getGroupedSeries().length;

    // Track scan completed
    analytics.trackScanCompleted(
      this.settings.scanType,
      this.scanResults.length,
      seriesCount,
      newBooksCount
    );

    if (newBooksCount > 0) {
      this.updateStatus(`Scan complete! Found ${newBooksCount} new books to buy!`, 'success');
    } else {
      this.updateStatus(`Scan complete! Your series are up to date.`, 'success');
    }

    document.getElementById('progressBar').style.display = 'none';
    this.saveResults();

    // Hide loading badge and update count
    chrome.runtime.sendMessage({ type: 'scanEnded' });
    this.updateBadge();
  }

  onScanError(error) {
    this.isScanning = false;
    this.updateUI();
    analytics.trackScanError(error);
    this.updateStatus(`Error: ${error}`, 'error');

    // Hide loading badge
    chrome.runtime.sendMessage({ type: 'scanEnded' });
  }

  updateUI() {
    const startBtn = document.getElementById('startScan');
    const stopBtn = document.getElementById('stopScan');

    // Use both property and attribute for maximum compatibility
    startBtn.disabled = this.isScanning;
    stopBtn.disabled = !this.isScanning;

    if (this.isScanning) {
      startBtn.setAttribute('disabled', 'disabled');
      stopBtn.removeAttribute('disabled');
    } else {
      startBtn.removeAttribute('disabled');
      stopBtn.setAttribute('disabled', 'disabled');
    }

    debug.log('updateUI called - isScanning:', this.isScanning, 'startBtn.disabled:', startBtn.disabled, 'stopBtn.disabled:', stopBtn.disabled);

    const statusEl = document.getElementById('status');
    if (this.isScanning) {
      statusEl.classList.add('scanning');
    } else {
      statusEl.classList.remove('scanning');
    }
  }

  updateStatus(message, type = '') {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = 'status';
    if (type) {
      statusEl.classList.add(type);
    }
  }

  updateStats() {
    const stats = document.getElementById('stats');

    // Get filtered and unfiltered counts
    const filteredSeriesCount = this.countSeries(false);
    const totalSeriesCount = this.countSeries(true);
    const filteredNewBooks = this.countNewBooks(false);
    const totalNewBooks = this.countNewBooks(true);

    document.getElementById('statBooks').textContent = this.scanResults.length;
    document.getElementById('statSeries').textContent = filteredSeriesCount;
    document.getElementById('statNew').textContent = filteredNewBooks;

    // Show unfiltered counts if different
    const seriesFilteredEl = document.getElementById('statSeriesFiltered');
    const newFilteredEl = document.getElementById('statNewFiltered');

    if (this.settings.hideSingleBook && filteredSeriesCount !== totalSeriesCount) {
      seriesFilteredEl.textContent = `(${totalSeriesCount} total)`;
    } else {
      seriesFilteredEl.textContent = '';
    }

    if (this.settings.hideSingleBook && filteredNewBooks !== totalNewBooks) {
      newFilteredEl.textContent = `(${totalNewBooks} total)`;
    } else {
      newFilteredEl.textContent = '';
    }

    stats.style.display = this.scanResults.length > 0 ? 'grid' : 'none';

    // Update extension badge
    this.updateBadge();
  }

  countNewBooks(ignoreFilters = false) {
    // Use grouped series data which has adjusted counts
    const seriesMap = this.getGroupedSeries();
    let total = 0;

    seriesMap.forEach((data, seriesName) => {
      // Skip ignored series (unless showIgnored is enabled, matching library view)
      if (this.ignoredSeries.has(seriesName) && !this.settings.showIgnored) return;

      // Skip single-book series if setting enabled (unless ignoring filters)
      if (!ignoreFilters && this.settings.hideSingleBook && data.books.length <= 1) return;

      // Use adjusted count (excludes ignored books) if available
      const count = data.newBooksAvailableAdjusted !== undefined
        ? data.newBooksAvailableAdjusted
        : data.newBooksAvailable;

      total += count;
    });

    return total;
  }

  countSeries(ignoreFilters = false) {
    const seriesMap = this.getGroupedSeries();
    let total = 0;

    seriesMap.forEach((data, seriesName) => {
      // Skip ignored series (unless showIgnored is enabled)
      if (this.ignoredSeries.has(seriesName) && !this.settings.showIgnored) return;

      // Skip single-book series if setting enabled (unless ignoring filters)
      if (!ignoreFilters && this.settings.hideSingleBook && data.books.length <= 1) return;

      total++;
    });

    return total;
  }

  updateBadge() {
    const count = this.settings.showBadge ? this.countNewBooks() : 0;
    chrome.runtime.sendMessage({ type: 'updateBadge', count });
  }

  // Dashboard Grid Methods
  getNewBooks(limit = 12) {
    const seriesMap = this.getGroupedSeries();
    const newBooks = [];

    seriesMap.forEach((data, seriesName) => {
      // Skip ignored series
      if (this.ignoredSeries.has(seriesName) && !this.settings.showIgnored) return;

      // Skip single-book series if setting enabled
      if (this.settings.hideSingleBook && data.books.length <= 1) return;

      // Get new books from this series based on settings
      if (data.allSeriesBooks && data.allSeriesBooks.length > 0) {
        data.allSeriesBooks.forEach(book => {
          // Always exclude owned books
          if (book.status === 'owned') return;
          // Conditionally exclude based on settings
          if (this.settings.excludeBundled && book.status === 'covered_by_compilation') return;
          if (this.settings.excludePreordered && book.status === 'preordered') return;
          if (this.settings.excludeUnavailable && book.status === 'unavailable') return;
          if (!this.settings.showIgnored && this.ignoredBooks.has(book.asin)) return;
          if (this.settings.excludeWishlisted && book.inWishlist) return;

          newBooks.push({
            ...book,
            seriesName,
            seriesUrl: data.seriesUrl,
            seriesCoverImage: data.coverImage
          });
        });
      }
    });

    // Sort by scannedAt date (most recent first), then by release date
    newBooks.sort((a, b) => {
      const dateA = new Date(a.scannedAt || 0);
      const dateB = new Date(b.scannedAt || 0);
      if (dateB - dateA !== 0) return dateB - dateA;
      // Secondary sort by release date
      const relA = a.releaseDate ? new Date(a.releaseDate) : new Date(0);
      const relB = b.releaseDate ? new Date(b.releaseDate) : new Date(0);
      return relB - relA;
    });

    return newBooks.slice(0, limit);
  }

  updateDashboardGrid() {
    const gridContainer = document.getElementById('newBooksGrid');
    const newBooksSection = document.getElementById('newBooksSection');
    const emptyState = document.getElementById('emptyState');

    if (this.scanResults.length === 0) {
      newBooksSection.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    const newBooks = this.getNewBooks(12);

    if (newBooks.length === 0) {
      newBooksSection.style.display = 'none';
      emptyState.style.display = 'block';
      emptyState.innerHTML = `
        <div class="icon">✓</div>
        <div>You're all caught up!</div>
        <div style="font-size: 12px; margin-top: 8px;">No new books found in your series</div>
      `;
      return;
    }

    newBooksSection.style.display = 'block';
    emptyState.style.display = 'none';
    gridContainer.innerHTML = '';

    newBooks.forEach(book => {
      const item = document.createElement('div');
      item.className = 'series-grid-item has-new';

      const imgHtml = book.seriesCoverImage
        ? `<img src="${book.seriesCoverImage}" alt="${book.title}">`
        : `<div class="placeholder-img">📖</div>`;
      const shortTitle = book.title.length > 25 ? book.title.substring(0, 25) + '...' : book.title;
      const shortSeries = book.seriesName.length > 20 ? book.seriesName.substring(0, 20) + '...' : book.seriesName;
      const bookNum = book.bookNumber ? `#${book.bookNumber}` : '';
      const wishlistBadge = book.inWishlist ? ' <span class="wishlist-icon" title="In your wishlist">❤️</span>' : '';

      item.innerHTML = `
        ${imgHtml}
        <div class="grid-series-name">${shortTitle}${wishlistBadge}</div>
        <div class="grid-latest-book">${shortSeries} ${bookNum}</div>
        <div class="grid-new-badge">${book.releaseDate || ''}</div>
      `;

      // Click to open series page
      if (book.seriesUrl) {
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => {
          window.open(book.seriesUrl, '_blank');
        });
      }

      gridContainer.appendChild(item);
    });
  }

  getGroupedSeries() {
    const seriesMap = new Map();

    this.scanResults.forEach(book => {
      const seriesKey = book.series || 'No Series';
      if (!seriesMap.has(seriesKey)) {
        seriesMap.set(seriesKey, {
          name: seriesKey,
          books: [],
          newBooksAvailable: 0,
          totalInSeries: 0,
          ownedInSeries: 0,
          preorderedInSeries: 0,
          allSeriesBooks: [],
          seriesUrl: book.seriesUrl,
          coverImage: book.coverImage || '',
          latestPurchaseDate: null,
          averageLength: 0,
          totalLength: 0
        });
      }

      const seriesData = seriesMap.get(seriesKey);
      seriesData.books.push(book);
      seriesData.newBooksAvailable = Math.max(seriesData.newBooksAvailable, book.newBooksAvailable || 0);
      seriesData.totalInSeries = Math.max(seriesData.totalInSeries, book.totalInSeries || 0);
      seriesData.ownedInSeries = Math.max(seriesData.ownedInSeries, book.ownedInSeries || 0);
      seriesData.preorderedInSeries = Math.max(seriesData.preorderedInSeries, book.preorderedInSeries || 0);

      // Use the first available cover image for the series
      if (!seriesData.coverImage && book.coverImage) {
        seriesData.coverImage = book.coverImage;
      }

      if (book.allSeriesBooks && book.allSeriesBooks.length > 0) {
        seriesData.allSeriesBooks = book.allSeriesBooks;

        // Calculate average length from all series books
        const booksWithLength = book.allSeriesBooks.filter(b => b.lengthMinutes > 0);
        if (booksWithLength.length > 0) {
          const totalMinutes = booksWithLength.reduce((sum, b) => sum + b.lengthMinutes, 0);
          seriesData.averageLength = Math.round(totalMinutes / booksWithLength.length);
          seriesData.totalLength = totalMinutes;
        }

        // Calculate adjusted newBooksAvailable based on settings
        const newBooksCount = book.allSeriesBooks.filter(b => {
          // Always exclude owned books
          if (b.status === 'owned') return false;
          // Conditionally exclude based on settings
          if (this.settings.excludeBundled && b.status === 'covered_by_compilation') return false;
          if (this.settings.excludePreordered && b.status === 'preordered') return false;
          if (this.settings.excludeUnavailable && b.status === 'unavailable') return false;
          if (!this.settings.showIgnored && this.ignoredBooks.has(b.asin)) return false;
          if (this.settings.excludeWishlisted && b.inWishlist) return false;
          return true;
        }).length;
        seriesData.newBooksAvailableAdjusted = newBooksCount;
      }

      // Track latest purchase date
      if (book.scannedAt) {
        const date = new Date(book.scannedAt);
        if (!seriesData.latestPurchaseDate || date > seriesData.latestPurchaseDate) {
          seriesData.latestPurchaseDate = date;
        }
      }
    });

    return seriesMap;
  }

  filterSeries(seriesArray) {
    return seriesArray.filter(([name, data]) => {
      // Hide ignored series unless showIgnored is enabled
      if (this.ignoredSeries.has(name) && !this.settings.showIgnored) {
        return false;
      }

      // Only show series with new books
      if (this.filters.onlyWithNew) {
        const newCount = data.newBooksAvailableAdjusted !== undefined
          ? data.newBooksAvailableAdjusted
          : data.newBooksAvailable;
        if (newCount <= 0) return false;
      }

      // Search filter
      if (this.filters.search) {
        const searchMatch = name.toLowerCase().includes(this.filters.search) ||
          data.books.some(b => b.title?.toLowerCase().includes(this.filters.search) ||
                               b.author?.toLowerCase().includes(this.filters.search));
        if (!searchMatch) return false;
      }

      // Hide single-book series
      if (this.settings.hideSingleBook && data.books.length <= 1) {
        return false;
      }

      // Max books to buy filter
      if (this.filters.maxToBuy !== null && data.newBooksAvailable > this.filters.maxToBuy) {
        return false;
      }

      return true;
    });
  }

  sortSeries(seriesArray) {
    // Parse sort value into field and direction
    const [sortField, sortDir] = this.filters.sortBy.split('-');
    const isAsc = sortDir === 'asc';

    return seriesArray.sort((a, b) => {
      const [nameA, dataA] = a;
      const [nameB, dataB] = b;

      // "No Series" always at bottom
      if (nameA === 'No Series') return 1;
      if (nameB === 'No Series') return -1;

      let result = 0;

      switch (sortField) {
        case 'newBooks':
          if (dataB.newBooksAvailable !== dataA.newBooksAvailable) {
            result = dataB.newBooksAvailable - dataA.newBooksAvailable;
          } else {
            result = nameA.localeCompare(nameB);
            return result;
          }
          break;

        case 'alphabetical':
          result = nameA.localeCompare(nameB);
          break;

        case 'releaseDate':
          const dateA = dataA.latestPurchaseDate || new Date(0);
          const dateB = dataB.latestPurchaseDate || new Date(0);
          result = dateB - dateA;
          break;

        case 'bookLength':
          result = (dataB.averageLength || 0) - (dataA.averageLength || 0);
          break;

        case 'owned':
          if (dataB.books.length !== dataA.books.length) {
            result = dataB.books.length - dataA.books.length;
          } else {
            result = nameA.localeCompare(nameB);
            return result;
          }
          break;

        default:
          return 0;
      }

      return isAsc ? -result : result;
    });
  }

  updateResultsDisplay() {
    const resultsList = document.getElementById('resultsList');
    const filteredCountEl = document.getElementById('filteredCount');

    // Group, filter, and sort series
    const seriesMap = this.getGroupedSeries();
    let seriesArray = Array.from(seriesMap.entries());
    const totalSeries = seriesArray.length;

    seriesArray = this.filterSeries(seriesArray);
    seriesArray = this.sortSeries(seriesArray);

    // Update filtered count
    filteredCountEl.textContent = seriesArray.length < totalSeries
      ? `(${seriesArray.length} of ${totalSeries})`
      : `(${totalSeries})`;

    resultsList.innerHTML = '';

    if (seriesArray.length === 0) {
      resultsList.innerHTML = '<div class="no-results">No series match your filters</div>';
      return;
    }

    // Summary if there are new books (using adjusted count that excludes ignored books)
    const seriesWithNewBooks = seriesArray.filter(([_, data]) => {
      const count = data.newBooksAvailableAdjusted !== undefined
        ? data.newBooksAvailableAdjusted
        : data.newBooksAvailable;
      return count > 0;
    }).length;
    if (seriesWithNewBooks > 0) {
      const summaryDiv = document.createElement('div');
      summaryDiv.className = 'result-summary';
      summaryDiv.innerHTML = `<strong>${seriesWithNewBooks} series have new books available!</strong>`;
      resultsList.appendChild(summaryDiv);
    }

    // Render each series
    seriesArray.forEach(([seriesName, data]) => {
      const isIgnored = this.ignoredSeries.has(seriesName);
      // Use adjusted count (excluding ignored books) if available
      const newBooksCount = data.newBooksAvailableAdjusted !== undefined
        ? data.newBooksAvailableAdjusted
        : data.newBooksAvailable;

      const seriesDiv = document.createElement('div');
      seriesDiv.className = 'result-item' + (newBooksCount > 0 ? ' has-new-books' : '') + (isIgnored ? ' ignored' : '');
      let newBooksText = '';
      if (newBooksCount > 0 && !this.filters.showAllDetails) {
        newBooksText = `<div class="new-books">${newBooksCount} new book${newBooksCount > 1 ? 's' : ''} to buy!</div>`;
      }

      // Series info
      let seriesInfo = '';
      if (data.totalInSeries > 0) {
        seriesInfo = `${data.ownedInSeries || data.books.length} owned`;
        if (data.preorderedInSeries > 0) {
          seriesInfo += `, ${data.preorderedInSeries} preordered`;
        }
        seriesInfo += ` of ${data.totalInSeries}`;
      } else {
        seriesInfo = `${data.books.length} book${data.books.length > 1 ? 's' : ''}`;
      }

      // Add average length if available
      if (data.averageLength > 0) {
        seriesInfo += ` · avg ${this.formatLength(data.averageLength)}`;
      }

      const seriesLink = data.seriesUrl
        ? `<a href="${data.seriesUrl}" target="_blank" class="series-link">${seriesName}</a>`
        : seriesName;

      // Thumbnail image (with placeholder fallback)
      const thumbnailHtml = data.coverImage
        ? `<img src="${data.coverImage}" alt="${seriesName}" class="series-thumbnail">`
        : `<div class="series-thumbnail-placeholder">📚</div>`;

      // All books list (shown when "Show all details" is enabled OR series is individually expanded)
      const isExpanded = this.filters.showAllDetails || this.expandedSeries.has(seriesName);
      let allBooksHtml = '';
      if (isExpanded) {
        let booksList = '';

        if (data.allSeriesBooks && data.allSeriesBooks.length > 0) {
          // Show full series data from series page scan
          const sortedBooks = [...data.allSeriesBooks].sort((a, b) => {
            return (a.bookNumber || 999) - (b.bookNumber || 999);
          });

          booksList = sortedBooks.map(book => {
            const isOwned = book.status === 'owned';
            const isCovered = book.status === 'covered_by_compilation';
            const isPreordered = book.status === 'preordered';
            const isUnavailable = book.status === 'unavailable';
            const isPlusCatalog = book.status === 'plus_catalog';
            const isIgnored = this.isBookIgnored(book.asin);
            const isWishlisted = book.inWishlist;
            const isNotOwned = !isOwned && !isCovered && !isPreordered && !isUnavailable;

            let statusClass = (isOwned || isCovered) ? 'owned' : (isPreordered ? 'preordered' : (isUnavailable ? 'unavailable' : (isPlusCatalog ? 'plus-catalog' : 'not-owned')));
            if (isIgnored && isNotOwned) statusClass += ' ignored-book';
            if (isWishlisted && isNotOwned) statusClass += ' wishlisted';

            const bookNum = book.bookNumber ? `#${book.bookNumber}` : '';
            const title = book.title.length > 35 ? book.title.substring(0, 35) + '...' : book.title;
            const meta = [book.releaseDate, book.length].filter(Boolean).join(' · ');
            const coveredNote = isCovered ? ' (via bundle)' : '';
            const unavailableNote = isUnavailable ? ' ⊘' : '';
            const plusNote = isPlusCatalog ? ' <span class="plus-icon" title="Free with Plus subscription">➕</span>' : '';
            const wishlistNote = (isWishlisted && isNotOwned) ? ' <span class="wishlist-icon" title="In your wishlist">❤️</span>' : '';
            const bookLink = book.asin ? `<a href="https://www.audible.com/pd/${book.asin}" target="_blank" title="${book.title}">${title}</a>` : title;

            // Only show ignore button for not-owned books (not unavailable)
            const ignoreBtn = isNotOwned
              ? `<button class="ignore-book-btn" data-asin="${book.asin}" title="${isIgnored ? 'Unignore book' : 'Ignore book'}">${isIgnored ? '👁' : '🚫'}</button>`
              : '';

            return `<div class="book-row ${statusClass}">
              <span class="book-number">${bookNum}</span>
              <span class="book-title">${bookLink}${coveredNote}${unavailableNote}${plusNote}${wishlistNote}</span>
              <span class="book-meta">${meta}</span>
              ${ignoreBtn}
            </div>`;
          }).join('');
        } else {
          // Fallback: show owned books from library scan
          const sortedBooks = [...data.books].sort((a, b) => {
            const numA = parseInt(a.bookNumber) || 999;
            const numB = parseInt(b.bookNumber) || 999;
            return numA - numB;
          });

          booksList = sortedBooks.map(book => {
            const bookNum = book.bookNumber ? `#${book.bookNumber}` : '';
            const title = book.title.length > 35 ? book.title.substring(0, 35) + '...' : book.title;
            const bookLink = book.bookUrl ? `<a href="${book.bookUrl}" target="_blank" title="${book.title}">${title}</a>` : title;

            return `<div class="book-row owned">
              <span class="book-number">${bookNum}</span>
              <span class="book-title">${bookLink}</span>
              <span class="book-meta">${book.author || ''}</span>
            </div>`;
          }).join('');

          // Add note about re-scanning
          if (data.newBooksAvailable > 0) {
            booksList += `<div class="book-row not-owned" style="opacity: 0.7; font-style: italic;">
              <span class="book-number"></span>
              <span class="book-title">+ ${data.newBooksAvailable} more (re-scan for details)</span>
              <span class="book-meta"></span>
            </div>`;
          }
        }

        allBooksHtml = `<div class="all-books-list visible">${booksList}</div>`;
      }

      const ignoreButtonText = isIgnored ? '👁' : '🚫';
      const ignoreButtonTitle = isIgnored ? 'Remove from ignore list' : 'Ignore this series';
      const expandButtonText = isExpanded ? '▼' : '▶';
      const expandButtonTitle = isExpanded ? 'Collapse details' : 'Show all books in series';

      seriesDiv.innerHTML = `
        <div class="series-header">
          <div class="series-content">
            ${thumbnailHtml}
            <div class="series-info-wrapper">
              <div class="series-name">${seriesLink}</div>
              <div class="book-info">${seriesInfo}</div>
            </div>
          </div>
          <div class="series-actions">
            <button class="expand-btn" title="${expandButtonTitle}">${expandButtonText}</button>
            <button class="ignore-btn" title="${ignoreButtonTitle}">${ignoreButtonText}</button>
          </div>
        </div>
        ${newBooksText}
        ${allBooksHtml}
      `;

      // Add click handler for expand button
      const expandBtn = seriesDiv.querySelector('.expand-btn');
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleExpandSeries(seriesName);
      });

      // Add click handler for ignore series button
      const ignoreBtn = seriesDiv.querySelector('.ignore-btn');
      ignoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleIgnoreSeries(seriesName);
      });

      // Add click handlers for ignore book buttons
      seriesDiv.querySelectorAll('.ignore-book-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const asin = btn.dataset.asin;
          this.toggleIgnoreBook(asin);
        });
      });

      resultsList.appendChild(seriesDiv);
    });
  }

  // Settings Methods
  async loadSettings() {
    const data = await chrome.storage.local.get(['settings', 'ignoredSeries', 'ignoredBooks']);
    if (data.settings) {
      this.settings = { ...this.settings, ...data.settings };
    }
    if (data.ignoredSeries) {
      this.ignoredSeries = new Set(data.ignoredSeries);
    }
    if (data.ignoredBooks) {
      this.ignoredBooks = new Set(data.ignoredBooks);
    }

    // Apply to UI
    document.getElementById('settingConcurrent').value = this.settings.concurrentRequests;
    document.getElementById('settingAutoScan').checked = this.settings.autoScan;
    document.getElementById('settingBackgroundScan').checked = this.settings.backgroundScan;
    document.getElementById('settingDefaultSort').value = this.settings.defaultSort;
    document.getElementById('settingDefaultView').value = this.settings.defaultView;
    document.getElementById('settingShowDetails').checked = this.settings.showDetailsByDefault;
    document.getElementById('settingCurrentPageOnly').checked = this.settings.currentPageOnly;
    document.getElementById('settingScanType').value = this.settings.scanType;
    document.getElementById('settingShowIgnored').checked = this.settings.showIgnored;
    document.getElementById('settingExcludeWishlisted').checked = this.settings.excludeWishlisted;
    document.getElementById('settingExcludePreordered').checked = this.settings.excludePreordered;
    document.getElementById('settingExcludeUnavailable').checked = this.settings.excludeUnavailable;
    document.getElementById('settingExcludeBundled').checked = this.settings.excludeBundled;
    document.getElementById('settingHideSingleBook').checked = this.settings.hideSingleBook;
    document.getElementById('settingShowBadge').checked = this.settings.showBadge !== false;
    this.updateScanTypeDescription();

    // Load analytics and debug settings
    chrome.storage.local.get(['analyticsEnabled', 'debugMode'], (data) => {
      document.getElementById('settingAnalytics').checked = data.analyticsEnabled !== false;
      document.getElementById('settingDebugMode').checked = data.debugMode === true;
    });
  }

  async saveIgnoredSeries() {
    await chrome.storage.local.set({ ignoredSeries: [...this.ignoredSeries] });
  }

  async saveIgnoredBooks() {
    await chrome.storage.local.set({ ignoredBooks: [...this.ignoredBooks] });
  }

  // Backup/Restore Methods
  async backupSettings() {
    const backup = {
      version: 1,
      exportDate: new Date().toISOString(),
      settings: this.settings,
      ignoredSeries: [...this.ignoredSeries],
      ignoredBooks: [...this.ignoredBooks],
      filters: this.filters
    };

    const dataStr = JSON.stringify(backup, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `audible-scanner-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();

    URL.revokeObjectURL(url);
    this.updateStatus('Settings backed up successfully');
    analytics.trackEvent('settings_backed_up');
  }

  async restoreSettings(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      // Validate backup file
      if (!backup.version || !backup.settings) {
        throw new Error('Invalid backup file format');
      }

      // Restore settings
      if (backup.settings) {
        this.settings = { ...this.settings, ...backup.settings };
        await this.saveSettings();
      }

      // Restore ignored series
      if (backup.ignoredSeries && Array.isArray(backup.ignoredSeries)) {
        this.ignoredSeries = new Set(backup.ignoredSeries);
        await this.saveIgnoredSeries();
      }

      // Restore ignored books
      if (backup.ignoredBooks && Array.isArray(backup.ignoredBooks)) {
        this.ignoredBooks = new Set(backup.ignoredBooks);
        await this.saveIgnoredBooks();
      }

      // Restore filters
      if (backup.filters) {
        this.filters = { ...this.filters, ...backup.filters };
        await this.saveFilters();
      }

      // Reload settings UI
      await this.loadSettings();
      await this.loadFilters();

      // Update displays
      this.updateResultsDisplay();
      this.updateDashboardGrid();
      this.updateStats();

      this.updateStatus('Settings restored successfully');
      analytics.trackEvent('settings_restored');
    } catch (error) {
      console.error('Failed to restore settings:', error);
      this.updateStatus('Failed to restore: ' + error.message, 'error');
    }

    // Reset file input
    event.target.value = '';
  }

  toggleIgnoreSeries(seriesName) {
    if (this.ignoredSeries.has(seriesName)) {
      this.ignoredSeries.delete(seriesName);
      analytics.trackSeriesUnignored();
    } else {
      this.ignoredSeries.add(seriesName);
      analytics.trackSeriesIgnored();
    }
    this.saveIgnoredSeries();
    this.updateResultsDisplay();
    this.updateDashboardGrid();
    this.updateStats();
  }

  toggleIgnoreBook(asin) {
    if (this.ignoredBooks.has(asin)) {
      this.ignoredBooks.delete(asin);
      analytics.trackBookUnignored();
    } else {
      this.ignoredBooks.add(asin);
      analytics.trackBookIgnored();
    }
    this.saveIgnoredBooks();
    this.updateResultsDisplay();
    this.updateDashboardGrid();
    this.updateStats();
  }

  toggleExpandSeries(seriesName) {
    if (this.expandedSeries.has(seriesName)) {
      this.expandedSeries.delete(seriesName);
    } else {
      this.expandedSeries.add(seriesName);
      analytics.trackSeriesExpanded();
    }
    this.updateResultsDisplay();
  }

  isBookIgnored(asin) {
    return this.ignoredBooks.has(asin);
  }

  async saveSettings() {
    await chrome.storage.local.set({ settings: this.settings });
  }

  async saveFilters() {
    await chrome.storage.local.set({ filters: this.filters });
  }

  async loadFilters() {
    const data = await chrome.storage.local.get(['filters']);
    if (data.filters) {
      this.filters = { ...this.filters, ...data.filters };
    }

    // Apply to UI
    document.getElementById('searchInput').value = this.filters.search || '';
    document.getElementById('sortBy').value = this.filters.sortBy;
    document.getElementById('maxToBuy').value = this.filters.maxToBuy || '';
    document.getElementById('showAllDetails').checked = this.filters.showAllDetails;
    document.getElementById('onlyWithNew').checked = this.filters.onlyWithNew;
  }

  updateScanTypeDescription() {
    const descriptions = {
      'full': 'Full Scan: Scans library pages then checks each series for new books',
      'library': 'Library Only: Only scans library pages for your owned books (faster)',
      'series': 'Series Only: Only checks existing series for new books (uses saved library data)'
    };
    const descEl = document.getElementById('scanTypeDescription');
    if (descEl) {
      descEl.textContent = descriptions[this.settings.scanType] || descriptions['full'];
    }
  }

  async clearData() {
    if (confirm('Are you sure you want to clear all scan data?')) {
      this.scanResults = [];
      await chrome.storage.local.remove(['scanResults', 'lastScanDate']);
      this.updateStats();
      this.updateResultsDisplay();
      this.updateDashboardGrid();
      this.updateStatus('Data cleared');
      this.updateLastScanInfo();
      analytics.trackDataCleared();
    }
  }

  updateLastScanInfo() {
    chrome.storage.local.get(['lastScanDate'], (data) => {
      const infoEl = document.getElementById('lastScanInfo');
      if (data.lastScanDate) {
        const date = new Date(data.lastScanDate);
        const timeAgo = this.getTimeAgo(date);
        infoEl.textContent = `Last scan: ${timeAgo} (${this.scanResults.length} books)`;
      } else {
        infoEl.textContent = 'No scans yet';
      }
    });
  }

  async saveResults() {
    await chrome.storage.local.set({
      scanResults: this.scanResults,
      lastScanDate: new Date().toISOString()
    });
  }

  async loadResults() {
    const data = await chrome.storage.local.get(['scanResults', 'lastScanDate']);
    this.scanResults = data.scanResults || [];

    if (this.scanResults.length > 0) {
      this.updateResultsDisplay();
      this.updateDashboardGrid();
      this.updateStats();
      this.updateBadge();

      if (data.lastScanDate) {
        const lastScan = new Date(data.lastScanDate);
        const timeAgo = this.getTimeAgo(lastScan);
        this.updateStatus(`Last scan: ${timeAgo}`);
      }
    }
  }

  getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  formatLength(minutes) {
    if (!minutes) return '';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  }

  exportData() {
    const exportData = {
      exportDate: new Date().toISOString(),
      totalBooks: this.scanResults.length,
      series: this.groupBySeries(),
      books: this.scanResults
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `audible-library-${new Date().toISOString().split('T')[0]}.json`;
    link.click();

    URL.revokeObjectURL(url);
    analytics.trackDataExported(this.scanResults.length);
  }

  groupBySeries() {
    const seriesMap = {};
    this.scanResults.forEach(book => {
      const key = book.series || 'No Series';
      if (!seriesMap[key]) {
        seriesMap[key] = {
          seriesName: key,
          seriesUrl: book.seriesUrl,
          coverImage: book.coverImage || null,
          totalInSeries: book.totalInSeries || 0,
          ownedCount: book.ownedInSeries || 0,
          preorderedCount: book.preorderedInSeries || 0,
          newBooksAvailable: book.newBooksAvailable || 0,
          averageLengthMinutes: 0,
          totalLengthMinutes: 0,
          allSeriesBooks: book.allSeriesBooks || [],
          ownedBooks: []
        };
      }

      // Update with best available data
      const series = seriesMap[key];
      if (!series.coverImage && book.coverImage) {
        series.coverImage = book.coverImage;
      }
      if (book.allSeriesBooks && book.allSeriesBooks.length > series.allSeriesBooks.length) {
        series.allSeriesBooks = book.allSeriesBooks;

        // Calculate length stats
        const booksWithLength = book.allSeriesBooks.filter(b => b.lengthMinutes > 0);
        if (booksWithLength.length > 0) {
          series.totalLengthMinutes = booksWithLength.reduce((sum, b) => sum + b.lengthMinutes, 0);
          series.averageLengthMinutes = Math.round(series.totalLengthMinutes / booksWithLength.length);
        }
      }
      series.totalInSeries = Math.max(series.totalInSeries, book.totalInSeries || 0);
      series.ownedCount = Math.max(series.ownedCount, book.ownedInSeries || 0);
      series.preorderedCount = Math.max(series.preorderedCount, book.preorderedInSeries || 0);
      series.newBooksAvailable = Math.max(series.newBooksAvailable, book.newBooksAvailable || 0);

      series.ownedBooks.push({
        title: book.title,
        author: book.author,
        narrator: book.narrator,
        bookNumber: book.bookNumber,
        bookUrl: book.bookUrl,
        coverImage: book.coverImage,
        lengthMinutes: book.lengthMinutes,
        scannedAt: book.scannedAt
      });
    });
    return seriesMap;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new AudibleScannerSidePanel();
});
