class CobrowsingContent {
  constructor() {
    this.isController = false;
    this.isActive = false;
    this.lastScrollTime = 0;
    this.scrollThrottle = 100; // ms
    this.setupMessageListener();
    this.injectScript();
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
      element.value = data.value;
      
      // Trigger input event
      const inputEvent = new Event('input', { bubbles: true });
      element.dispatchEvent(inputEvent);
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

  sendEventToBackground(eventType, data) {
    chrome.runtime.sendMessage({
      type: 'sync-event',
      eventType: eventType,
      data: data
    });
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