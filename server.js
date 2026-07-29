const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins (required for WordPress)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
}));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy', 
        message: 'WebRTC signaling server is running',
        timestamp: new Date().toISOString()
    });
});

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
});

// In-memory room storage
const rooms = new Map();

// Socket.IO connection handler
io.on('connection', (socket) => {
    console.log(`🔵 User connected: ${socket.id}`);

    // Join a room
    socket.on('join-room', ({ roomId, userId }) => {
        if (!roomId || !userId) {
            socket.emit('error', { message: 'Missing roomId or userId' });
            return;
        }

        console.log(`👤 User ${userId} joining room ${roomId}`);
        socket.join(roomId);
        socket.userId = userId;
        socket.roomId = roomId;

        // Create room if it doesn't exist
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(userId);

        // Send current participants to the new user
        const participants = Array.from(rooms.get(roomId));
        socket.emit('room-participants', { participants });

        // Notify others
        socket.to(roomId).emit('user-connected', { 
            userId, 
            participantCount: rooms.get(roomId).size 
        });

        console.log(`📊 Room ${roomId} now has ${rooms.get(roomId).size} participants`);
    });

    // Handle WebRTC signaling
    socket.on('signal-data', ({ toUserId, signal, type }) => {
        if (!socket.roomId) return;
        
        socket.to(socket.roomId).emit('signal-data', {
            fromUserId: socket.userId,
            toUserId,
            signal,
            type
        });
    });

    // Handle chat messages
    socket.on('chat-message', ({ message, username }) => {
        if (!socket.roomId || !message) return;
        
        socket.to(socket.roomId).emit('chat-message', {
            userId: socket.userId,
            username: username || 'Anonymous',
            message,
            timestamp: Date.now()
        });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`🔴 User disconnected: ${socket.id}`);
        
        if (socket.roomId && socket.userId) {
            const room = rooms.get(socket.roomId);
            if (room) {
                room.delete(socket.userId);
                socket.to(socket.roomId).emit('user-disconnected', { 
                    userId: socket.userId,
                    participantCount: room.size
                });
                
                // Clean up empty rooms
                if (room.size === 0) {
                    rooms.delete(socket.roomId);
                    console.log(`🗑️ Room ${socket.roomId} deleted (empty)`);
                }
            }
        }
    });

    // Handle leave room
    socket.on('leave-room', () => {
        if (socket.roomId && socket.userId) {
            const room = rooms.get(socket.roomId);
            if (room) {
                room.delete(socket.userId);
                socket.to(socket.roomId).emit('user-disconnected', { 
                    userId: socket.userId,
                    participantCount: room.size
                });
                socket.leave(socket.roomId);
            }
        }
    });
});

// Start the server
server.listen(PORT, () => {
    console.log(`🚀 Signaling server running on port ${PORT}`);
    console.log(`📡 WebSocket ready for connections`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, closing server...');
    io.close(() => {
        server.close(() => {
            console.log('✅ Server closed');
            process.exit(0);
        });
    });
});
