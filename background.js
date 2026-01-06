// Background script for Audible Library Scanner

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

debug.log('Background script loading...');

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  debug.log('Extension installed/updated:', details.reason);

  // Open welcome page on first install
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'welcome.html' });
  }
});

// Track scanning state
let isScanning = false;

// Update badge with new book count
async function updateBadge(count) {
  // Don't update count while scanning (keep showing loading)
  if (isScanning) return;

  // Check if badge is enabled in settings
  const data = await chrome.storage.local.get(['settings']);
  const showBadge = data.settings?.showBadge !== false; // Default to true

  if (showBadge && count > 0) {
    await chrome.action.setBadgeText({ text: count > 99 ? '99+' : String(count) });
    await chrome.action.setBadgeBackgroundColor({ color: '#e74c3c' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}

// Show loading indicator on badge
async function showBadgeLoading() {
  isScanning = true;
  await chrome.action.setBadgeText({ text: '...' });
  await chrome.action.setBadgeBackgroundColor({ color: '#3498db' }); // Blue for loading
}

// Hide loading and restore count
async function hideBadgeLoading() {
  isScanning = false;
  const data = await chrome.storage.local.get(['badgeCount']);
  await updateBadge(data.badgeCount || 0);
}

// Load badge count on startup
async function initBadge() {
  const data = await chrome.storage.local.get(['badgeCount']);
  if (data.badgeCount) {
    updateBadge(data.badgeCount);
  }
}
initBadge();

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  debug.log('Extension icon clicked, opening side panel');
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  debug.log('Background received message:', message.type, 'from:', sender.tab ? 'content script' : 'popup');

  // Just pass messages through - no complex forwarding needed
  // The popup listens directly to runtime messages

  if (message.type === 'getStoredData') {
    handleGetStoredData(sendResponse);
    return true; // Will respond asynchronously
  }

  if (message.type === 'saveData') {
    handleSaveData(message.data, sendResponse);
    return true; // Will respond asynchronously
  }

  if (message.type === 'updateBadge') {
    updateBadge(message.count);
    chrome.storage.local.set({ badgeCount: message.count });
    return false;
  }

  if (message.type === 'scanStarted') {
    showBadgeLoading();
    return false;
  }

  if (message.type === 'scanEnded') {
    hideBadgeLoading();
    return false;
  }

  // For scan messages, don't interfere - let them pass through naturally
  return false;
});

async function handleGetStoredData(sendResponse) {
  try {
    const data = await chrome.storage.local.get(['scanResults', 'scanHistory']);
    sendResponse({ success: true, data });
  } catch (error) {
    debug.error('Failed to get stored data:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleSaveData(data, sendResponse) {
  try {
    await chrome.storage.local.set(data);
    sendResponse({ success: true });
  } catch (error) {
    debug.error('Failed to save data:', error);
    sendResponse({ success: false, error: error.message });
  }
}

debug.log('Background script loaded');
