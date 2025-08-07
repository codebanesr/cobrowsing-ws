// This script gets injected into proxied websites to enable co-browsing
(function() {
    'use strict';

    if (window.COBROWSING_INITIALIZED) return;
    window.COBROWSING_INITIALIZED = true;

    const sessionId = window.COBROWSING_SESSION_ID;
    const serverUrl = window.COBROWSING_SERVER;

    if (!sessionId || !serverUrl) {
        console.log('Co-browsing not properly initialized');
        return;
    }

    // Connect to co-browsing server
    const socket = io(serverUrl);
    
    socket.on('connect', () => {
        console.log('Connected to co-browsing server from iframe');
        socket.emit('join-session', {
            sessionId: sessionId,
            role: 'iframe',
            userName: 'iframe-content'
        });
    });

    // Handle co-browsing link clicks
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a.cobrowsing-link');
        if (link) {
            e.preventDefault();
            const href = link.getAttribute('data-original-href');
            if (href) {
                // Navigate through parent frame
                window.parent.postMessage({
                    type: 'navigate',
                    url: href
                }, '*');
            }
        }
    });

    // Handle form submissions
    document.addEventListener('submit', (e) => {
        const form = e.target.closest('form.cobrowsing-form');
        if (form) {
            e.preventDefault();
            
            // Get form data
            const formData = new FormData(form);
            const data = {};
            for (let [key, value] of formData.entries()) {
                data[key] = value;
            }
            
            // Send to parent frame
            window.parent.postMessage({
                type: 'form-submit',
                action: form.action,
                method: form.method,
                data: data
            }, '*');
        }
    });

    // Listen for messages from parent frame
    window.addEventListener('message', (e) => {
        if (e.data.type === 'navigate') {
            window.location.href = e.data.url;
        }
    });

    // Style injection for better visual feedback
    const style = document.createElement('style');
    style.textContent = `
        .cobrowsing-highlight {
            outline: 3px solid #FF4444 !important;
            outline-offset: 2px !important;
            background-color: rgba(255, 68, 68, 0.1) !important;
            transition: all 0.2s ease !important;
        }
        
        .cobrowsing-link:hover {
            background-color: rgba(102, 126, 234, 0.1) !important;
            outline: 2px solid #667eea !important;
        }
        
        .cobrowsing-form {
            border: 2px dashed rgba(102, 126, 234, 0.3) !important;
            padding: 10px !important;
            border-radius: 5px !important;
        }
    `;
    document.head.appendChild(style);

    console.log('Co-browsing client initialized for iframe');
})();