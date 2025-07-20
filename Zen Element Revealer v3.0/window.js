// Zen Element Revealer - Window Interface
class ZenWindow {
    constructor() {
        this.currentTabId = null;
        this.discoveryResults = null;
        this.revealedElements = new Set();
        this.activeFilters = new Set(['all']);
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupMessageListener();
        this.initializeTab();
    }
    
    initializeElements() {
        // Header elements
        this.tabInfo = document.getElementById('tabInfo');
        this.tabFavicon = document.getElementById('tabFavicon');
        this.tabTitle = document.getElementById('tabTitle');
        this.tabUrl = document.getElementById('tabUrl');
        this.tabStatus = document.getElementById('tabStatus');
        this.refreshHookBtn = document.getElementById('refreshHookBtn');
        this.switchTabBtn = document.getElementById('switchTabBtn');
        
        // Discovery elements
        this.discoverBtn = document.getElementById('discoverBtn');
        this.discoveryStatus = document.getElementById('discoveryStatus');
        
        // Results elements
        this.resultsSection = document.getElementById('resultsSection');
        this.summaryStats = document.getElementById('summaryStats');
        this.categoryFilters = document.getElementById('categoryFilters');
        this.elementsList = document.getElementById('elementsList');
        this.revealAllBtn = document.getElementById('revealAllBtn');
        this.restoreAllBtn = document.getElementById('restoreAllBtn');
        
        // Footer elements
        this.footerStats = document.getElementById('footerStats');
    }
    
    setupEventListeners() {
        this.discoverBtn.addEventListener('click', () => this.discoverElements());
        this.refreshHookBtn.addEventListener('click', () => this.refreshHook());
        this.switchTabBtn.addEventListener('click', () => this.switchTab());
        this.revealAllBtn.addEventListener('click', () => this.revealAll());
        this.restoreAllBtn.addEventListener('click', () => this.restoreAll());
    }
    
    setupMessageListener() {
        try {
            // Connect to background script using port
            this.backgroundPort = chrome.runtime.connect({ name: 'zen-window' });
            
            // Listen for messages from background
            this.backgroundPort.onMessage.addListener((message) => {
                this.handleMessage(message);
            });
            
            // Handle port disconnection
            this.backgroundPort.onDisconnect.addListener(() => {
                console.log('Background port disconnected');
                this.backgroundPort = null;
                this.updateConnectionStatus(false);
                this.updateStatus('Connection lost - refresh to reconnect', '⚠️');
            });
            
            console.log('Window port connected successfully');
        } catch (error) {
            console.error('Failed to connect to background:', error);
            this.updateConnectionStatus(false);
            this.updateStatus('Failed to connect to background', '⚠️');
        }
    }
    
    handleMessage(message) {
        try {
            switch (message.type) {
                case 'TAB_SWITCHED':
                    this.handleTabSwitch(message.data.tabId);
                    break;
                    
                case 'ELEMENTS_DISCOVERED':
                    this.handleElementsDiscovered(message.data);
                    break;
                    
                case 'ELEMENT_REVEALED':
                    this.handleElementRevealed(message.data);
                    break;
                    
                case 'ELEMENT_RESTORED':
                    this.handleElementRestored(message.data);
                    break;
                    
                case 'ALL_REVEALED':
                    this.handleAllRevealed(message.data);
                    break;
                    
                case 'ALL_RESTORED':
                    this.handleAllRestored(message.data);
                    break;
                    
                case 'TAB_UPDATED':
                    this.handleTabUpdate(message.data);
                    break;
                    
                default:
                    console.warn('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    }
    
    async initializeTab() {
        try {
            // Get the current active tab
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab) {
                this.currentTabId = activeTab.id;
                await this.updateTabInfo(activeTab);
                this.updateConnectionStatus(true);
                this.updateStatus('Connected to tab', '✅');
                
                // Notify background of our current tab
                if (this.backgroundPort) {
                    chrome.runtime.sendMessage({
                        type: 'REFRESH_HOOK',
                        tabId: this.currentTabId
                    });
                }
            } else {
                this.updateStatus('No active tab found', '⚠️');
                this.updateConnectionStatus(false);
            }
        } catch (error) {
            console.error('Tab initialization error:', error);
            this.updateStatus('Could not connect to tab', '⚠️');
            this.updateConnectionStatus(false);
        }
    }
    
    async updateTabInfo(tab) {
        this.tabTitle.textContent = tab.title || 'Unknown Page';
        this.tabUrl.textContent = this.formatUrl(tab.url || '');
        
        if (tab.favIconUrl) {
            this.tabFavicon.innerHTML = `<img src="${tab.favIconUrl}" alt="favicon" width="16" height="16">`;
        } else {
            this.tabFavicon.textContent = '🌐';
        }
        
        this.updateConnectionStatus(true);
    }
    
    formatUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname + urlObj.pathname;
        } catch {
            return url.substring(0, 50) + (url.length > 50 ? '...' : '');
        }
    }
    
    updateConnectionStatus(connected) {
        const statusDot = this.tabStatus.querySelector('.zen-status-dot');
        const statusText = this.tabStatus.querySelector('span');
        
        if (connected) {
            statusDot.className = 'zen-status-dot zen-status-connected';
            statusText.textContent = 'Connected';
        } else {
            statusDot.className = 'zen-status-dot zen-status-disconnected';
            statusText.textContent = 'Disconnected';
        }
    }
    
    updateStatus(text, icon = '⏳') {
        const statusIcon = this.discoveryStatus.querySelector('.zen-status-icon');
        const statusText = this.discoveryStatus.querySelector('.zen-status-text');
        
        if (statusIcon) statusIcon.textContent = icon;
        if (statusText) statusText.textContent = text;
    }
    
    async discoverElements() {
        if (!this.currentTabId) {
            this.updateStatus('No tab connected', '⚠️');
            return;
        }
        
        try {
            this.discoverBtn.disabled = true;
            this.discoverBtn.innerHTML = '<span class="zen-btn-icon">⏳</span>Discovering...';
            this.updateStatus('Scanning for hidden elements...', '🔍');
            
            await chrome.runtime.sendMessage({
                type: 'DISCOVER_ELEMENTS',
                tabId: this.currentTabId
            });
            
        } catch (error) {
            this.updateStatus('Discovery failed', '⚠️');
            console.error('Discovery error:', error);
            this.resetDiscoverButton();
        }
    }
    
    resetDiscoverButton() {
        this.discoverBtn.disabled = false;
        this.discoverBtn.innerHTML = '<span class="zen-btn-icon">🔍</span>Discover Elements';
    }
    
    handleElementsDiscovered(results) {
        this.discoveryResults = results;
        this.revealedElements.clear();
        
        if (results.elements && results.elements.length > 0) {
            this.displayResults(results);
            this.updateStatus(`Found ${results.total} hidden elements`, '✨');
        } else {
            this.updateStatus('No hidden elements found on this page', 'ℹ️');
            this.resultsSection.style.display = 'none';
        }
        
        this.resetDiscoverButton();
        this.updateFooterStats();
    }
    
    displayResults(results) {
        this.resultsSection.style.display = 'block';
        
        this.createSummaryStats(results);
        this.createCategoryFilters(results);
        this.createElementsList(results);
        
        // Animate appearance
        this.resultsSection.style.animation = 'zen-slide-up 0.4s ease-out';
    }
    
    createSummaryStats(results) {
        const { total, categories } = results;
        
        const totalCategories = Object.keys(categories).length;
        const mostCommon = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
        
        this.summaryStats.innerHTML = `
            <div class="zen-stat-card">
                <div class="zen-stat-number">${total}</div>
                <div class="zen-stat-label">Hidden Elements</div>
            </div>
            <div class="zen-stat-card">
                <div class="zen-stat-number">${totalCategories}</div>
                <div class="zen-stat-label">Categories</div>
            </div>
            <div class="zen-stat-card">
                <div class="zen-stat-number">${mostCommon ? mostCommon[1] : 0}</div>
                <div class="zen-stat-label">${mostCommon ? mostCommon[0] : 'None'}</div>
            </div>
        `;
    }
    
    createCategoryFilters(results) {
        const { categories } = results;
        
        const categoryIcons = {
            navigation: '🧭',
            forms: '📝',
            content: '📄',
            controls: '⚙️',
            modals: '🪟',
            other: '🔧'
        };
        
        let filtersHTML = `
            <button class="zen-filter-btn zen-filter-active" data-category="all">
                <span class="zen-filter-icon">🔍</span>
                All (${results.total})
            </button>
        `;
        
        Object.entries(categories).forEach(([category, count]) => {
            const icon = categoryIcons[category] || '🔧';
            filtersHTML += `
                <button class="zen-filter-btn" data-category="${category}">
                    <span class="zen-filter-icon">${icon}</span>
                    ${category} (${count})
                </button>
            `;
        });
        
        this.categoryFilters.innerHTML = filtersHTML;
        
        // Add filter event listeners
        this.categoryFilters.querySelectorAll('.zen-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleFilterClick(e.target.closest('.zen-filter-btn')));
        });
    }
    
    handleFilterClick(button) {
        const category = button.getAttribute('data-category');
        
        // Update active filter
        this.categoryFilters.querySelectorAll('.zen-filter-btn').forEach(btn => {
            btn.classList.remove('zen-filter-active');
        });
        button.classList.add('zen-filter-active');
        
        // Update active filters
        this.activeFilters.clear();
        this.activeFilters.add(category);
        
        // Filter elements list
        this.filterElementsList();
    }
    
    createElementsList(results) {
        const { elements } = results;
        
        let listHTML = '';
        elements.forEach(element => {
            listHTML += this.createElementCard(element);
        });
        
        this.elementsList.innerHTML = listHTML;
        
        // Add element event listeners
        this.setupElementListeners();
    }
    
    createElementCard(element) {
        const { id, category, preview, hidingMethod, interactivity } = element;
        
        const categoryIcons = {
            navigation: '🧭',
            forms: '📝',
            content: '📄',
            controls: '⚙️',
            modals: '🪟',
            other: '🔧'
        };
        
        const icon = categoryIcons[category] || '🔧';
        const isRevealed = this.revealedElements.has(id);
        
        const interactiveCount = interactivity.buttons + interactivity.inputs + 
                               interactivity.links + interactivity.clickable;
        
        return `
            <div class="zen-element-card" data-category="${category}" data-element-id="${id}">
                <div class="zen-element-header">
                    <div class="zen-element-icon">${icon}</div>
                    <div class="zen-element-info">
                        <div class="zen-element-category">${category}</div>
                        <div class="zen-element-preview">${preview}</div>
                    </div>
                    <div class="zen-element-status">
                        ${isRevealed ? '<span class="zen-status-revealed">✨ Revealed</span>' : '<span class="zen-status-hidden">👁️ Hidden</span>'}
                    </div>
                </div>
                
                <div class="zen-element-details">
                    <div class="zen-element-meta">
                        <span class="zen-meta-item">
                            <strong>Hiding:</strong> ${hidingMethod}
                        </span>
                        <span class="zen-meta-item">
                            <strong>Interactive:</strong> ${interactiveCount} elements
                        </span>
                    </div>
                </div>
                
                <div class="zen-element-actions">
                    <button class="zen-btn zen-btn-sm zen-btn-secondary" data-action="highlight">
                        <span class="zen-btn-icon">🎯</span>
                        Highlight
                    </button>
                    <button class="zen-btn zen-btn-sm ${isRevealed ? 'zen-btn-warning' : 'zen-btn-primary'}" data-action="${isRevealed ? 'restore' : 'reveal'}">
                        <span class="zen-btn-icon">${isRevealed ? '🔄' : '✨'}</span>
                        ${isRevealed ? 'Restore' : 'Reveal'}
                    </button>
                </div>
            </div>
        `;
    }
    
    setupElementListeners() {
        this.elementsList.querySelectorAll('.zen-element-card').forEach(card => {
            const elementId = card.getAttribute('data-element-id');
            
            // Highlight button
            const highlightBtn = card.querySelector('[data-action="highlight"]');
            highlightBtn?.addEventListener('click', () => this.highlightElement(elementId));
            
            // Reveal/Restore button
            const actionBtn = card.querySelector('[data-action="reveal"], [data-action="restore"]');
            actionBtn?.addEventListener('click', (e) => {
                const action = e.target.closest('button').getAttribute('data-action');
                if (action === 'reveal') {
                    this.revealElement(elementId);
                } else if (action === 'restore') {
                    this.restoreElement(elementId);
                }
            });
        });
    }
    
    filterElementsList() {
        const cards = this.elementsList.querySelectorAll('.zen-element-card');
        
        cards.forEach(card => {
            const category = card.getAttribute('data-category');
            
            if (this.activeFilters.has('all') || this.activeFilters.has(category)) {
                card.style.display = 'block';
                card.style.animation = 'zen-fade-in 0.3s ease-out';
            } else {
                card.style.display = 'none';
            }
        });
    }
    
    async highlightElement(elementId) {
        try {
            await chrome.runtime.sendMessage({
                type: 'HIGHLIGHT_ELEMENT',
                tabId: this.currentTabId,
                elementId
            });
        } catch (error) {
            console.error('Highlight error:', error);
        }
    }
    
    async revealElement(elementId) {
        try {
            await chrome.runtime.sendMessage({
                type: 'REVEAL_ELEMENT',
                tabId: this.currentTabId,
                elementId
            });
        } catch (error) {
            console.error('Reveal error:', error);
        }
    }
    
    async restoreElement(elementId) {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'RESTORE_ELEMENT',
                tabId: this.currentTabId,
                elementId
            });
            
            if (response && response.success) {
                this.revealedElements.delete(elementId);
                this.updateElementCard(elementId, false);
                this.updateFooterStats();
            }
            
            return response;
        } catch (error) {
            console.error('Restore element error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async revealAll() {
        if (!this.currentTabId || !this.discoveryResults) {
            return;
        }
        
        try {
            this.revealAllBtn.disabled = true;
            this.revealAllBtn.innerHTML = '<span class="zen-btn-icon">⏳</span>Revealing...';
            
            await chrome.runtime.sendMessage({
                type: 'REVEAL_ALL',
                tabId: this.currentTabId
            });
            
        } catch (error) {
            console.error('Reveal all error:', error);
            this.resetRevealAllButton();
        }
    }
    
    async restoreAll() {
        if (!this.currentTabId) {
            return;
        }
        
        try {
            this.restoreAllBtn.disabled = true;
            this.restoreAllBtn.innerHTML = '<span class="zen-btn-icon">⏳</span>Restoring...';
            
            await chrome.runtime.sendMessage({
                type: 'RESTORE_ALL',
                tabId: this.currentTabId
            });
            
        } catch (error) {
            console.error('Restore all error:', error);
            this.resetRestoreAllButton();
        }
    }
    
    resetRevealAllButton() {
        this.revealAllBtn.disabled = false;
        this.revealAllBtn.innerHTML = '<span class="zen-btn-icon">✨</span>Reveal All';
    }
    
    resetRestoreAllButton() {
        this.restoreAllBtn.disabled = false;
        this.restoreAllBtn.innerHTML = '<span class="zen-btn-icon">🔄</span>Restore All';
    }
    
    handleElementRevealed(data) {
        const { elementId, success } = data;
        
        if (success) {
            this.revealedElements.add(elementId);
            this.updateElementCard(elementId, true);
            this.updateFooterStats();
        }
    }
    
    handleElementRestored(data) {
        const { elementId, success } = data;
        
        if (success) {
            this.revealedElements.delete(elementId);
            this.updateElementCard(elementId, false);
            this.updateFooterStats();
        }
    }
    
    handleTabUpdate(data) {
        // Handle tab updates (reload, navigation, etc.)
        const { tabId } = data;
        if (tabId === this.currentTabId) {
            // Clear current results as page might have changed
            this.discoveryResults = null;
            this.revealedElements.clear();
            this.resultsSection.style.display = 'none';
            this.updateStatus('Page updated - scan again to discover elements', 'ℹ️');
            this.updateFooterStats();
        }
    }
    
    handleAllRevealed(data) {
        const { successful, total } = data;
        
        if (this.discoveryResults) {
            this.discoveryResults.elements.forEach(element => {
                this.revealedElements.add(element.id);
                this.updateElementCard(element.id, true);
            });
        }
        
        this.updateStatus(`Revealed ${successful}/${total} elements`, '✅');
        this.updateFooterStats();
        this.resetRevealAllButton();
    }
    
    handleAllRestored(data) {
        const { restored } = data;
        
        this.revealedElements.clear();
        
        if (this.discoveryResults) {
            this.discoveryResults.elements.forEach(element => {
                this.updateElementCard(element.id, false);
            });
        }
        
        this.updateStatus(`Restored ${restored} elements`, '✅');
        this.updateFooterStats();
        this.resetRestoreAllButton();
    }
    
    updateElementCard(elementId, isRevealed) {
        const card = this.elementsList.querySelector(`[data-element-id="${elementId}"]`);
        if (!card) return;
        
        const statusElement = card.querySelector('.zen-element-status');
        const actionButton = card.querySelector('[data-action]');
        
        if (isRevealed) {
            statusElement.innerHTML = '<span class="zen-status-revealed">✨ Revealed</span>';
            actionButton.className = 'zen-btn zen-btn-sm zen-btn-warning';
            actionButton.setAttribute('data-action', 'restore');
            actionButton.innerHTML = '<span class="zen-btn-icon">🔄</span>Restore';
        } else {
            statusElement.innerHTML = '<span class="zen-status-hidden">👁️ Hidden</span>';
            actionButton.className = 'zen-btn zen-btn-sm zen-btn-primary';
            actionButton.setAttribute('data-action', 'reveal');
            actionButton.innerHTML = '<span class="zen-btn-icon">✨</span>Reveal';
        }
    }
    
    updateFooterStats() {
        const discovered = this.discoveryResults ? this.discoveryResults.total : 0;
        const revealed = this.revealedElements.size;
        
        this.footerStats.textContent = `Ready • ${discovered} discovered • ${revealed} revealed`;
    }
    
    async refreshHook() {
        try {
            this.refreshHookBtn.disabled = true;
            this.updateStatus('Refreshing connection...', '🔄');
            
            await chrome.runtime.sendMessage({
                type: 'REFRESH_HOOK',
                tabId: this.currentTabId
            });
            
            this.updateStatus('Connection refreshed', '✅');
            
        } catch (error) {
            this.updateStatus('Refresh failed', '⚠️');
            console.error('Refresh error:', error);
        } finally {
            this.refreshHookBtn.disabled = false;
        }
    }
    
    async switchTab() {
        try {
            await chrome.runtime.sendMessage({
                type: 'SWITCH_TAB_HOOK'
            });
            
            this.updateStatus('Switched to active tab', '✅');
            
        } catch (error) {
            this.updateStatus('Switch failed', '⚠️');
            console.error('Switch error:', error);
        }
    }
    
    handleTabSwitch(tabId) {
        try {
            const previousTabId = this.currentTabId;
            this.currentTabId = tabId;
            this.discoveryResults = null;
            this.revealedElements.clear();
            
            // Clear results UI
            this.resultsSection.style.display = 'none';
            this.updateStatus('Switched to new tab', '✅');
            this.updateFooterStats();
            
            // Update tab info
            if (tabId && tabId !== previousTabId) {
                chrome.tabs.get(tabId).then(tab => {
                    this.updateTabInfo(tab);
                    this.updateConnectionStatus(true);
                }).catch(error => {
                    console.error('Error getting tab info:', error);
                    this.tabTitle.textContent = 'Unknown Page';
                    this.tabUrl.textContent = 'Could not access tab info';
                    this.updateConnectionStatus(false);
                });
            }
        } catch (error) {
            console.error('Error handling tab switch:', error);
            this.updateStatus('Error switching tabs', '⚠️');
        }
    }
}

// Initialize window when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ZenWindow();
});