const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { Server } = require('socket.io');
const LiveSession = require('./models/LiveSession');

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const courseRoutes = require('./routes/courses');
const enrollmentRoutes = require('./routes/enrollments');
const assignmentRoutes = require('./routes/assignments');
const submissionRoutes = require('./routes/submissions');
const attendanceRoutes = require('./routes/attendance');
const gradeRoutes = require('./routes/grades');
const messageRoutes = require('./routes/messages');
const notificationRoutes = require('./routes/notifications');
const analyticsRoutes = require('./routes/analytics');
const uploadRoutes = require('./routes/upload');
const appealRoutes = require('./routes/appeals');
const liveSessionRoutes = require('./routes/liveSession');

const app = express();
const server = http.createServer(app);

// ─── Socket.io Setup ─────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// In-memory room tracking: Map<classId, Map<socketId, { userId, name, role }>>
const rooms = new Map();

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/grades', gradeRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/appeals', appealRoutes);
app.use('/api/live-sessions', liveSessionRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    message: 'Server is running!',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// ─── Socket.io Signaling for Live Classes ─────────────────────────────

function getUsername(socketId) {
  for (const [, room] of rooms.entries()) {
    if (room.has(socketId)) return room.get(socketId).name;
  }
  return 'Unknown';
}

function getUserRole(socketId) {
  for (const [, room] of rooms.entries()) {
    if (room.has(socketId)) return room.get(socketId).role;
  }
  return 'student';
}

function broadcastParticipants(classId) {
  const room = rooms.get(classId);
  if (!room) return;
  const participants = [];
  room.forEach((userData, socketId) => {
    participants.push({ socketId, ...userData });
  });
  io.to(classId).emit('participants-update', participants);
}

io.on('connection', (socket) => {
  console.log(`✅ Socket connected: ${socket.id}`);

  // ── Create Room (Instructor) ──────────────────────────────
  socket.on('create-room', async ({ classId, userId, name, role }) => {
    console.log(`📺 Room created: ${classId} by ${name} (${userId})`);
    socket.join(classId);

    if (!rooms.has(classId)) {
      rooms.set(classId, new Map());
    }

    const room = rooms.get(classId);

    // Remove any existing connection for this userId in this room
    room.forEach((data, sid) => {
      if (data.userId === userId && sid !== socket.id) {
        room.delete(sid);
        io.to(sid).emit('session-ended'); // Force logout old tab
      }
    });

    room.set(socket.id, { userId, name, role: role || 'instructor' });

    try {
      await LiveSession.findOneAndUpdate({ classId }, { status: 'live' });
    } catch (err) {
      console.error('DB update error:', err);
    }

    socket.emit('room-created', { classId });
    broadcastParticipants(classId);
  });

  // ── Join Room (Student) ───────────────────────────────────
  socket.on('join-room', async ({ classId, userId, name, role }) => {
    console.log(`👤 ${name} (${userId}) joining room: ${classId}`);

    const room = rooms.get(classId);
    if (!room) {
      socket.emit('room-error', { message: 'Room not found. The instructor may not have started the class yet.' });
      return;
    }

    // Remove any existing connection for this userId in this room
    room.forEach((data, sid) => {
      if (data.userId === userId && sid !== socket.id) {
        room.delete(sid);
      }
    });

    socket.join(classId);
    room.set(socket.id, { userId, name, role: role || 'student' });

    try {
      await LiveSession.findOneAndUpdate(
        { classId },
        { $push: { participants: { userId: userId || socket.id, name, role: role || 'student', joinedAt: new Date() } } }
      );
    } catch (err) {
      console.error('DB update error:', err);
    }

    // Send existing users to the new joiner
    const usersInRoom = [];
    room.forEach((userData, sid) => {
      if (sid !== socket.id) {
        usersInRoom.push({ socketId: sid, ...userData });
      }
    });
    socket.emit('all-users', usersInRoom);

    // Notify existing users
    socket.to(classId).emit('user-joined', {
      signal: null,
      callerID: socket.id,
      callerName: name,
      callerRole: role || 'student',
      callerUserId: userId // Add this
    });

    broadcastParticipants(classId);
  });

  // ── WebRTC Signaling ──────────────────────────────────────
  socket.on('send-signal', ({ userToSignal, callerID, signal }) => {
    // We need to find the sender's info to pass their name/role/userId
    let senderInfo = { name: 'Unknown', role: 'student', userId: null };
    for (const [cid, room] of rooms.entries()) {
      if (room.has(socket.id)) {
        senderInfo = room.get(socket.id);
        break;
      }
    }

    io.to(userToSignal).emit('user-joined', {
      signal,
      callerID,
      callerName: senderInfo.name,
      callerRole: senderInfo.role,
      callerUserId: senderInfo.userId
    });
  });

  socket.on('returning-signal', ({ signal, callerID }) => {
    io.to(callerID).emit('receiving-returned-signal', {
      signal,
      id: socket.id
    });
  });

  // ── Chat ──────────────────────────────────────────────────
  socket.on('chat-message', async ({ classId, message, senderName, senderId }) => {
    const chatMsg = {
      senderId: senderId || socket.id,
      senderName: senderName || 'Anonymous',
      message,
      timestamp: new Date()
    };
    io.to(classId).emit('chat-message', chatMsg);

    try {
      await LiveSession.findOneAndUpdate(
        { classId },
        { $push: { chatMessages: chatMsg } }
      );
    } catch (err) {
      console.error('Chat save error:', err);
    }
  });

  // ── Disconnect ────────────────────────────────────────────
  socket.on('disconnect', async () => {
    console.log(`❌ Socket disconnected: ${socket.id}`);

    for (const [classId, room] of rooms.entries()) {
      if (room.has(socket.id)) {
        const userData = room.get(socket.id);
        room.delete(socket.id);

        socket.to(classId).emit('user-disconnected', socket.id);

        try {
          await LiveSession.findOneAndUpdate(
            { classId, 'participants.userId': userData.userId },
            { $set: { 'participants.$.leftAt': new Date() } }
          );
        } catch (err) {
          console.error('DB disconnect error:', err);
        }

        broadcastParticipants(classId);

        if (room.size === 0) {
          rooms.delete(classId);
          try {
            await LiveSession.findOneAndUpdate({ classId }, { status: 'ended', endedAt: new Date() });
          } catch (err) {
            console.error('DB room cleanup error:', err);
          }
        }
        break;
      }
    }
  });
});

// ─── Connect to MongoDB ───────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not defined in environment variables.');
  console.error('Please make sure you have a .env file with MONGODB_URI or set it in your hosting platform.');
} else {
  mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
    .then(() => {
      console.log('Connected to MongoDB');
      // console.log('Database URI:', MONGODB_URI); // Commented out for security in logs

      // Start server (using http server for Socket.io)
      const PORT = process.env.PORT || 5000;
      if (require.main === module) {
        server.listen(PORT, () => {
          console.log(`🚀 Server running on port ${PORT}`);
          console.log(`🔌 Socket.io ready for live class connections`);
          console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
          if (process.env.NODE_ENV === 'development') {
            console.log('To create admin user, run: npm run create-admin');
          }
        });
      }
    })
    .catch((error) => {
      console.error('MongoDB connection error:', error);
      // Remove process.exit(1) to prevent serverless function crash
    });
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log('Unhandled Promise Rejection:', err.message);
});

// Export the app for Vercel
module.exports = app;
