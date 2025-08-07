// This script is injected into the page context to capture DOM events
(function() {
  let isCapturing = true;
  let lastScrollTime = 0;
  const scrollThrottle = 100;

  function generateSelector(element) {
    if (!element) return '';
    
    // Try ID first
    if (element.id) {
      return `#${element.id}`;
    }
    
    // Try classes
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/).slice(0, 3);
      if (classes.length > 0 && classes[0]) {
        return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
      }
    }
    
    // Try data attributes
    for (let attr of element.attributes) {
      if (attr.name.startsWith('data-') && attr.value) {
        return `${element.tagName.toLowerCase()}[${attr.name}="${attr.value}"]`;
      }
    }
    
    // Fall back to nth-child approach
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        child => child.tagName === element.tagName
      );
      const index = siblings.indexOf(element) + 1;
      const parentSelector = generateSelector(parent);
      return `${parentSelector} > ${element.tagName.toLowerCase()}:nth-child(${index})`;
    }
    
    return element.tagName.toLowerCase();
  }

  function sendEvent(type, data) {
    window.dispatchEvent(new CustomEvent('cobrowsing-event', {
      detail: { type, data }
    }));
  }

  // Capture scroll events
  window.addEventListener('scroll', () => {
    if (!isCapturing) return;
    
    const now = Date.now();
    if (now - lastScrollTime < scrollThrottle) return;
    lastScrollTime = now;
    
    sendEvent('scroll', {
      x: window.scrollX,
      y: window.scrollY
    });
  }, { passive: true });

  // Capture click events
  document.addEventListener('click', (event) => {
    if (!isCapturing) return;
    
    const selector = generateSelector(event.target);
    
    // Send click event
    sendEvent('click', {
      selector: selector,
      x: event.clientX,
      y: event.clientY,
      tagName: event.target.tagName,
      href: event.target.href || null
    });
    
    // Also send highlight event for clicked element
    sendEvent('element-highlight', {
      clientX: event.clientX,
      clientY: event.clientY,
      selector: selector,
      tagName: event.target.tagName,
      className: event.target.className,
      id: event.target.id
    });
  }, true);

  // Capture input events with cursor position
  document.addEventListener('input', (event) => {
    if (!isCapturing) return;
    
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      const selector = generateSelector(event.target);
      sendEvent('input', {
        selector: selector,
        value: event.target.value,
        type: event.target.type,
        selectionStart: event.target.selectionStart,
        selectionEnd: event.target.selectionEnd
      });
    }
  }, true);

  // Capture selection changes in input fields
  document.addEventListener('selectionchange', () => {
    if (!isCapturing) return;
    
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      const selector = generateSelector(activeElement);
      sendEvent('selection-change', {
        selector: selector,
        selectionStart: activeElement.selectionStart,
        selectionEnd: activeElement.selectionEnd
      });
    }
  });

  // Capture form submissions
  document.addEventListener('submit', (event) => {
    if (!isCapturing) return;
    
    const formSelector = generateSelector(event.target);
    const formData = new FormData(event.target);
    const data = {};
    
    for (let [key, value] of formData.entries()) {
      data[key] = value;
    }
    
    sendEvent('form-submit', {
      formSelector: formSelector,
      action: event.target.action,
      method: event.target.method,
      data: data
    });
  }, true);

  // Capture focus events for better synchronization
  document.addEventListener('focus', (event) => {
    if (!isCapturing) return;
    
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.contentEditable === 'true') {
      const selector = generateSelector(event.target);
      sendEvent('focus', {
        selector: selector
      });
    }
  }, true);

  // Capture mouse hover over interactive elements
  let lastHoverTime = 0;
  let lastHoveredElement = null;
  const hoverThrottle = 200; // ms - less frequent for element highlighting
  
  function isInteractiveElement(element) {
    const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'];
    const interactiveRoles = ['button', 'link', 'tab', 'menuitem'];
    
    return interactiveTags.includes(element.tagName) ||
           interactiveRoles.includes(element.getAttribute('role')) ||
           element.hasAttribute('onclick') ||
           element.hasAttribute('tabindex') ||
           element.style.cursor === 'pointer' ||
           getComputedStyle(element).cursor === 'pointer';
  }
  
  document.addEventListener('mousemove', (event) => {
    if (!isCapturing) return;
    
    const now = Date.now();
    if (now - lastHoverTime < hoverThrottle) return;
    
    const element = event.target;
    if (element === lastHoveredElement) return;
    
    // Send highlight for any element (let content script decide what to highlight)
    lastHoverTime = now;
    lastHoveredElement = element;
    
    sendEvent('element-highlight', {
      clientX: event.clientX,
      clientY: event.clientY,
      selector: generateSelector(element),
      tagName: element.tagName,
      className: element.className,
      id: element.id
    });
  }, { passive: true });

  // Listen for control changes from content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data.type === 'cobrowsing-control-change') {
      isCapturing = event.data.isController;
    }
  });

  console.log('Co-browsing injected script loaded');
})();