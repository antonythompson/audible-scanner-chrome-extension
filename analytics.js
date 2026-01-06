// Google Analytics 4 - Measurement Protocol
// For Chrome Extensions

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

class Analytics {
  constructor() {
    // GA4 Configuration - Replace these with your values
    this.MEASUREMENT_ID = 'G-VDR22YPZ1B'; // Your GA4 Measurement ID
    this.API_SECRET = 'MPB0HYnWTSOaUqogGy_8_w'; // Your GA4 API Secret

    this.enabled = true;
    this.clientId = null;
    this.sessionId = null;
    this.init();
  }

  async init() {
    // Load settings
    const data = await chrome.storage.local.get(['analyticsEnabled', 'analyticsClientId']);
    this.enabled = data.analyticsEnabled !== false; // Default to enabled

    // Get or create client ID (persists across sessions)
    if (data.analyticsClientId) {
      this.clientId = data.analyticsClientId;
    } else {
      this.clientId = this.generateClientId();
      await chrome.storage.local.set({ analyticsClientId: this.clientId });
    }

    // Generate session ID (new each session)
    this.sessionId = Date.now().toString();

    // Track extension opened
    this.trackEvent('extension_open');
  }

  generateClientId() {
    // Generate a UUID-like client ID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async setEnabled(enabled) {
    this.enabled = enabled;
    await chrome.storage.local.set({ analyticsEnabled: enabled });

    if (enabled) {
      this.trackEvent('analytics_enabled');
    }
  }

  async trackEvent(eventName, params = {}) {
    if (!this.enabled) return;
    if (this.MEASUREMENT_ID === 'G-XXXXXXXXXX') {
      // Analytics not configured - skip silently
      debug.log('[Analytics] Not configured, skipping:', eventName, params);
      return;
    }

    try {
      const payload = {
        client_id: this.clientId,
        events: [{
          name: eventName,
          params: {
            session_id: this.sessionId,
            engagement_time_msec: 100,
            ...params
          }
        }]
      };

      const url = `https://www.google-analytics.com/mp/collect?measurement_id=${this.MEASUREMENT_ID}&api_secret=${this.API_SECRET}`;

      await fetch(url, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      debug.log('[Analytics] Event tracked:', eventName, params);
    } catch (error) {
      console.error('[Analytics] Failed to track event:', error);
    }
  }

  // Convenience methods for common events
  trackScanStarted(scanType) {
    this.trackEvent('scan_started', { scan_type: scanType });
  }

  trackScanCompleted(scanType, booksFound, seriesFound, newBooksFound) {
    this.trackEvent('scan_completed', {
      scan_type: scanType,
      books_found: booksFound,
      series_found: seriesFound,
      new_books_found: newBooksFound
    });
  }

  trackScanError(errorMessage) {
    this.trackEvent('scan_error', { error_message: errorMessage.substring(0, 100) });
  }

  trackViewChanged(viewName) {
    this.trackEvent('view_changed', { view_name: viewName });
  }

  trackFilterUsed(filterType, filterValue) {
    this.trackEvent('filter_used', { filter_type: filterType, filter_value: String(filterValue) });
  }

  trackSortUsed(sortType) {
    this.trackEvent('sort_used', { sort_type: sortType });
  }

  trackSeriesExpanded() {
    this.trackEvent('series_expanded');
  }

  trackSeriesIgnored() {
    this.trackEvent('series_ignored');
  }

  trackSeriesUnignored() {
    this.trackEvent('series_unignored');
  }

  trackBookIgnored() {
    this.trackEvent('book_ignored');
  }

  trackBookUnignored() {
    this.trackEvent('book_unignored');
  }

  trackDataExported(bookCount) {
    this.trackEvent('data_exported', { book_count: bookCount });
  }

  trackDataCleared() {
    this.trackEvent('data_cleared');
  }

  trackSettingChanged(settingName, settingValue) {
    this.trackEvent('setting_changed', {
      setting_name: settingName,
      setting_value: String(settingValue)
    });
  }

  trackBookLinkClicked() {
    this.trackEvent('book_link_clicked');
  }

  trackSeriesLinkClicked() {
    this.trackEvent('series_link_clicked');
  }
}

// Export singleton instance
const analytics = new Analytics();
