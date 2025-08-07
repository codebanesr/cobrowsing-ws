class CoBrowsingClient {
    constructor() {
        this.socket = null;
        this.sessionId = null;
        this.role = null;
        this.userName = null;
        this.currentUrl = null;
        this.participants = { teacher: null, students: [] };
        
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        // Screens
        this.loginScreen = document.getElementById('login-screen');
        this.cobrowsingScreen = document.getElementById('cobrowsing-screen');
        
        // Login elements
        this.userNameInput = document.getElementById('userName');
        this.sessionIdInput = document.getElementById('sessionId');
        this.roleSelect = document.getElementById('role');
        this.joinBtn = document.getElementById('joinBtn');
        
        // Co-browsing elements
        this.currentSessionIdSpan = document.getElementById('currentSessionId');
        this.userRoleBadge = document.getElementById('userRoleBadge');
        this.navigationBar = document.getElementById('navigationBar');
        this.urlInput = document.getElementById('urlInput');
        this.navigateBtn = document.getElementById('navigateBtn');
        this.participantsBtn = document.getElementById('participantsBtn');
        this.participantCount = document.getElementById('participantCount');
        this.participantsDropdown = document.getElementById('participantsDropdown');
        this.participantsList = document.getElementById('participantsList');
        this.sharedFrame = document.getElementById('sharedFrame');
        this.loadingIndicator = document.getElementById('loadingIndicator');
        this.activityBtn = document.getElementById('activityBtn');
        this.activityPanel = document.getElementById('activityPanel');
        this.activityList = document.getElementById('activityList');
        this.leaveBtn = document.getElementById('leaveBtn');
    }

    setupEventListeners() {
        // Login
        this.joinBtn.addEventListener('click', () => this.joinSession());
        this.userNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinSession();
        });
        
        // Generate session ID on focus
        this.sessionIdInput.addEventListener('focus', () => {
            if (!this.sessionIdInput.value) {
                this.sessionIdInput.value = this.generateSessionId();
            }
        });
        
        // Navigation
        this.navigateBtn.addEventListener('click', () => this.navigateToUrl());
        this.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.navigateToUrl();
        });
        
        // Participants dropdown
        this.participantsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleParticipantsDropdown();
        });
        
        // Activity panel
        this.activityBtn.addEventListener('click', () => this.toggleActivityPanel());
        
        // Leave session
        this.leaveBtn.addEventListener('click', () => this.leaveSession());
        
        // Click outside to close dropdowns
        document.addEventListener('click', () => {
            this.participantsDropdown.classList.remove('show');
            this.activityPanel.classList.remove('show');
        });
        
        // Prevent dropdown close when clicking inside
        this.participantsDropdown.addEventListener('click', (e) => e.stopPropagation());
        this.activityPanel.addEventListener('click', (e) => e.stopPropagation());
    }

    generateSessionId() {
        return Math.random().toString(36).substring(2, 10).toUpperCase();
    }

    showMessage(text, type = 'info') {
        const message = document.createElement('div');
        message.className = `message ${type}`;
        message.textContent = text;
        document.body.appendChild(message);
        
        setTimeout(() => {
            message.remove();
        }, 4000);
    }

    async joinSession() {
        const userName = this.userNameInput.value.trim();
        const sessionId = this.sessionIdInput.value.trim() || this.generateSessionId();
        const role = this.roleSelect.value;

        if (!userName) {
            this.showMessage('Please enter your name', 'error');
            return;
        }

        this.userName = userName;
        this.sessionId = sessionId;
        this.role = role;

        try {
            // Connect to server
            this.socket = io();
            
            this.socket.on('connect', () => {
                console.log('Connected to server');
                this.socket.emit('join-session', {
                    sessionId: this.sessionId,
                    role: this.role,
                    userName: this.userName
                });
            });

            this.setupSocketListeners();
            
        } catch (error) {
            this.showMessage('Failed to connect to server', 'error');
            console.error('Connection error:', error);
        }
    }

    setupSocketListeners() {
        this.socket.on('session-joined', (data) => {
            this.handleSessionJoined(data);
        });

        this.socket.on('navigate', (data) => {
            this.loadUrl(data.url);
        });

        this.socket.on('sync-interaction', (data) => {
            this.handleSyncedInteraction(data);
        });

        this.socket.on('user-joined', (data) => {
            this.addActivity(`${data.user.name} joined as ${data.user.role}`, 'success');
            this.requestParticipantsUpdate();
        });

        this.socket.on('user-left', (data) => {
            this.addActivity(`A ${data.user.role} left the session`, 'warning');
            this.requestParticipantsUpdate();
        });

        this.socket.on('error', (error) => {
            this.showMessage('Error: ' + error, 'error');
        });

        this.socket.on('disconnect', () => {
            this.addActivity('Disconnected from server', 'warning');
            this.showMessage('Connection lost. Trying to reconnect...', 'warning');
        });
    }

    handleSessionJoined(data) {
        this.showCoBrowsingScreen();
        this.currentSessionIdSpan.textContent = data.sessionId;
        
        // Set role badge
        this.userRoleBadge.textContent = this.role.toUpperCase();
        this.userRoleBadge.className = `role-badge role-${this.role}`;
        
        // Show/hide navigation based on role
        if (this.role !== 'teacher') {
            this.navigationBar.style.display = 'none';
        }

        // Load current URL if available
        if (data.currentUrl) {
            this.loadUrl(data.currentUrl);
        }

        this.addActivity(`Welcome! You joined as ${this.role}`, 'success');
        this.updateParticipants(data.participants);
        
        this.showMessage(`Joined session ${data.sessionId} as ${this.role}`, 'success');
    }

    showCoBrowsingScreen() {
        this.loginScreen.classList.add('hidden');
        this.cobrowsingScreen.classList.remove('hidden');
        this.cobrowsingScreen.classList.add('fade-in');
    }

    navigateToUrl() {
        const url = this.urlInput.value.trim();
        if (!url) return;

        // Add protocol if missing
        let fullUrl = url;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            fullUrl = 'https://' + url;
        }

        this.socket.emit('navigate-to', { url: fullUrl });
        this.addActivity(`Navigating to ${fullUrl}`, 'info');
    }

    loadUrl(url) {
        this.currentUrl = url;
        this.urlInput.value = url;
        this.showLoading(true);
        
        // Load through proxy
        const proxyUrl = `/proxy?url=${encodeURIComponent(url)}&sessionId=${this.sessionId}`;
        this.sharedFrame.src = proxyUrl;
        
        this.sharedFrame.onload = () => {
            this.showLoading(false);
            this.setupFrameInteractionCapture();
        };

        this.sharedFrame.onerror = () => {
            this.showLoading(false);
            this.addActivity(`Failed to load: ${url}`, 'warning');
            this.showMessage('Failed to load website. It may block iframe embedding.', 'warning');
        };
    }

    showLoading(show) {
        this.loadingIndicator.style.display = show ? 'flex' : 'none';
    }

    setupFrameInteractionCapture() {
        if (this.role !== 'teacher') return;

        try {
            const frameDocument = this.sharedFrame.contentDocument;
            if (!frameDocument) return;

            // Capture clicks
            frameDocument.addEventListener('click', (e) => {
                this.captureInteraction('click', {
                    x: e.clientX,
                    y: e.clientY,
                    target: this.getElementSelector(e.target)
                });
            });

            // Capture scrolling
            frameDocument.addEventListener('scroll', (e) => {
                this.captureInteraction('scroll', {
                    scrollX: frameDocument.documentElement.scrollLeft,
                    scrollY: frameDocument.documentElement.scrollTop
                });
            });

            // Capture input changes
            frameDocument.addEventListener('input', (e) => {
                if (e.target.matches('input, textarea, select')) {
                    this.captureInteraction('input', {
                        target: this.getElementSelector(e.target),
                        value: e.target.value,
                        type: e.target.type || 'text'
                    });
                }
            });

        } catch (error) {
            console.log('Could not access frame content (CORS restriction)');
            this.addActivity('Note: Some interactions may not sync due to website security policies', 'warning');
        }
    }

    captureInteraction(type, data) {
        const interaction = {
            type,
            data,
            timestamp: Date.now()
        };

        this.socket.emit('interaction', interaction);
    }

    handleSyncedInteraction(interaction) {
        try {
            const frameDocument = this.sharedFrame.contentDocument;
            if (!frameDocument) return;

            switch (interaction.type) {
                case 'click':
                    const element = frameDocument.querySelector(interaction.data.target);
                    if (element) {
                        element.click();
                        this.highlightElement(element);
                    }
                    break;

                case 'scroll':
                    frameDocument.documentElement.scrollTo(
                        interaction.data.scrollX,
                        interaction.data.scrollY
                    );
                    break;

                case 'input':
                    const inputElement = frameDocument.querySelector(interaction.data.target);
                    if (inputElement) {
                        inputElement.value = interaction.data.value;
                        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                        this.highlightElement(inputElement);
                    }
                    break;
            }
        } catch (error) {
            console.log('Could not sync interaction:', error.message);
        }
    }

    highlightElement(element) {
        element.style.outline = '3px solid #6366f1';
        element.style.outlineOffset = '2px';
        
        setTimeout(() => {
            element.style.outline = '';
            element.style.outlineOffset = '';
        }, 2000);
    }

    getElementSelector(element) {
        if (element.id) return `#${element.id}`;
        if (element.className) return `.${element.className.split(' ')[0]}`;
        return element.tagName.toLowerCase();
    }

    toggleParticipantsDropdown() {
        this.participantsDropdown.classList.toggle('show');
    }

    toggleActivityPanel() {
        this.activityPanel.classList.toggle('show');
    }

    requestParticipantsUpdate() {
        // Request updated participant list from server
        if (this.socket) {
            this.socket.emit('get-participants');
        }
    }

    updateParticipants(participants) {
        this.participants = participants;
        let count = 0;
        let html = '';

        if (participants.teacher) {
            count++;
            const initials = participants.teacher.name.substring(0, 2).toUpperCase();
            html += `
                <div class="participant-item">
                    <div class="participant-avatar avatar-teacher">${initials}</div>
                    <div class="participant-info">
                        <div class="participant-name">${participants.teacher.name}</div>
                        <div class="participant-role">Teacher</div>
                    </div>
                    <div class="participant-status"></div>
                </div>`;
        }

        participants.students.forEach(student => {
            count++;
            const initials = student.name.substring(0, 2).toUpperCase();
            html += `
                <div class="participant-item">
                    <div class="participant-avatar avatar-student">${initials}</div>
                    <div class="participant-info">
                        <div class="participant-name">${student.name}</div>
                        <div class="participant-role">Student</div>
                    </div>
                    <div class="participant-status"></div>
                </div>`;
        });

        this.participantCount.textContent = count;
        this.participantsList.innerHTML = html;
    }

    addActivity(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';
        
        activityItem.innerHTML = `
            <div class="activity-icon ${type}"></div>
            <div class="activity-content">
                <div class="activity-text">${message}</div>
                <div class="activity-time">${timestamp}</div>
            </div>
        `;
        
        this.activityList.appendChild(activityItem);
        this.activityList.scrollTop = this.activityList.scrollHeight;
    }

    leaveSession() {
        if (this.socket) {
            this.socket.disconnect();
        }
        
        // Reset to login screen
        this.cobrowsingScreen.classList.add('hidden');
        this.loginScreen.classList.remove('hidden');
        
        // Clear data
        this.sessionIdInput.value = '';
        this.activityList.innerHTML = '';
        this.participantsList.innerHTML = '';
        
        this.showMessage('Left the session', 'info');
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CoBrowsingClient();
});