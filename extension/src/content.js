class CobrowsingContent {
  constructor() {
    this.isController = false;
    this.isActive = false;
    this.lastScrollTime = 0;
    this.scrollThrottle = 100; // ms
    this.remoteCursor = null;
    this.setupMessageListener();
    this.injectScript();
    this.createRemoteCursor();
    this.requestCurrentState();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true;
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
      case 'cursor-move':
        this.applyCursorMove(data);
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

  applyCursorMove(data) {
    if (this.remoteCursor) {
      this.remoteCursor.style.left = `${data.pageX}px`;
      this.remoteCursor.style.top = `${data.pageY}px`;
      this.remoteCursor.style.display = 'block';
      
      // Hide cursor after 3 seconds of inactivity
      clearTimeout(this.remoteCursor._hideTimeout);
      this.remoteCursor._hideTimeout = setTimeout(() => {
        if (this.remoteCursor) {
          this.remoteCursor.style.display = 'none';
        }
      }, 3000);
    }
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

  createRemoteCursor() {
    // Remove existing cursor if any
    if (this.remoteCursor) {
      this.remoteCursor.remove();
    }

    // Ensure DOM is ready
    const createCursor = () => {
      // Create remote cursor element
      this.remoteCursor = document.createElement('div');
      this.remoteCursor.id = 'cobrowsing-remote-cursor';
      this.remoteCursor.style.cssText = `
        position: absolute;
        width: 24px;
        height: 24px;
        pointer-events: none;
        z-index: 999999;
        display: none;
        transition: all 0.08s ease;
        filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.3));
      `;

      // Create cursor SVG with better visibility
      this.remoteCursor.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 3L20 10L12 12L10 20L3 3Z" fill="#FF4444" stroke="#FFFFFF" stroke-width="2"/>
          <path d="M3 3L20 10L12 12L10 20L3 3Z" fill="none" stroke="#000000" stroke-width="1"/>
          <circle cx="18" cy="6" r="4" fill="#FF4444" stroke="#FFFFFF" stroke-width="2"/>
          <circle cx="18" cy="6" r="4" fill="none" stroke="#000000" stroke-width="1"/>
          <text x="18" y="8" text-anchor="middle" fill="#FFFFFF" font-family="Arial" font-size="8" font-weight="bold">●</text>
        </svg>
      `;

      // Append to body when it's available
      if (document.body) {
        document.body.appendChild(this.remoteCursor);
      } else {
        // Body not ready yet, wait a bit
        setTimeout(createCursor, 100);
      }
    };

    createCursor();
  }

  sendEventToBackground(eventType, data) {
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