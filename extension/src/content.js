class CobrowsingContent {
  constructor() {
    this.isController = false;
    this.isActive = false;
    this.lastScrollTime = 0;
    this.scrollThrottle = 100; // ms
    this.highlightedElement = null;
    this.setupMessageListener();
    this.injectScript();
    this.createHighlightStyle();
    this.requestCurrentState();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        // Validate message
        if (!message || !message.type) {
          sendResponse({ success: false, error: 'Invalid message format' });
          return false;
        }
        
        this.handleMessage(message, sender, sendResponse);
        return true;
      } catch (error) {
        console.error('Error handling message in content script:', error);
        sendResponse({ success: false, error: error.message });
        return false;
      }
    });
  }

  injectScript() {
    // Inject the script that will capture page events
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);

    // Listen for events from the injected script
    window.addEventListener('cobrowsing-event', (event) => {
      if (this.isController && this.isActive) {
        this.sendEventToBackground(event.detail.type, event.detail.data);
      }
    });
  }

  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'apply-sync-event':
        if (!this.isController) {
          this.applySyncEvent(message.eventType, message.data);
        }
        sendResponse({ success: true });
        break;

      case 'set-controller':
        this.isController = message.isController;
        this.isActive = message.isActive;
        // Notify the injected script about controller status change
        window.postMessage({
          type: 'cobrowsing-control-change',
          isController: this.isController
        }, '*');
        sendResponse({ success: true });
        break;
    }
  }

  applySyncEvent(eventType, data) {
    switch (eventType) {
      case 'scroll':
        this.applyScroll(data);
        break;
      case 'click':
        this.applyClick(data);
        break;
      case 'input':
        this.applyInput(data);
        break;
      case 'navigation':
        this.applyNavigation(data);
        break;
      case 'form-submit':
        this.applyFormSubmit(data);
        break;
      case 'element-highlight':
        this.applyElementHighlight(data);
        break;
      case 'focus':
        this.applyFocus(data);
        break;
      case 'selection-change':
        this.applySelectionChange(data);
        break;
    }
  }

  applyScroll(data) {
    // Temporarily disable scroll event capturing to avoid loops
    this.isActive = false;
    
    window.scrollTo({
      left: data.x,
      top: data.y,
      behavior: 'smooth'
    });
    
    // Re-enable after a short delay
    setTimeout(() => {
      this.isActive = true;
    }, 200);
  }

  applyClick(data) {
    const element = this.findElementBySelector(data.selector);
    if (element) {
      // Create and dispatch a click event
      const clickEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: data.x,
        clientY: data.y
      });
      element.dispatchEvent(clickEvent);
    }
  }

  applyInput(data) {
    const element = this.findElementBySelector(data.selector);
    if (element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')) {
      // Update value
      element.value = data.value;
      
      // Set cursor position if provided
      if (typeof data.selectionStart === 'number' && typeof data.selectionEnd === 'number') {
        element.setSelectionRange(data.selectionStart, data.selectionEnd);
      }
      
      // Trigger input event
      const inputEvent = new Event('input', { bubbles: true });
      element.dispatchEvent(inputEvent);
      
      // Trigger change event for better compatibility
      const changeEvent = new Event('change', { bubbles: true });
      element.dispatchEvent(changeEvent);
    }
  }

  applyNavigation(data) {
    if (data.url && data.url !== window.location.href) {
      window.location.href = data.url;
    }
  }

  applyFormSubmit(data) {
    const form = this.findElementBySelector(data.formSelector);
    if (form && form.tagName === 'FORM') {
      form.submit();
    }
  }

  findElementBySelector(selector) {
    try {
      return document.querySelector(selector);
    } catch (error) {
      console.warn('Invalid selector:', selector);
      return null;
    }
  }

  generateSelector(element) {
    if (!element) return '';
    
    // Try ID first
    if (element.id) {
      return `#${element.id}`;
    }
    
    // Try classes
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/).slice(0, 3);
      if (classes.length > 0) {
        return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
      }
    }
    
    // Fall back to tag name with nth-child
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        child => child.tagName === element.tagName
      );
      const index = siblings.indexOf(element) + 1;
      return `${this.generateSelector(parent)} > ${element.tagName.toLowerCase()}:nth-child(${index})`;
    }
    
    return element.tagName.toLowerCase();
  }

  applyElementHighlight(data) {
    // Remove previous highlight
    if (this.highlightedElement) {
      this.highlightedElement.classList.remove('cobrowsing-highlight');
    }
    
    // Use selector if provided, otherwise use coordinates
    let element;
    if (data.selector) {
      element = this.findElementBySelector(data.selector);
    } else if (data.clientX !== undefined && data.clientY !== undefined) {
      element = document.elementFromPoint(data.clientX, data.clientY);
    }
    
    if (element) {
      // Always highlight the element, regardless of type for better visibility
      element.classList.add('cobrowsing-highlight');
      this.highlightedElement = element;
      
      // Remove highlight after 3 seconds
      clearTimeout(this.highlightTimeout);
      this.highlightTimeout = setTimeout(() => {
        if (this.highlightedElement === element) {
          element.classList.remove('cobrowsing-highlight');
          this.highlightedElement = null;
        }
      }, 3000);
    }
  }

  isInteractiveElement(element) {
    if (!element) return false;
    
    const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'OPTION'];
    const interactiveRoles = ['button', 'link', 'tab', 'menuitem', 'checkbox', 'radio'];
    const interactiveTypes = ['button', 'submit', 'reset', 'checkbox', 'radio'];
    
    // Check tag name
    if (interactiveTags.includes(element.tagName)) return true;
    
    // Check role attribute
    const role = element.getAttribute('role');
    if (role && interactiveRoles.includes(role)) return true;
    
    // Check input type
    if (element.tagName === 'INPUT' && element.type) {
      if (interactiveTypes.includes(element.type)) return true;
    }
    
    // Check for event handlers
    if (element.hasAttribute('onclick') || 
        element.hasAttribute('onmousedown') ||
        element.hasAttribute('onmouseup')) return true;
    
    // Check tabindex
    if (element.hasAttribute('tabindex') && element.getAttribute('tabindex') !== '-1') return true;
    
    // Check cursor style
    const computedStyle = getComputedStyle(element);
    if (computedStyle.cursor === 'pointer') return true;
    
    // Check if element is contenteditable
    if (element.contentEditable === 'true') return true;
    
    // Check if parent is interactive (for spans/divs inside buttons)
    let parent = element.parentElement;
    while (parent && parent !== document.body) {
      if (interactiveTags.includes(parent.tagName) || 
          (parent.getAttribute('role') && interactiveRoles.includes(parent.getAttribute('role')))) {
        return true;
      }
      parent = parent.parentElement;
    }
    
    return false;
  }

  applyFocus(data) {
    const element = this.findElementBySelector(data.selector);
    if (element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.contentEditable === 'true')) {
      element.focus();
    }
  }

  applySelectionChange(data) {
    const element = this.findElementBySelector(data.selector);
    if (element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')) {
      if (typeof data.selectionStart === 'number' && typeof data.selectionEnd === 'number') {
        element.setSelectionRange(data.selectionStart, data.selectionEnd);
      }
    }
  }

  createHighlightStyle() {
    // Remove existing style if it exists
    const existingStyle = document.getElementById('cobrowsing-highlight-style');
    if (existingStyle) {
      existingStyle.remove();
    }

    const style = document.createElement('style');
    style.id = 'cobrowsing-highlight-style';
    style.textContent = `
      .cobrowsing-highlight {
        position: relative !important;
        outline: 2px solid #FF4444 !important;
        outline-offset: 1px !important;
        background-color: rgba(255, 68, 68, 0.15) !important;
        box-shadow: 0 0 8px rgba(255, 68, 68, 0.4), inset 0 0 8px rgba(255, 68, 68, 0.1) !important;
        border-radius: 3px !important;
        transition: all 0.15s ease-in-out !important;
        z-index: 999999 !important;
      }
      
      .cobrowsing-highlight::before {
        content: '' !important;
        position: absolute !important;
        top: -3px !important;
        left: -3px !important;
        right: -3px !important;
        bottom: -3px !important;
        border: 1px solid rgba(255, 68, 68, 0.8) !important;
        border-radius: 4px !important;
        pointer-events: none !important;
        z-index: -1 !important;
      }
      
      .cobrowsing-highlight:hover {
        outline-color: #FF6666 !important;
        background-color: rgba(255, 68, 68, 0.2) !important;
      }
    `;
    
    (document.head || document.documentElement).appendChild(style);
  }

  sendEventToBackground(eventType, data) {
    // Check if extension context is still valid
    if (!chrome.runtime || !chrome.runtime.id) {
      console.log('Extension context invalidated, cannot send event');
      return;
    }
    
    chrome.runtime.sendMessage({
      type: 'sync-event',
      eventType: eventType,
      data: data
    }).catch(error => {
      console.log('Could not send event to background:', error.message);
    });
  }

  async requestCurrentState() {
    try {
      // Check if extension context is still valid
      if (!chrome.runtime || !chrome.runtime.id) {
        console.log('Extension context invalidated, cannot request state');
        return;
      }
      
      const response = await chrome.runtime.sendMessage({ type: 'get-status' });
      if (response && response.roomId) {
        this.isActive = true;
        this.isController = response.isController;
        
        // Notify the injected script about the current state
        window.postMessage({
          type: 'cobrowsing-control-change',
          isController: this.isController
        }, '*');
      }
    } catch (error) {
      // Background script might not be ready yet, that's okay
      console.log('Could not get current state:', error.message);
    }
  }
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new CobrowsingContent();
  });
} else {
  new CobrowsingContent();
}