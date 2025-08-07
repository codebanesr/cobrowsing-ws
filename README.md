# CoBrowsing System Architecture

A VNC-like collaborative web browsing system where multiple users can control the same browser tab in real-time.

## Overview

This system allows multiple users to join a session and collaboratively browse websites together. Unlike traditional screen sharing, all participants can actively control the browser - clicking, scrolling, typing, and navigating.

## Architecture Components

### 🖥️ Server-Side (Node.js + Puppeteer)

#### Core Components
- **Express Server**: HTTP server for static files and REST endpoints
- **Socket.IO**: WebSocket server for real-time communication
- **Puppeteer**: Headless Chrome browser automation
- **Session Manager**: Tracks active sessions and participants

#### Browser Management
```javascript
// One browser instance per session (not per user)
const browserInstances = new Map(); // sessionId -> { browser, page, screenshotInterval }

// When first user joins session
await puppeteer.launch({
  headless: false,
  defaultViewport: { width: 1920, height: 1080 }
});
```

#### Screen Streaming
- **Screenshot Capture**: 10 FPS JPEG screenshots (100ms intervals)
- **Broadcast**: Screenshots sent to all session participants via WebSocket
- **Quality**: 80% JPEG compression for performance

#### Input Processing
- **Mouse Events**: Click, move, scroll → Puppeteer mouse API
- **Keyboard Events**: Keydown, keyup, type → Puppeteer keyboard API
- **Real-time**: All user inputs immediately applied to browser

### 🌐 Client-Side (Vanilla JavaScript)

#### Core Components
- **Socket.IO Client**: WebSocket communication with server
- **Screen Display**: HTML `<img>` element showing browser screenshots
- **Input Capture**: Mouse/keyboard event listeners
- **Cursor Sync**: Multi-user cursor visualization

#### Input Handling
```javascript
// Mouse events captured and sent to server
sharedScreen.addEventListener('click', (e) => {
  const rect = sharedScreen.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (1920 / rect.width);
  const y = (e.clientY - rect.top) * (1080 / rect.height);
  
  socket.emit('mouse-event', { type: 'click', x, y });
});
```

#### Coordinate Scaling
- **Client → Server**: Scale from display size to browser viewport (1920x1080)
- **Server → Client**: Scale cursor positions for different screen sizes

## System Flow

### Session Creation
```
User 1 joins session "ABC123"
├── Session doesn't exist
├── Create new session object
├── Launch Puppeteer browser instance
├── Start screenshot streaming (10 FPS)
└── User joins session room
```

### Additional Users
```
User 2 joins same session "ABC123"
├── Session exists
├── Reuse existing browser instance
├── User joins session room
└── Receives current screenshot stream
```

### Real-time Interaction
```
User clicks on page
├── Client captures click coordinates
├── Scales coordinates to browser viewport
├── Sends via WebSocket to server
├── Server applies click via Puppeteer
├── Browser updates
├── Screenshot captured
└── Broadcast to all session participants
```

### Session Cleanup
```
Last user leaves session
├── Remove user from session
├── Stop screenshot streaming
├── Close Puppeteer browser
└── Delete session object
```

## Data Flow

### WebSocket Events

#### Client → Server
```javascript
// User input events
socket.emit('mouse-event', { type: 'click', x, y, button });
socket.emit('keyboard-event', { type: 'keydown', key });
socket.emit('scroll-event', { deltaX, deltaY });
socket.emit('navigate-to', { url });
```

#### Server → Client
```javascript
// Screen updates
socket.emit('screen-update', { screenshot: 'data:image/jpeg;base64,...' });
socket.emit('cursor-update', { userId, userName, x, y });
socket.emit('navigate', { url });
```

### REST Endpoints
```
GET  /                           # Main application
GET  /session-screenshot/:id     # Get current session screenshot
POST /join-session               # Join existing session
```

## Session Management

### Session Object Structure
```javascript
{
  id: "ABC123",
  teacher: { id: "socket1", name: "John" },
  students: [
    { id: "socket2", name: "Jane" },
    { id: "socket3", name: "Bob" }
  ],
  currentUrl: "https://example.com",
  interactions: []
}
```

### Browser Instance Structure
```javascript
{
  browser: puppeteerBrowser,
  page: puppeteerPage,
  screenshotInterval: setInterval(...)
}
```

## Performance Considerations

### Screenshot Optimization
- **Format**: JPEG (smaller than PNG)
- **Quality**: 80% compression
- **Frequency**: 10 FPS (balance between smooth experience and bandwidth)
- **Resolution**: Fixed 1920x1080 viewport

### Memory Management
- Browser instances automatically cleaned up when sessions end
- Screenshot intervals cleared on session close
- Socket rooms properly managed

### Scalability Limits
- **Concurrent Sessions**: Limited by server memory (each browser ~100MB RAM)
- **Users per Session**: No hard limit, but performance degrades with many cursors
- **Network**: ~200KB/s per user for screenshot streaming

## Security Considerations

### Browser Sandboxing
```javascript
// Puppeteer security flags
args: ['--no-sandbox', '--disable-setuid-sandbox']
```

### Input Validation
- Coordinate bounds checking
- URL validation for navigation
- Session ID validation

### Network Security
- CORS enabled for specific origins
- WebSocket origin validation
- No sensitive data in screenshots

## Deployment Architecture

### Development
```
├── Node.js server (port 3000)
├── Puppeteer browsers (dynamic)
└── Static files served from /public
```

### Production Considerations
- **Headless Mode**: Set `headless: true` for production
- **Resource Limits**: Container memory limits for browser instances
- **Load Balancing**: Session affinity required (users must hit same server)
- **CDN**: Serve static assets from CDN

## Technology Stack

- **Backend**: Node.js, Express, Socket.IO, Puppeteer
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Real-time**: WebSocket communication
- **Browser Automation**: Chrome/Chromium via Puppeteer
- **Image Processing**: JPEG compression, Base64 encoding

## Comparison to Alternatives

| Approach | Pros | Cons |
|----------|------|------|
| **VNC-like (Current)** | Universal website support, true collaboration | Higher bandwidth, server resources |
| **WebRTC Screen Share** | Low latency, P2P | View-only, complex signaling |
| **DOM Synchronization** | Lightweight, fast | Limited website compatibility |
| **iframe Proxying** | Simple implementation | Many sites block iframes |

## Future Enhancements

### Performance
- **Video Streaming**: H.264 encoding instead of JPEG screenshots
- **Delta Compression**: Only send screen regions that changed
- **CDN Integration**: Serve screenshots via CDN edge locations

### Features
- **Multi-tab Support**: Multiple browser tabs per session
- **Recording**: Session playback functionality
- **Voice Chat**: Integrated WebRTC audio communication
- **Permissions**: Granular user permissions (view-only, click-only, etc.)

### Scalability
- **Kubernetes**: Container orchestration for browser instances
- **Redis**: Distributed session storage
- **Load Balancer**: Sticky session routing

## License

MIT License - see [LICENSE](LICENSE) file for details.