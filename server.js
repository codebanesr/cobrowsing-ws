const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const puppeteer = require('puppeteer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store active sessions and browser instances
const sessions = new Map();
const browserInstances = new Map();

// Browser management functions
async function createBrowserSession(sessionId) {
  if (browserInstances.has(sessionId)) {
    return browserInstances.get(sessionId);
  }

  const browser = await puppeteer.launch({
    headless: false, // Set to true in production
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  const browserSession = {
    browser,
    page,
    screenshotInterval: null
  };

  browserInstances.set(sessionId, browserSession);
  
  // Start screenshot streaming
  startScreenshotStream(sessionId);
  
  return browserSession;
}

async function closeBrowserSession(sessionId) {
  const browserSession = browserInstances.get(sessionId);
  if (browserSession) {
    if (browserSession.screenshotInterval) {
      clearInterval(browserSession.screenshotInterval);
    }
    await browserSession.browser.close();
    browserInstances.delete(sessionId);
  }
}

function startScreenshotStream(sessionId) {
  const browserSession = browserInstances.get(sessionId);
  if (!browserSession) return;

  browserSession.screenshotInterval = setInterval(async () => {
    try {
      const screenshot = await browserSession.page.screenshot({ 
        encoding: 'base64',
        type: 'jpeg',
        quality: 80
      });
      
      // Broadcast screenshot to all users in session
      io.to(sessionId).emit('screen-update', {
        screenshot: `data:image/jpeg;base64,${screenshot}`,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Screenshot error:', error.message);
    }
  }, 100); // 10 FPS
}

// Get session screenshot
app.get('/session-screenshot/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const browserSession = browserInstances.get(sessionId);
  
  if (!browserSession) {
    return res.status(404).json({ error: 'Session not found' });
  }

  try {
    const screenshot = await browserSession.page.screenshot({ 
      encoding: 'base64',
      type: 'jpeg',
      quality: 80
    });
    
    res.json({ 
      screenshot: `data:image/jpeg;base64,${screenshot}`,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({ error: 'Screenshot failed: ' + error.message });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-session', async (data) => {
    const { sessionId, role, userName } = data;
    
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        id: sessionId,
        teacher: null,
        students: [],
        currentUrl: null,
        interactions: []
      });
      
      // Create browser instance for new session
      try {
        await createBrowserSession(sessionId);
      } catch (error) {
        socket.emit('error', 'Failed to create browser session');
        return;
      }
    }

    const session = sessions.get(sessionId);
    socket.sessionId = sessionId;
    socket.role = role;
    socket.userName = userName;

    if (role === 'teacher') {
      if (session.teacher) {
        socket.emit('error', 'Session already has a teacher');
        return;
      }
      session.teacher = {
        id: socket.id,
        name: userName
      };
    } else {
      session.students.push({
        id: socket.id,
        name: userName
      });
    }

    socket.join(sessionId);
    
    // Send current session state to new user
    socket.emit('session-joined', {
      sessionId,
      role,
      currentUrl: session.currentUrl,
      participants: {
        teacher: session.teacher,
        students: session.students
      }
    });

    // Notify others in the session
    socket.to(sessionId).emit('user-joined', {
      user: { id: socket.id, name: userName, role }
    });

    console.log(`${role} ${userName} joined session ${sessionId}`);
  });

  socket.on('navigate-to', async (data) => {
    const { url } = data;
    if (socket.role !== 'teacher') {
      socket.emit('error', 'Only teachers can navigate');
      return;
    }

    const session = sessions.get(socket.sessionId);
    const browserSession = browserInstances.get(socket.sessionId);
    
    if (session && browserSession) {
      try {
        await browserSession.page.goto(url, { waitUntil: 'networkidle0' });
        session.currentUrl = url;
        
        // Broadcast to all users in the session
        io.to(socket.sessionId).emit('navigate', { url });
      } catch (error) {
        socket.emit('error', 'Failed to navigate: ' + error.message);
      }
    }
  });

  socket.on('mouse-event', async (data) => {
    const browserSession = browserInstances.get(socket.sessionId);
    if (!browserSession) return;

    const { type, x, y, button } = data;
    
    try {
      switch (type) {
        case 'click':
          await browserSession.page.mouse.click(x, y, { button: button || 'left' });
          break;
        case 'move':
          await browserSession.page.mouse.move(x, y);
          break;
        case 'down':
          await browserSession.page.mouse.down({ button: button || 'left' });
          break;
        case 'up':
          await browserSession.page.mouse.up({ button: button || 'left' });
          break;
      }
      
      // Broadcast cursor position to other users
      socket.to(socket.sessionId).emit('cursor-update', {
        userId: socket.id,
        userName: socket.userName,
        x, y, type
      });
    } catch (error) {
      console.error('Mouse event error:', error.message);
    }
  });

  socket.on('keyboard-event', async (data) => {
    const browserSession = browserInstances.get(socket.sessionId);
    if (!browserSession) return;

    const { type, key, text } = data;
    
    try {
      switch (type) {
        case 'keydown':
          await browserSession.page.keyboard.down(key);
          break;
        case 'keyup':
          await browserSession.page.keyboard.up(key);
          break;
        case 'type':
          await browserSession.page.keyboard.type(text);
          break;
      }
    } catch (error) {
      console.error('Keyboard event error:', error.message);
    }
  });

  socket.on('scroll-event', async (data) => {
    const browserSession = browserInstances.get(socket.sessionId);
    if (!browserSession) return;

    const { deltaX, deltaY } = data;
    
    try {
      await browserSession.page.evaluate((deltaX, deltaY) => {
        window.scrollBy(deltaX, deltaY);
      }, deltaX, deltaY);
    } catch (error) {
      console.error('Scroll event error:', error.message);
    }
  });

  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    
    if (socket.sessionId) {
      const session = sessions.get(socket.sessionId);
      if (session) {
        if (socket.role === 'teacher' && session.teacher?.id === socket.id) {
          session.teacher = null;
        } else {
          session.students = session.students.filter(student => student.id !== socket.id);
        }

        // Notify others in the session
        socket.to(socket.sessionId).emit('user-left', {
          user: { id: socket.id, role: socket.role }
        });

        // Clean up empty sessions
        if (!session.teacher && session.students.length === 0) {
          sessions.delete(socket.sessionId);
          await closeBrowserSession(socket.sessionId);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Co-browsing server running on port ${PORT}`);
  console.log(`Visit: http://localhost:${PORT}`);
});