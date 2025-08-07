class CobrowsingPopup {
  constructor() {
    this.setupEventListeners();
    this.updateUI();
    this.setupMessageListener();
  }

  setupEventListeners() {
    document.getElementById('createRoom').addEventListener('click', () => {
      this.createRoom();
    });

    document.getElementById('joinRoom').addEventListener('click', () => {
      const roomId = document.getElementById('roomInput').value.trim();
      if (roomId) {
        this.joinRoom(roomId);
      }
    });

    document.getElementById('requestControl').addEventListener('click', () => {
      this.requestControl();
    });

    document.getElementById('releaseControl').addEventListener('click', () => {
      this.releaseControl();
    });

    document.getElementById('leaveRoom').addEventListener('click', () => {
      this.leaveRoom();
    });
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message) => {
      this.handleMessage(message);
    });
  }

  handleMessage(message) {
    switch (message.type) {
      case 'connected':
        this.updateStatus('Connected', 'connected');
        break;
      case 'disconnected':
        this.updateStatus('Disconnected', 'disconnected');
        this.showCreateJoinSection();
        break;
      case 'controller-changed':
        this.updateControlButtons(message.isController);
        break;
      case 'control-released':
        this.updateControlButtons(false);
        break;
      case 'user-joined':
      case 'user-left':
        this.updateUI();
        break;
    }
  }

  async updateUI() {
    try {
      const status = await this.getStatus();
      
      if (status.connected) {
        this.updateStatus('Connected', 'connected');
      } else {
        this.updateStatus('Disconnected', 'disconnected');
      }

      if (status.roomId) {
        this.showRoomSection(status.roomId, status.isController);
      } else {
        this.showCreateJoinSection();
      }
    } catch (error) {
      console.error('Error updating UI:', error);
      this.updateStatus('Error', 'disconnected');
    }
  }

  updateStatus(text, className) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = text;
    statusEl.className = `status ${className}`;
  }

  showCreateJoinSection() {
    document.getElementById('createSection').style.display = 'block';
    document.getElementById('joinSection').style.display = 'block';
    document.getElementById('roomSection').style.display = 'none';
  }

  showRoomSection(roomId, isController) {
    document.getElementById('createSection').style.display = 'none';
    document.getElementById('joinSection').style.display = 'none';
    document.getElementById('roomSection').style.display = 'block';
    
    document.getElementById('roomInfo').textContent = `Room: ${roomId}`;
    this.updateControlButtons(isController);
  }

  updateControlButtons(isController) {
    const requestBtn = document.getElementById('requestControl');
    const releaseBtn = document.getElementById('releaseControl');
    
    if (isController) {
      requestBtn.style.display = 'none';
      releaseBtn.style.display = 'block';
    } else {
      requestBtn.style.display = 'block';
      releaseBtn.style.display = 'none';
    }
  }

  async createRoom() {
    try {
      this.setButtonLoading('createRoom', true);
      
      // First ensure we're connected
      await this.sendMessage({ type: 'connect' });
      
      const response = await this.sendMessage({ type: 'create-room' });
      
      if (response.success) {
        this.showRoomSection(response.roomId, true);
      } else {
        alert('Failed to create room: ' + response.error);
      }
    } catch (error) {
      alert('Error creating room: ' + error.message);
    } finally {
      this.setButtonLoading('createRoom', false);
    }
  }

  async joinRoom(roomId) {
    try {
      this.setButtonLoading('joinRoom', true);
      
      // First ensure we're connected
      await this.sendMessage({ type: 'connect' });
      
      const response = await this.sendMessage({ 
        type: 'join-room', 
        roomId: roomId 
      });
      
      if (response.success) {
        this.showRoomSection(roomId, false);
      } else {
        alert('Failed to join room: ' + response.error);
      }
    } catch (error) {
      alert('Error joining room: ' + error.message);
    } finally {
      this.setButtonLoading('joinRoom', false);
    }
  }

  async requestControl() {
    try {
      await this.sendMessage({ type: 'request-control' });
    } catch (error) {
      alert('Error requesting control: ' + error.message);
    }
  }

  async releaseControl() {
    try {
      await this.sendMessage({ type: 'release-control' });
    } catch (error) {
      alert('Error releasing control: ' + error.message);
    }
  }

  async leaveRoom() {
    try {
      await this.sendMessage({ type: 'leave-room' });
      this.showCreateJoinSection();
    } catch (error) {
      alert('Error leaving room: ' + error.message);
    }
  }

  setButtonLoading(buttonId, loading) {
    const button = document.getElementById(buttonId);
    if (loading) {
      button.disabled = true;
      button.textContent = 'Loading...';
    } else {
      button.disabled = false;
      // Reset text based on button ID
      switch (buttonId) {
        case 'createRoom':
          button.textContent = 'Create Room';
          break;
        case 'joinRoom':
          button.textContent = 'Join Room';
          break;
      }
    }
  }

  sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, resolve);
    });
  }

  getStatus() {
    return this.sendMessage({ type: 'get-status' });
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new CobrowsingPopup();
});