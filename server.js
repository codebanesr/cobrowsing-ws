const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
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

// Store active sessions
const sessions = new Map();

// Proxy endpoint to fetch and modify web pages
app.get('/proxy', async (req, res) => {
  const { url, sessionId } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    // Fetch the webpage
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Parse and modify the HTML
    const $ = cheerio.load(response.data);
    
    // Inject our co-browsing script
    const cobrowisingScript = `
      <script>
        window.COBROWSING_SESSION_ID = '${sessionId}';
        window.COBROWSING_SERVER = '${req.protocol}://${req.get('host')}';
      </script>
      <script src="/cobrowsing-client.js"></script>
    `;
    
    // Add to head
    $('head').append(cobrowisingScript);
    
    // Make all links and forms work within the iframe
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        $(el).attr('href', `#`);
        $(el).attr('data-original-href', href);
        $(el).addClass('cobrowsing-link');
      }
    });
    
    $('form').each((i, el) => {
      $(el).addClass('cobrowsing-form');
    });

    res.send($.html());
  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(500).json({ error: 'Failed to fetch webpage: ' + error.message });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-session', (data) => {
    const { sessionId, role, userName } = data;
    
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        id: sessionId,
        teacher: null,
        students: [],
        currentUrl: null,
        interactions: []
      });
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

  socket.on('navigate-to', (data) => {
    const { url } = data;
    if (socket.role !== 'teacher') {
      socket.emit('error', 'Only teachers can navigate');
      return;
    }

    const session = sessions.get(socket.sessionId);
    if (session) {
      session.currentUrl = url;
      // Broadcast to all users in the session
      io.to(socket.sessionId).emit('navigate', { url });
    }
  });

  socket.on('interaction', (data) => {
    if (socket.role !== 'teacher') {
      return; // Only teacher interactions are synchronized
    }

    const session = sessions.get(socket.sessionId);
    if (session) {
      // Store the interaction
      session.interactions.push({
        ...data,
        timestamp: Date.now()
      });

      // Broadcast to students only
      socket.to(socket.sessionId).emit('sync-interaction', data);
    }
  });

  socket.on('disconnect', () => {
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