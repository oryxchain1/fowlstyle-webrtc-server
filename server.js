const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
}));

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy', 
        message: 'WebRTC signaling server is running' 
    });
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
});

const rooms = new Map();

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join-room', ({ roomId, userId }) => {
        if (!roomId || !userId) return;
        socket.join(roomId);
        socket.userId = userId;
        socket.roomId = roomId;

        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(userId);

        socket.to(roomId).emit('user-connected', { userId });
        socket.emit('room-participants', { participants: Array.from(rooms.get(roomId)) });
    });

    socket.on('signal-data', ({ toUserId, signal, type }) => {
        socket.to(socket.roomId).emit('signal-data', {
            fromUserId: socket.userId,
            signal,
            type
        });
    });

    socket.on('disconnect', () => {
        if (socket.roomId && socket.userId) {
            rooms.get(socket.roomId)?.delete(socket.userId);
            socket.to(socket.roomId).emit('user-disconnected', { userId: socket.userId });
        }
    });
});

server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
