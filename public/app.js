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
        this.sharedScreen = document.getElementById('sharedScreen'); // Changed from sharedFrame
        this.loadingIndicator = document.getElementById('loadingIndicator');
        this.activityBtn = document.getElementById('activityBtn');
        this.activityPanel = document.getElementById('activityPanel');
        this.activityList = document.getElementById('activityList');
        this.leaveBtn = document.getElementById('leaveBtn');
        this.cursorsContainer = document.getElementById('cursors-container');
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
        
        // Set up screen interaction handlers
        this.setupScreenInteraction();
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
            this.addActivity(`Navigating to ${data.url}`, 'info');
        });

        this.socket.on('screen-update', (data) => {
            this.updateScreen(data.screenshot);
        });

        this.socket.on('cursor-update', (data) => {
            this.updateCursor(data);
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

    setupScreenInteraction() {
        if (!this.sharedScreen) return;

        // Mouse events
        this.sharedScreen.addEventListener('mousemove', (e) => {
            const rect = this.sharedScreen.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (1920 / rect.width);
            const y = (e.clientY - rect.top) * (1080 / rect.height);
            
            this.socket.emit('mouse-event', {
                type: 'move',
                x: Math.round(x),
                y: Math.round(y)
            });
        });

        this.sharedScreen.addEventListener('click', (e) => {
            const rect = this.sharedScreen.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (1920 / rect.width);
            const y = (e.clientY - rect.top) * (1080 / rect.height);
            
            this.socket.emit('mouse-event', {
                type: 'click',
                x: Math.round(x),
                y: Math.round(y),
                button: e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle'
            });
        });

        this.sharedScreen.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.socket.emit('scroll-event', {
                deltaX: e.deltaX,
                deltaY: e.deltaY
            });
        });

        // Keyboard events
        document.addEventListener('keydown', (e) => {
            if (document.activeElement === this.sharedScreen) {
                this.socket.emit('keyboard-event', {
                    type: 'keydown',
                    key: e.key
                });
            }
        });

        document.addEventListener('keyup', (e) => {
            if (document.activeElement === this.sharedScreen) {
                this.socket.emit('keyboard-event', {
                    type: 'keyup',
                    key: e.key
                });
            }
        });

        // Make screen focusable for keyboard events
        this.sharedScreen.setAttribute('tabindex', '0');
    }

    updateScreen(screenshot) {
        if (this.sharedScreen && screenshot) {
            this.sharedScreen.src = screenshot;
            this.showLoading(false);
        }
    }

    updateCursor(data) {
        if (!this.cursorsContainer) return;

        let cursor = document.getElementById(`cursor-${data.userId}`);
        if (!cursor) {
            cursor = document.createElement('div');
            cursor.id = `cursor-${data.userId}`;
            cursor.className = 'remote-cursor';
            cursor.innerHTML = `
                <div class="cursor-pointer"></div>
                <div class="cursor-label">${data.userName}</div>
            `;
            this.cursorsContainer.appendChild(cursor);
        }

        const rect = this.sharedScreen.getBoundingClientRect();
        const scaledX = (data.x / 1920) * rect.width;
        const scaledY = (data.y / 1080) * rect.height;

        cursor.style.left = `${rect.left + scaledX}px`;
        cursor.style.top = `${rect.top + scaledY}px`;
    }

    showLoading(show) {
        this.loadingIndicator.style.display = show ? 'flex' : 'none';
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