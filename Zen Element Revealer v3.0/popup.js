// Zen Element Revealer - Popup Interface
class ZenPopup {
    constructor() {
        this.currentTab = null;
        this.discoveryResults = null;
        
        this.initializeElements();
        this.setupEventListeners();
        this.getCurrentTab();
    }
    
    initializeElements() {
        this.statusContainer = document.getElementById('statusContainer');
        this.resultsContainer = document.getElementById('resultsContainer');
        this.summaryContainer = document.getElementById('summaryContainer');
        this.quickScanBtn = document.getElementById('quickScanBtn');
        this.popOutBtn = document.getElementById('popOutBtn');
        this.revealAllBtn = document.getElementById('revealAllBtn');
        this.restoreAllBtn = document.getElementById('restoreAllBtn');
    }
    
    setupEventListeners() {
        this.quickScanBtn.addEventListener('click', () => this.performQuickScan());
        this.popOutBtn.addEventListener('click', () => this.popOutWindow());
        this.revealAllBtn.addEventListener('click', () => this.revealAll());
        this.restoreAllBtn.addEventListener('click', () => this.restoreAll());
    }
    
    async getCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            this.currentTab = tab;
            this.updateStatus('Ready to scan', '🔍');
        } catch (error) {
            this.updateStatus('Error: Could not access tab', '⚠️');
            console.error('Tab access error:', error);
        }
    }
    
    updateStatus(text, icon = '⏳') {
        const iconElement = this.statusContainer.querySelector('.zen-status-icon');
        const textElement = this.statusContainer.querySelector('.zen-status-text');
        
        if (iconElement) iconElement.textContent = icon;
        if (textElement) textElement.textContent = text;
    }
    
    async performQuickScan() {
        if (!this.currentTab) {
            this.updateStatus('Error: No active tab', '⚠️');
            return;
        }
        
        try {
            this.quickScanBtn.disabled = true;
            this.quickScanBtn.innerHTML = '<span class="zen-btn-icon">⏳</span>Scanning...';
            this.updateStatus('Discovering hidden elements...', '🔍');
            
            const response = await chrome.runtime.sendMessage({
                type: 'DISCOVER_ELEMENTS',
                tabId: this.currentTab.id
            });
            
            if (response && !response.error) {
                this.discoveryResults = response;
                if (response.elements && response.elements.length > 0) {
                    this.displayResults(response);
                    this.updateStatus(`Found ${response.total} hidden elements`, '✨');
                } else {
                    this.updateStatus('No hidden elements found', 'ℹ️');
                }
            } else {
                const errorMsg = response?.error || 'Unknown error occurred';
                this.updateStatus(`Scan failed: ${errorMsg}`, '⚠️');
            }
        } catch (error) {
            this.updateStatus('Scan failed: ' + error.message, '⚠️');
            console.error('Scan error:', error);
        } finally {
            this.quickScanBtn.disabled = false;
            this.quickScanBtn.innerHTML = '<span class="zen-btn-icon">🔍</span>Quick Scan';
        }
    }
    
    displayResults(results) {
        // Show results container
        this.resultsContainer.style.display = 'block';
        
        // Create summary
        const summary = this.createSummary(results);
        this.summaryContainer.innerHTML = summary;
        
        // Add animation
        this.resultsContainer.style.animation = 'zen-fade-in 0.3s ease-out';
    }
    
    createSummary(results) {
        const { categories, total } = results;
        
        let summaryHTML = `
            <div class="zen-summary-header">
                <h3>Discovery Summary</h3>
                <div class="zen-total-count">${total} elements</div>
            </div>
            <div class="zen-categories">
        `;
        
        const categoryIcons = {
            navigation: '🧭',
            forms: '📝',
            content: '📄',
            controls: '⚙️',
            modals: '🪟',
            other: '🔧'
        };
        
        Object.entries(categories).forEach(([category, count]) => {
            const icon = categoryIcons[category] || '🔧';
            summaryHTML += `
                <div class="zen-category-item">
                    <span class="zen-category-icon">${icon}</span>
                    <span class="zen-category-name">${category}</span>
                    <span class="zen-category-count">${count}</span>
                </div>
            `;
        });
        
        summaryHTML += '</div>';
        return summaryHTML;
    }
    
    async popOutWindow() {
        if (!this.currentTab) {
            this.updateStatus('Error: No active tab', '⚠️');
            return;
        }
        
        try {
            this.popOutBtn.disabled = true;
            this.popOutBtn.innerHTML = '<span class="zen-btn-icon">⏳</span>Opening...';
            
            const response = await chrome.runtime.sendMessage({
                type: 'CREATE_POPUP_WINDOW',
                tabId: this.currentTab.id
            });
            
            if (response && response.success) {
                // Close popup after creating window
                window.close();
            } else {
                const errorMsg = response?.error || 'Unknown error';
                this.updateStatus(`Window creation failed: ${errorMsg}`, '⚠️');
            }
        } catch (error) {
            this.updateStatus('Could not create window: ' + error.message, '⚠️');
            console.error('Popup window error:', error);
        } finally {
            this.popOutBtn.disabled = false;
            this.popOutBtn.innerHTML = '<span class="zen-btn-icon">🪟</span>Pop Out Window';
        }
    }
    
    async revealAll() {
        if (!this.currentTab || !this.discoveryResults) {
            this.updateStatus('Please scan first', '⚠️');
            return;
        }
        
        try {
            this.revealAllBtn.disabled = true;
            this.revealAllBtn.innerHTML = '<span class="zen-btn-icon">⏳</span>Revealing...';
            this.updateStatus('Revealing all elements...', '✨');
            
            const response = await chrome.runtime.sendMessage({
                type: 'REVEAL_ALL',
                tabId: this.currentTab.id
            });
            
            if (response && !response.error) {
                this.updateStatus(`Revealed ${response.successful || 0}/${response.total || 0} elements`, '✅');
            } else {
                const errorMsg = response?.error || 'Unknown error';
                this.updateStatus(`Reveal failed: ${errorMsg}`, '⚠️');
            }
        } catch (error) {
            this.updateStatus('Reveal failed: ' + error.message, '⚠️');
            console.error('Reveal error:', error);
        } finally {
            this.revealAllBtn.disabled = false;
            this.revealAllBtn.innerHTML = '<span class="zen-btn-icon">✨</span>Reveal All';
        }
    }
    
    async restoreAll() {
        if (!this.currentTab) {
            this.updateStatus('Error: No active tab', '⚠️');
            return;
        }
        
        try {
            this.restoreAllBtn.disabled = true;
            this.restoreAllBtn.innerHTML = '<span class="zen-btn-icon">⏳</span>Restoring...';
            this.updateStatus('Restoring original state...', '🔄');
            
            const response = await chrome.runtime.sendMessage({
                type: 'RESTORE_ALL',
                tabId: this.currentTab.id
            });
            
            if (response && !response.error) {
                this.updateStatus(`Restored ${response.restored || 0} elements`, '✅');
                
                // Hide results if everything was restored
                if (response.restored > 0) {
                    setTimeout(() => {
                        this.resultsContainer.style.display = 'none';
                        this.discoveryResults = null;
                    }, 1500);
                }
            } else {
                const errorMsg = response?.error || 'Unknown error';
                this.updateStatus(`Restore failed: ${errorMsg}`, '⚠️');
            }
        } catch (error) {
            this.updateStatus('Restore failed: ' + error.message, '⚠️');
            console.error('Restore error:', error);
        } finally {
            this.restoreAllBtn.disabled = false;
            this.restoreAllBtn.innerHTML = '<span class="zen-btn-icon">🔄</span>Restore All';
        }
    }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ZenPopup();
});