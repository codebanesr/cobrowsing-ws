class CobrowsingBackground {
  constructor() {
    this.ws = null;
    this.clientId = null;
    this.roomId = null;
    this.isController = false;
    this.isConnected = false;
    this.setupEventListeners();
  }

  setupEventListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep the message channel open for async responses
    });

    this.setupTabListeners();
  }

  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'connect':
        this.connect().then(() => {
          sendResponse({ success: true, connected: this.isConnected });
        }).catch(error => {
          sendResponse({ success: false, error: error.message });
        });
        break;

      case 'disconnect':
        this.disconnect();
        sendResponse({ success: true });
        break;

      case 'create-room':
        this.createRoom().then((roomId) => {
          sendResponse({ success: true, roomId });
        }).catch(error => {
          sendResponse({ success: false, error: error.message });
        });
        break;

      case 'join-room':
        this.joinRoom(message.roomId).then(() => {
          sendResponse({ success: true });
        }).catch(error => {
          sendResponse({ success: false, error: error.message });
        });
        break;

      case 'leave-room':
        this.leaveRoom();
        sendResponse({ success: true });
        break;

      case 'request-control':
        this.requestControl();
        sendResponse({ success: true });
        break;

      case 'release-control':
        this.releaseControl();
        sendResponse({ success: true });
        break;

      case 'get-status':
        sendResponse({
          connected: this.isConnected,
          roomId: this.roomId,
          isController: this.isController,
          clientId: this.clientId
        });
        break;

      case 'sync-event':
        this.sendSyncEvent(message.eventType, message.data);
        sendResponse({ success: true });
        break;
    }
  }

  async connect() {
    if (this.isConnected) return;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket('ws://localhost:8080');

        this.ws.onopen = () => {
          this.isConnected = true;
          console.log('Connected to co-browsing server');
          resolve();
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          this.clientId = null;
          this.roomId = null;
          this.isController = false;
          console.log('Disconnected from co-browsing server');
          this.notifyPopup({ type: 'disconnected' });
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(new Error('Failed to connect to server'));
        };

        this.ws.onmessage = (event) => {
          const message = JSON.parse(event.data);
          this.handleServerMessage(message);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.clientId = null;
    this.roomId = null;
    this.isController = false;
  }

  async createRoom() {
    if (!this.isConnected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout creating room'));
      }, 5000);

      const originalHandler = this.ws.onmessage;
      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'room-created') {
          clearTimeout(timeout);
          this.ws.onmessage = originalHandler;
          this.roomId = message.roomId;
          this.isController = message.isController;
          this.notifyContentScripts();
          resolve(message.roomId);
        } else {
          originalHandler(event);
        }
      };

      this.ws.send(JSON.stringify({ type: 'create-room' }));
    });
  }

  async joinRoom(roomId) {
    if (!this.isConnected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout joining room'));
      }, 5000);

      const originalHandler = this.ws.onmessage;
      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'joined-room') {
          clearTimeout(timeout);
          this.ws.onmessage = originalHandler;
          this.roomId = message.roomId;
          this.isController = message.isController;
          this.notifyContentScripts();
          resolve();
        } else if (message.type === 'error') {
          clearTimeout(timeout);
          this.ws.onmessage = originalHandler;
          reject(new Error(message.message));
        } else {
          originalHandler(event);
        }
      };

      this.ws.send(JSON.stringify({ 
        type: 'join-room', 
        roomId: roomId 
      }));
    });
  }

  leaveRoom() {
    this.roomId = null;
    this.isController = false;
    this.notifyPopup({ type: 'left-room' });
  }

  requestControl() {
    if (this.ws && this.roomId) {
      this.ws.send(JSON.stringify({ type: 'request-control' }));
    }
  }

  releaseControl() {
    if (this.ws && this.roomId) {
      this.ws.send(JSON.stringify({ type: 'release-control' }));
    }
  }

  sendSyncEvent(eventType, data) {
    if (this.ws && this.roomId && this.isController) {
      this.ws.send(JSON.stringify({
        type: 'sync-event',
        eventType: eventType,
        data: data
      }));
    }
  }

  handleServerMessage(message) {
    switch (message.type) {
      case 'connected':
        this.clientId = message.clientId;
        this.notifyPopup({ 
          type: 'connected', 
          clientId: message.clientId 
        });
        break;

      case 'controller-changed':
        this.isController = (message.controllerId === this.clientId);
        this.notifyPopup({ 
          type: 'controller-changed', 
          isController: this.isController 
        });
        this.notifyContentScripts();
        break;

      case 'control-released':
        this.isController = false;
        this.notifyPopup({ 
          type: 'control-released' 
        });
        this.notifyContentScripts();
        break;

      case 'sync-event':
        this.handleSyncEvent(message);
        break;

      case 'user-joined':
      case 'user-left':
        this.notifyPopup(message);
        break;
    }
  }

  async handleSyncEvent(message) {
    if (this.isController) return; // Don't handle our own events

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      try {
        await chrome.tabs.sendMessage(tabs[0].id, {
          type: 'apply-sync-event',
          eventType: message.eventType,
          data: message.data
        });
      } catch (error) {
        // Content script might not be injected yet, that's okay
        console.log('Could not send sync event to tab:', error.message);
      }
    }
  }

  notifyPopup(message) {
    // Try to send message to popup if it's open
    chrome.runtime.sendMessage(message).catch(() => {
      // Popup not open, that's fine
    });
  }

  async notifyContentScripts() {
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'set-controller',
            isController: this.isController,
            isActive: this.roomId !== null
          });
        } catch (error) {
          // Tab might not have content script injected, that's okay
        }
      }
    } catch (error) {
      console.error('Error notifying content scripts:', error);
    }
  }

  // Also listen for tab navigation to re-notify content scripts
  setupTabListeners() {
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      // Handle navigation sync
      if (changeInfo.status === 'complete' && this.isController && this.roomId) {
        this.sendSyncEvent('navigation', { url: tab.url });
      }
      
      // Re-notify content script when page loads (after navigation)
      if (changeInfo.status === 'complete' && this.roomId) {
        try {
          await chrome.tabs.sendMessage(tabId, {
            type: 'set-controller',
            isController: this.isController,
            isActive: this.roomId !== null
          });
        } catch (error) {
          // Content script might not be ready yet, that's okay
        }
      }
    });
  }
}

// Initialize the background script
new CobrowsingBackground();