// Zen Element Revealer - Content Script
class ZenElementRevealer {
    constructor() {
        this.discoveredElements = [];
        this.revealedElements = new Map();
        this.originalStates = new Map();
        this.elementIdCounter = 0;
        
        this.setupMessageHandler();
        this.injectStyles();
    }
    
    setupMessageHandler() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep channel open for async responses
        });
    }
    
    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'PING':
                    sendResponse({ status: 'ready' });
                    break;
                    
                case 'DISCOVER_ELEMENTS':
                    const discovery = await this.discoverHiddenElements();
                    sendResponse(discovery);
                    break;
                    
                case 'REVEAL_ELEMENT':
                    const revealResult = await this.revealElement(message.elementId);
                    sendResponse(revealResult);
                    break;
                    
                case 'RESTORE_ELEMENT':
                    const restoreResult = this.restoreElement(message.elementId);
                    sendResponse(restoreResult);
                    break;
                    
                case 'REVEAL_ALL':
                    const revealAllResult = await this.revealAll();
                    sendResponse(revealAllResult);
                    break;
                    
                case 'RESTORE_ALL':
                    const restoreAllResult = await this.restoreAll();
                    sendResponse(restoreAllResult);
                    break;
                    
                case 'HIGHLIGHT_ELEMENT':
                    this.highlightElement(message.elementId);
                    sendResponse({ success: true });
                    break;
                    
                case 'UNHIGHLIGHT_ALL':
                    this.unhighlightAll();
                    sendResponse({ success: true });
                    break;
                    
                default:
                    sendResponse({ error: 'Unknown message type: ' + message.type });
            }
        } catch (error) {
            console.error('Content script error:', error);
            sendResponse({ error: error.message, success: false });
        }
    }
    
    async discoverHiddenElements() {
        this.discoveredElements = [];
        this.elementIdCounter = 0;
        
        const hiddenElements = this.findHiddenElements();
        const meaningfulElements = this.filterMeaningfulElements(hiddenElements);
        const categorizedElements = this.categorizeElements(meaningfulElements);
        
        return {
            elements: categorizedElements,
            total: categorizedElements.length,
            categories: this.getCategorySummary(categorizedElements)
        };
    }
    
    findHiddenElements() {
        const hidden = [];
        
        try {
            // Use querySelectorAll more efficiently and safely
            const allElements = Array.from(document.querySelectorAll('*'));
            
            for (const element of allElements) {
                try {
                    if (this.isElementHidden(element) && this.isElementMeaningful(element)) {
                        hidden.push(element);
                    }
                } catch (elementError) {
                    // Skip elements that cause errors (might be detached from DOM)
                    console.warn('Error checking element:', elementError);
                    continue;
                }
            }
        } catch (error) {
            console.error('Error finding hidden elements:', error);
        }
        
        return hidden;
    }
    
    isElementHidden(element) {
        try {
            // Skip if element is not in document
            if (!element || !element.isConnected) return false;
            
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            
            // Check CSS hiding methods
            if (style.display === 'none') return true;
            if (style.visibility === 'hidden') return true;
            if (parseFloat(style.opacity) === 0) return true;
            
            // Check positioning hiding
            if (rect.width === 0 && rect.height === 0) return true;
            if (style.position === 'absolute') {
                const left = parseInt(style.left);
                const top = parseInt(style.top);
                if (left < -9000 || top < -9000) return true;
            }
            
            // Check if element is outside viewport intentionally
            if (rect.left < -window.innerWidth || rect.top < -window.innerHeight) return true;
            
            // Check clip-path hiding
            if (style.clipPath && (
                style.clipPath.includes('inset(100%)') || 
                style.clipPath.includes('polygon(0 0, 0 0, 0 0)')
            )) return true;
            
            // Check transform hiding
            if (style.transform && (
                style.transform.includes('scale(0)') ||
                style.transform.includes('scaleX(0)') ||
                style.transform.includes('scaleY(0)')
            )) return true;
            
            // Check height/width hiding with overflow
            if (style.overflow === 'hidden') {
                if (parseFloat(style.height) === 0 || parseFloat(style.width) === 0) return true;
            }
            
            return false;
        } catch (error) {
            console.warn('Error checking if element is hidden:', error);
            return false;
        }
    }
    
    isElementMeaningful(element) {
        try {
            if (!element || !element.tagName) return false;
            
            // Skip certain element types
            const skipTags = ['script', 'style', 'meta', 'link', 'title', 'head', 'noscript'];
            if (skipTags.includes(element.tagName.toLowerCase())) return false;
            
            // Skip tracking and analytics
            const className = element.className || '';
            const id = element.id || '';
            if (className.match(/track|analytic|pixel|beacon|gtm|ga-/i) || 
                id.match(/track|analytic|pixel|beacon|gtm|ga-/i)) return false;
            
            // Skip very small elements unless they have interactive content
            const rect = element.getBoundingClientRect();
            const hasInteractive = element.querySelectorAll('button, input, select, textarea, a, [onclick], [data-toggle], [role="button"]').length > 0;
            
            if (rect.width < 5 && rect.height < 5 && !hasInteractive) return false;
            
            // Must have some content or interactive elements
            const textContent = element.textContent?.trim() || '';
            const hasText = textContent.length > 0;
            const hasImages = element.querySelectorAll('img, svg, canvas').length > 0;
            const hasStructure = element.children.length > 0;
            const hasFormElements = element.querySelectorAll('input, select, textarea, button').length > 0;
            
            return hasText || hasInteractive || hasImages || hasStructure || hasFormElements;
        } catch (error) {
            console.warn('Error checking if element is meaningful:', error);
            return false;
        }
    }
    
    filterMeaningfulElements(elements) {
        return elements.filter(element => {
            // Skip tiny elements
            const rect = element.getBoundingClientRect();
            if (rect.width < 10 && rect.height < 10) return false;
            
            // Skip empty elements
            const textContent = element.textContent.trim();
            if (textContent.length === 0 && element.children.length === 0) return false;
            
            // Skip duplicate content (child of already discovered element)
            const hasDiscoveredParent = elements.some(other => 
                other !== element && other.contains(element)
            );
            if (hasDiscoveredParent) return false;
            
            return true;
        });
    }
    
    categorizeElements(elements) {
        return elements.map(element => {
            const id = `zen-element-${this.elementIdCounter++}`;
            const category = this.determineCategory(element);
            const preview = this.generatePreview(element);
            
            const elementData = {
                id,
                element,
                category,
                preview,
                selector: this.generateSelector(element),
                hidingMethod: this.analyzeHidingMethod(element),
                size: this.getElementSize(element),
                interactivity: this.assessInteractivity(element)
            };
            
            this.discoveredElements.push(elementData);
            return elementData;
        });
    }
    
    determineCategory(element) {
        const text = element.textContent.toLowerCase();
        const classes = element.className.toLowerCase();
        const tagName = element.tagName.toLowerCase();
        
        // Navigation patterns
        if (classes.includes('nav') || classes.includes('menu') || 
            text.includes('navigation') || text.includes('menu')) {
            return 'navigation';
        }
        
        // Form patterns
        if (tagName === 'form' || element.querySelector('input, select, textarea') ||
            classes.includes('form') || text.includes('search')) {
            return 'forms';
        }
        
        // Content patterns
        if (classes.includes('content') || classes.includes('article') ||
            tagName === 'article' || tagName === 'section') {
            return 'content';
        }
        
        // Control patterns
        if (element.querySelector('button') || classes.includes('controls') ||
            classes.includes('settings') || text.includes('settings')) {
            return 'controls';
        }
        
        // Modal patterns
        if (classes.includes('modal') || classes.includes('popup') ||
            classes.includes('overlay') || classes.includes('dialog')) {
            return 'modals';
        }
        
        return 'other';
    }
    
    generatePreview(element) {
        let preview = element.textContent.trim();
        if (preview.length > 100) {
            preview = preview.substring(0, 97) + '...';
        }
        
        if (!preview) {
            const interactive = element.querySelectorAll('button, input, a').length;
            const images = element.querySelectorAll('img, svg').length;
            
            if (interactive > 0 && images > 0) {
                preview = `${interactive} interactive elements, ${images} images`;
            } else if (interactive > 0) {
                preview = `${interactive} interactive elements`;
            } else if (images > 0) {
                preview = `${images} images`;
            } else {
                preview = element.tagName + ' element';
            }
        }
        
        return preview;
    }
    
    generateSelector(element) {
        if (element.id) return `#${element.id}`;
        if (element.className) return `.${element.className.split(' ')[0]}`;
        return element.tagName.toLowerCase();
    }
    
    analyzeHidingMethod(element) {
        const style = window.getComputedStyle(element);
        const methods = [];
        
        if (style.display === 'none') methods.push('display:none');
        if (style.visibility === 'hidden') methods.push('visibility:hidden');
        if (style.opacity === '0') methods.push('opacity:0');
        if (style.position === 'absolute' && parseInt(style.left) < -9000) methods.push('position:absolute');
        if (style.height === '0px') methods.push('height:0');
        if (style.clipPath) methods.push('clip-path');
        
        return methods.join(', ') || 'unknown';
    }
    
    getElementSize(element) {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    }
    
    assessInteractivity(element) {
        const buttons = element.querySelectorAll('button').length;
        const inputs = element.querySelectorAll('input, select, textarea').length;
        const links = element.querySelectorAll('a').length;
        const clickable = element.querySelectorAll('[onclick], [data-toggle]').length;
        
        return { buttons, inputs, links, clickable };
    }
    
    getCategorySummary(elements) {
        const summary = {};
        elements.forEach(el => {
            summary[el.category] = (summary[el.category] || 0) + 1;
        });
        return summary;
    }
    
    async revealElement(elementId) {
        const elementData = this.discoveredElements.find(el => el.id === elementId);
        if (!elementData) {
            return { success: false, error: 'Element not found' };
        }
        
        const { element } = elementData;
        
        // Save original state
        this.saveOriginalState(elementId, element);
        
        // Try multiple reveal strategies
        const success = this.applyRevealStrategies(element);
        
        if (success) {
            this.revealedElements.set(elementId, elementData);
            this.addRevealIndicator(element, elementId);
            
            // Smooth reveal animation
            element.style.transition = 'all 0.3s ease-in-out';
        }
        
        return { success, element: elementData };
    }
    
    applyRevealStrategies(element) {
        try {
            // Save current state for potential rollback
            const originalStyle = element.style.cssText;
            const originalClasses = Array.from(element.classList);
            
            // Strategy 1: CSS overrides (most reliable)
            if (this.revealWithCSS(element)) {
                // Verify the element is actually visible now
                if (this.isElementVisibleAfterReveal(element)) {
                    return true;
                }
            }
            
            // Rollback and try strategy 2
            element.style.cssText = originalStyle;
            element.className = originalClasses.join(' ');
            
            // Strategy 2: Class manipulation
            if (this.revealWithClasses(element)) {
                if (this.isElementVisibleAfterReveal(element)) {
                    return true;
                }
            }
            
            // Rollback and try strategy 3
            element.style.cssText = originalStyle;
            element.className = originalClasses.join(' ');
            
            // Strategy 3: Parent chain reveal
            if (this.revealParentChain(element)) {
                if (this.isElementVisibleAfterReveal(element)) {
                    return true;
                }
            }
            
            // Rollback and try strategy 4
            element.style.cssText = originalStyle;
            element.className = originalClasses.join(' ');
            
            // Strategy 4: Event triggers (as last resort)
            if (this.revealWithEvents(element)) {
                if (this.isElementVisibleAfterReveal(element)) {
                    return true;
                }
            }
            
            // If nothing worked, rollback completely
            element.style.cssText = originalStyle;
            element.className = originalClasses.join(' ');
            return false;
            
        } catch (error) {
            console.error('Error applying reveal strategies:', error);
            return false;
        }
    }
    
    isElementVisibleAfterReveal(element) {
        try {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            
            // Check if element is now visible
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   parseFloat(style.opacity) > 0 &&
                   (rect.width > 0 || rect.height > 0);
        } catch (error) {
            return false;
        }
    }
    
    revealWithCSS(element) {
        try {
            const style = window.getComputedStyle(element);
            let changed = false;
            
            if (style.display === 'none') {
                // Try to determine appropriate display value
                const tagName = element.tagName.toLowerCase();
                const blockElements = ['div', 'p', 'section', 'article', 'header', 'footer', 'nav', 'aside'];
                const inlineElements = ['span', 'a', 'strong', 'em', 'code'];
                
                if (blockElements.includes(tagName)) {
                    element.style.display = 'block';
                } else if (inlineElements.includes(tagName)) {
                    element.style.display = 'inline';
                } else {
                    element.style.display = 'block'; // Default fallback
                }
                changed = true;
            }
            
            if (style.visibility === 'hidden') {
                element.style.visibility = 'visible';
                changed = true;
            }
            
            if (parseFloat(style.opacity) === 0) {
                element.style.opacity = '1';
                changed = true;
            }
            
            if (parseFloat(style.height) === 0 && style.overflow === 'hidden') {
                element.style.height = 'auto';
                changed = true;
            }
            
            if (parseFloat(style.width) === 0 && style.overflow === 'hidden') {
                element.style.width = 'auto';
                changed = true;
            }
            
            if (style.position === 'absolute') {
                const left = parseInt(style.left);
                const top = parseInt(style.top);
                if (left < -9000 || top < -9000) {
                    element.style.position = 'static';
                    element.style.left = 'auto';
                    element.style.top = 'auto';
                    changed = true;
                }
            }
            
            // Handle clip-path
            if (style.clipPath && style.clipPath !== 'none') {
                element.style.clipPath = 'none';
                changed = true;
            }
            
            // Handle transforms
            if (style.transform && style.transform !== 'none') {
                if (style.transform.includes('scale(0)') || 
                    style.transform.includes('scaleX(0)') || 
                    style.transform.includes('scaleY(0)')) {
                    element.style.transform = 'none';
                    changed = true;
                }
            }
            
            return changed;
        } catch (error) {
            console.error('CSS reveal failed:', error);
            return false;
        }
    }
    
    revealWithClasses(element) {
        try {
            let changed = false;
            const originalClasses = Array.from(element.classList);
            
            // Common hiding classes to remove
            const hidingClasses = [
                'hidden', 'hide', 'invisible', 'collapsed', 'd-none', 'sr-only',
                'visually-hidden', 'screen-reader-only', 'opacity-0', 'scale-0'
            ];
            
            hidingClasses.forEach(cls => {
                if (element.classList.contains(cls)) {
                    element.classList.remove(cls);
                    changed = true;
                }
            });
            
            // Common showing classes to add (only if they exist in the document)
            const showingClasses = ['show', 'visible', 'expanded', 'd-block', 'd-inline-block'];
            showingClasses.forEach(cls => {
                // Only add class if it's used elsewhere on the page (indicates it's a valid class)
                if (document.querySelector(`.${cls}`) && !element.classList.contains(cls)) {
                    element.classList.add(cls);
                    changed = true;
                }
            });
            
            return changed;
        } catch (error) {
            console.error('Class reveal failed:', error);
            return false;
        }
    }
    
    revealWithEvents(element) {
        try {
            let triggered = false;
            
            // Try triggering common reveal events
            const events = ['mouseenter', 'mouseover', 'focus'];
            events.forEach(eventType => {
                try {
                    const event = new Event(eventType, { bubbles: true, cancelable: true });
                    element.dispatchEvent(event);
                    triggered = true;
                } catch (eventError) {
                    // Continue with other events
                }
            });
            
            // Try clicking parent triggers (data-toggle, data-target, etc.)
            try {
                const triggers = document.querySelectorAll('[data-toggle], [data-target], [aria-controls]');
                triggers.forEach(trigger => {
                    const target = trigger.getAttribute('data-target') || 
                                  trigger.getAttribute('data-toggle') ||
                                  trigger.getAttribute('aria-controls');
                    
                    if (target && (element.matches(target) || element.closest(target) || element.id === target.replace('#', ''))) {
                        trigger.click();
                        triggered = true;
                    }
                });
            } catch (triggerError) {
                // Continue even if trigger clicking fails
            }
            
            return triggered;
        } catch (error) {
            console.error('Event reveal failed:', error);
            return false;
        }
    }
    
    revealParentChain(element) {
        try {
            let revealed = false;
            let parent = element.parentElement;
            let depth = 0;
            const maxDepth = 10; // Prevent infinite loops
            
            while (parent && parent !== document.body && depth < maxDepth) {
                if (this.isElementHidden(parent)) {
                    // Try to reveal the parent
                    if (this.revealWithCSS(parent) || this.revealWithClasses(parent)) {
                        revealed = true;
                    }
                }
                parent = parent.parentElement;
                depth++;
            }
            
            return revealed;
        } catch (error) {
            console.error('Parent chain reveal failed:', error);
            return false;
        }
    }
    
    async revealAll() {
        const results = [];
        
        for (const elementData of this.discoveredElements) {
            const result = await this.revealElement(elementData.id);
            results.push(result);
        }
        
        return {
            total: results.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
        };
    }
    
    async restoreAll() {
        const results = [];
        const elementsToRestore = Array.from(this.revealedElements.keys());
        
        for (const elementId of elementsToRestore) {
            try {
                const result = this.restoreElement(elementId);
                results.push(result);
            } catch (error) {
                console.error(`Error restoring element ${elementId}:`, error);
                results.push({ success: false, error: error.message });
            }
        }
        
        // Clear all revealed elements after restoration attempt
        this.revealedElements.clear();
        
        return {
            total: results.length,
            restored: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
        };
    }
    
    restoreElement(elementId) {
        try {
            const originalState = this.originalStates.get(elementId);
            if (!originalState) return { success: false, error: 'No original state saved' };
            
            const elementData = this.discoveredElements.find(el => el.id === elementId);
            if (!elementData) return { success: false, error: 'Element not found' };
            
            const { element } = elementData;
            
            // Restore original styles
            Object.entries(originalState.styles).forEach(([prop, value]) => {
                element.style[prop] = value;
            });
            
            // Restore original classes
            element.className = originalState.className;
            
            // Remove reveal indicator
            this.removeRevealIndicator(element);
            
            this.originalStates.delete(elementId);
            this.revealedElements.delete(elementId);
            
            return { success: true };
        } catch (error) {
            console.error('Restore failed:', error);
            return { success: false, error: error.message };
        }
    }
    
    saveOriginalState(elementId, element) {
        try {
            const computedStyle = window.getComputedStyle(element);
            const originalState = {
                styles: {
                    display: element.style.display || '',
                    visibility: element.style.visibility || '',
                    opacity: element.style.opacity || '',
                    height: element.style.height || '',
                    width: element.style.width || '',
                    position: element.style.position || '',
                    left: element.style.left || '',
                    top: element.style.top || '',
                    clipPath: element.style.clipPath || '',
                    transform: element.style.transform || '',
                    overflow: element.style.overflow || ''
                },
                className: element.className,
                computedDisplay: computedStyle.display,
                computedVisibility: computedStyle.visibility,
                computedOpacity: computedStyle.opacity
            };
            
            this.originalStates.set(elementId, originalState);
        } catch (error) {
            console.error('Error saving original state:', error);
            // Save minimal state as fallback
            this.originalStates.set(elementId, {
                styles: {},
                className: element.className || '',
                computedDisplay: 'block',
                computedVisibility: 'visible',
                computedOpacity: '1'
            });
        }
    }
    
    addRevealIndicator(element, elementId) {
        if (element.querySelector('.zen-reveal-indicator')) return;
        
        const indicator = document.createElement('div');
        indicator.className = 'zen-reveal-indicator';
        indicator.innerHTML = '✨ Revealed by Zen';
        indicator.setAttribute('data-zen-id', elementId);
        
        element.appendChild(indicator);
        element.classList.add('zen-revealed');
    }
    
    removeRevealIndicator(element) {
        const indicator = element.querySelector('.zen-reveal-indicator');
        if (indicator) {
            indicator.remove();
        }
        element.classList.remove('zen-revealed');
    }
    
    highlightElement(elementId) {
        const elementData = this.discoveredElements.find(el => el.id === elementId);
        if (elementData) {
            elementData.element.classList.add('zen-highlight');
            elementData.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    
    unhighlightAll() {
        document.querySelectorAll('.zen-highlight').forEach(el => {
            el.classList.remove('zen-highlight');
        });
    }
    
    injectStyles() {
        // Ensure styles are only injected once
        if (document.getElementById('zen-styles')) {
            return; // Styles already injected
        }
        
        try {
            const style = document.createElement('style');
            style.id = 'zen-styles';
            style.textContent = `
                .zen-highlight {
                    outline: 2px solid #007acc !important;
                    outline-offset: 2px !important;
                    box-shadow: 0 0 10px rgba(0, 122, 204, 0.5) !important;
                    transition: all 0.3s ease !important;
                    animation: zen-pulse 2s ease-in-out infinite !important;
                }
                
                @keyframes zen-pulse {
                    0%, 100% { 
                        box-shadow: 0 0 10px rgba(0, 122, 204, 0.5) !important; 
                    }
                    50% { 
                        box-shadow: 0 0 20px rgba(0, 122, 204, 0.8) !important; 
                    }
                }
                
                .zen-revealed {
                    position: relative !important;
                    animation: zen-reveal 0.5s ease-out !important;
                }
                
                @keyframes zen-reveal {
                    from {
                        opacity: 0 !important;
                        transform: translateY(-10px) !important;
                    }
                    to {
                        opacity: 1 !important;
                        transform: translateY(0) !important;
                    }
                }
                
                .zen-reveal-indicator {
                    position: absolute !important;
                    top: -30px !important;
                    right: 0 !important;
                    background: linear-gradient(135deg, #007acc, #0056b3) !important;
                    color: white !important;
                    padding: 4px 10px !important;
                    border-radius: 12px !important;
                    font-size: 11px !important;
                    font-weight: 600 !important;
                    z-index: 10000 !important;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2) !important;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                    backdrop-filter: blur(10px) !important;
                    border: 1px solid rgba(255, 255, 255, 0.2) !important;
                    animation: zen-indicator-slide 0.3s ease-out !important;
                }
                
                @keyframes zen-indicator-slide {
                    from {
                        opacity: 0 !important;
                        transform: translateY(-10px) scale(0.8) !important;
                    }
                    to {
                        opacity: 1 !important;
                        transform: translateY(0) scale(1) !important;
                    }
                }
                
                .zen-reveal-indicator::before {
                    content: "✨" !important;
                    margin-right: 4px !important;
                    font-size: 10px !important;
                }
            `;
            
            // Safely append to head
            const head = document.head || document.getElementsByTagName('head')[0];
            if (head) {
                head.appendChild(style);
            } else {
                // Fallback: wait for head to be available
                const observer = new MutationObserver((mutations, obs) => {
                    const headElement = document.head || document.getElementsByTagName('head')[0];
                    if (headElement) {
                        headElement.appendChild(style);
                        obs.disconnect();
                    }
                });
                observer.observe(document, { childList: true, subtree: true });
            }
        } catch (error) {
            console.error('Error injecting styles:', error);
            // Continue without styles - extension will still work
        }
    }
}

// Initialize the revealer
const zenRevealer = new ZenElementRevealer();