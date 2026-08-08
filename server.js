const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 12e6
});

app.use(cors());
app.use(express.static(__dirname));
app.get('/health', (_req, res) => res.json({ ok: true }));

const waitingQueue = [];
const roomsBySocket = new Map();

function removeFromQueue(socketId) {
  const i = waitingQueue.indexOf(socketId);
  if (i !== -1) waitingQueue.splice(i, 1);
}

function leaveRoom(socket) {
  const roomId = roomsBySocket.get(socket.id);
  if (!roomId) return;
  socket.to(roomId).emit('partner_left');
  socket.leave(roomId);
  roomsBySocket.delete(socket.id);
}

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id}`);

  socket.on('find_partner', () => {
    removeFromQueue(socket.id);
    leaveRoom(socket);

    let partnerId = null;
    while (waitingQueue.length && !partnerId) {
      const candidate = waitingQueue.shift();
      if (candidate !== socket.id && io.sockets.sockets.has(candidate)) partnerId = candidate;
    }

    if (!partnerId) {
      waitingQueue.push(socket.id);
      socket.emit('waiting');
      return;
    }

    const roomId = `room_${socket.id}_${partnerId}`;
    const partner = io.sockets.sockets.get(partnerId);
    socket.join(roomId);
    partner.join(roomId);
    roomsBySocket.set(socket.id, roomId);
    roomsBySocket.set(partnerId, roomId);

    socket.emit('partner_found', { roomId });
    partner.emit('partner_found', { roomId });
  });

  socket.on('send_message', (payload = {}) => {
    const roomId = roomsBySocket.get(socket.id);
    if (!roomId || payload.roomId !== roomId) return;

    const type = payload.type === 'image' || payload.type === 'file' ? payload.type : 'text';
    const data = typeof payload.data === 'string' ? payload.data : '';

    const message = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      senderId: socket.id,
      type,
      text: typeof payload.text === 'string' ? payload.text.slice(0, 4000) : '',
      data: data || null,
      name: typeof payload.name === 'string' ? payload.name.slice(0, 255) : '',
      mime: typeof payload.mime === 'string' ? payload.mime.slice(0, 120) : '',
      createdAt: new Date().toISOString()
    };

    if (message.type === 'text' && !message.text.trim()) return;
    if ((message.type === 'image' || message.type === 'file') && !message.data) return;

    // Limite server-side: evita payload arbitrariamente grandi.
    if (message.data && message.data.length > 11_000_000) return;

    io.to(roomId).emit('receive_message', message);
  });

  socket.on('leave_chat', () => {
    removeFromQueue(socket.id);
    leaveRoom(socket);
    socket.emit('left_chat');
  });

  socket.on('disconnect', () => {
    removeFromQueue(socket.id);
    leaveRoom(socket);
    console.log(`[-] ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Pausa Caffè in ascolto sulla porta ${PORT}`);
});
