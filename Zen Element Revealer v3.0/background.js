// Zen Element Revealer - Background Service Worker
class ZenWindowManager {
    constructor() {
        this.popoutWindow = null;
        this.popoutWindowId = null;
        this.currentTabId = null;
        this.tabStates = new Map();
        this.windowPort = null;
        this.windowCloseListener = null; // Track the listener to avoid duplicates
        
        this.setupMessageHandlers();
        this.setupTabHandlers();
    }
    
    setupMessageHandlers() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            // Handle async messages properly
            this.handleMessage(message, sender, sendResponse).catch(error => {
                console.error('Message handler error:', error);
                sendResponse({ error: error.message });
            });
            return true; // Keep channel open for async responses
        });
        
        // Handle connections from popup window
        chrome.runtime.onConnect.addListener((port) => {
            if (port.name === 'zen-window') {
                this.windowPort = port;
                console.log('Window connected via port');
                
                port.onDisconnect.addListener(() => {
                    console.log('Window port disconnected');
                    this.windowPort = null;
                    this.popoutWindow = null;
                    this.popoutWindowId = null;
                });
            }
        });
    }
    
    setupTabHandlers() {
        // Track active tab changes
        chrome.tabs.onActivated.addListener((activeInfo) => {
            this.handleTabSwitch(activeInfo.tabId);
        });
        
        // Handle tab updates
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && this.windowPort) {
                this.notifyWindowOfTabUpdate(tabId);
            }
        });
        
        // Clean up when tabs are closed
        chrome.tabs.onRemoved.addListener((tabId) => {
            this.tabStates.delete(tabId);
        });
    }
    
    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'CREATE_POPUP_WINDOW':
                    const result = await this.createPopupWindow(message.tabId);
                    sendResponse(result);
                    break;
                    
                case 'DISCOVER_ELEMENTS':
                    const discovery = await this.discoverElements(message.tabId);
                    sendResponse(discovery);
                    break;
                    
                case 'REVEAL_ELEMENT':
                    const revealResult = await this.revealElement(message.tabId, message.elementId);
                    sendResponse(revealResult);
                    break;
                    
                case 'RESTORE_ELEMENT':
                    const restoreResult = await this.restoreElement(message.tabId, message.elementId);
                    sendResponse(restoreResult);
                    break;
                    
                case 'REVEAL_ALL':
                    const revealAllResult = await this.revealAll(message.tabId);
                    sendResponse(revealAllResult);
                    break;
                    
                case 'RESTORE_ALL':
                    const restoreAllResult = await this.restoreAll(message.tabId);
                    sendResponse(restoreAllResult);
                    break;
                    
                case 'HIGHLIGHT_ELEMENT':
                    const highlightResult = await this.highlightElement(message.tabId, message.elementId);
                    sendResponse(highlightResult);
                    break;
                    
                case 'UNHIGHLIGHT_ALL':
                    const unhighlightResult = await this.unhighlightAll(message.tabId);
                    sendResponse(unhighlightResult);
                    break;
                    
                case 'SWITCH_TAB_HOOK':
                    const switchResult = await this.switchTabHook();
                    sendResponse(switchResult);
                    break;
                    
                case 'REFRESH_HOOK':
                    const refreshResult = await this.refreshHook(message.tabId);
                    sendResponse(refreshResult);
                    break;
                    
                case 'GET_TAB_INFO':
                    const tabInfo = await this.getTabInfo(message.tabId);
                    sendResponse(tabInfo);
                    break;
                    
                default:
                    sendResponse({ error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('Background message error:', error);
            sendResponse({ error: error.message });
        }
    }
    
    async createPopupWindow(tabId) {
        try {
            this.currentTabId = tabId;
            
            // Close existing popup if open
            if (this.popoutWindowId) {
                try {
                    await chrome.windows.remove(this.popoutWindowId);
                } catch (e) {
                    // Window might already be closed
                }
                this.cleanupWindow();
            }
            
            // Create new popup window
            this.popoutWindow = await chrome.windows.create({
                url: chrome.runtime.getURL('window.html'),
                type: 'popup',
                width: 420,
                height: 680,
                focused: true,
                left: 100,
                top: 100
            });
            
            this.popoutWindowId = this.popoutWindow.id;
            
            // Remove any existing window close listener to prevent duplicates
            if (this.windowCloseListener) {
                chrome.windows.onRemoved.removeListener(this.windowCloseListener);
            }
            
            // Create and add new window close listener
            this.windowCloseListener = (windowId) => {
                if (windowId === this.popoutWindowId) {
                    this.cleanupWindow();
                }
            };
            chrome.windows.onRemoved.addListener(this.windowCloseListener);
            
            return { success: true, windowId: this.popoutWindowId };
        } catch (error) {
            console.error('Window creation error:', error);
            return { success: false, error: error.message };
        }
    }
    
    cleanupWindow() {
        this.popoutWindow = null;
        this.popoutWindowId = null;
        this.windowPort = null;
        
        // Remove the window close listener
        if (this.windowCloseListener) {
            chrome.windows.onRemoved.removeListener(this.windowCloseListener);
            this.windowCloseListener = null;
        }
    }
    
    async ensureContentScript(tabId) {
        try {
            // Test if content script is already available
            await chrome.tabs.sendMessage(tabId, { type: 'PING' });
            return true; // Content script is ready
        } catch (error) {
            // Content script not ready, inject it
            try {
                await chrome.scripting.executeScript({
                    target: { tabId },
                    files: ['content.js']
                });
                
                await chrome.scripting.insertCSS({
                    target: { tabId },
                    files: ['content.css']
                });
                
                // Wait a moment for script to initialize
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Test again to make sure it's working
                await chrome.tabs.sendMessage(tabId, { type: 'PING' });
                return true;
            } catch (injectionError) {
                console.error('Content script injection failed:', injectionError);
                throw new Error(`Cannot inject content script: ${injectionError.message}`);
            }
        }
    }
    
    async discoverElements(tabId) {
        await this.ensureContentScript(tabId);
        
        try {
            const response = await chrome.tabs.sendMessage(tabId, {
                type: 'DISCOVER_ELEMENTS'
            });
            
            if (response && this.windowPort) {
                this.notifyWindow('ELEMENTS_DISCOVERED', response);
            }
            
            return response || { elements: [], total: 0, categories: {} };
        } catch (error) {
            console.error('Discovery error:', error);
            return { elements: [], total: 0, categories: {}, error: error.message };
        }
    }
    
    async revealElement(tabId, elementId) {
        await this.ensureContentScript(tabId);
        
        try {
            const response = await chrome.tabs.sendMessage(tabId, {
                type: 'REVEAL_ELEMENT',
                elementId
            });
            
            if (this.windowPort) {
                this.notifyWindow('ELEMENT_REVEALED', { elementId, success: response.success });
            }
            
            return response;
        } catch (error) {
            console.error('Reveal error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async restoreElement(tabId, elementId) {
        await this.ensureContentScript(tabId);
        
        try {
            const response = await chrome.tabs.sendMessage(tabId, {
                type: 'RESTORE_ELEMENT',
                elementId
            });
            
            if (this.windowPort) {
                this.notifyWindow('ELEMENT_RESTORED', { elementId, success: response.success });
            }
            
            return response;
        } catch (error) {
            console.error('Restore error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async revealAll(tabId) {
        await this.ensureContentScript(tabId);
        
        try {
            const response = await chrome.tabs.sendMessage(tabId, {
                type: 'REVEAL_ALL'
            });
            
            if (this.windowPort) {
                this.notifyWindow('ALL_REVEALED', response);
            }
            
            return response;
        } catch (error) {
            console.error('Reveal all error:', error);
            return { total: 0, successful: 0, failed: 0, error: error.message };
        }
    }
    
    async restoreAll(tabId) {
        await this.ensureContentScript(tabId);
        
        try {
            const response = await chrome.tabs.sendMessage(tabId, {
                type: 'RESTORE_ALL'
            });
            
            if (this.windowPort) {
                this.notifyWindow('ALL_RESTORED', response);
            }
            
            return response;
        } catch (error) {
            console.error('Restore all error:', error);
            return { total: 0, restored: 0, error: error.message };
        }
    }
    
    async highlightElement(tabId, elementId) {
        await this.ensureContentScript(tabId);
        
        try {
            const response = await chrome.tabs.sendMessage(tabId, {
                type: 'HIGHLIGHT_ELEMENT',
                elementId
            });
            
            return response;
        } catch (error) {
            console.error('Highlight error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async unhighlightAll(tabId) {
        await this.ensureContentScript(tabId);
        
        try {
            const response = await chrome.tabs.sendMessage(tabId, {
                type: 'UNHIGHLIGHT_ALL'
            });
            
            return response;
        } catch (error) {
            console.error('Unhighlight error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async switchTabHook() {
        try {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab) {
                this.currentTabId = activeTab.id;
                await this.refreshHook(activeTab.id);
                return { success: true, tabId: activeTab.id };
            }
            return { success: false, error: 'No active tab found' };
        } catch (error) {
            console.error('Switch tab error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async refreshHook(tabId) {
        try {
            if (!tabId && this.currentTabId) {
                tabId = this.currentTabId;
            }
            
            if (tabId && this.windowPort) {
                this.notifyWindow('TAB_SWITCHED', { tabId });
                // Auto-discover elements after tab switch
                setTimeout(() => this.discoverElements(tabId), 500);
                return { success: true, tabId };
            }
            return { success: false, error: 'No tab ID or window connection' };
        } catch (error) {
            console.error('Refresh hook error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async getTabInfo(tabId) {
        try {
            if (!tabId) return { title: 'No tab specified', url: '', favIconUrl: '' };
            
            const tab = await chrome.tabs.get(tabId);
            return {
                title: tab.title || 'Unknown',
                url: tab.url || '',
                favIconUrl: tab.favIconUrl || ''
            };
        } catch (error) {
            console.error('Get tab info error:', error);
            return { title: 'Error loading tab', url: '', favIconUrl: '' };
        }
    }
    
    async handleTabSwitch(tabId) {
        const previousTabId = this.currentTabId;
        this.currentTabId = tabId;
        
        if (this.windowPort && tabId !== previousTabId) {
            this.notifyWindow('TAB_SWITCHED', { tabId });
        }
    }
    
    notifyWindow(type, data) {
        if (this.windowPort) {
            try {
                this.windowPort.postMessage({
                    type,
                    data
                });
            } catch (error) {
                console.error('Window notification failed:', error);
                // Port might be disconnected
                this.windowPort = null;
            }
        }
    }
    
    async notifyWindowOfTabUpdate(tabId) {
        if (this.windowPort && tabId === this.currentTabId) {
            this.notifyWindow('TAB_UPDATED', { tabId });
        }
    }
}

// Initialize the window manager
const zenManager = new ZenWindowManager();

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
    // Open popup instead of creating window directly
    chrome.action.openPopup();
});