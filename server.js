const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static(__dirname)); // Serve index.html dalla stessa cartella/URL del backend

const server = http.createServer(app);

// Configurazione Socket.io con CORS abilitato
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Coda degli utenti in attesa di un partner
let waitingQueue = [];

io.on('connection', (socket) => {
    console.log(`[+] Utente connesso: \${socket.id}`);
    console.log(`[DEBUG] Utenti connessi totali: \${io.sockets.sockets.size}`);
    console.log(`[DEBUG] Coda di attesa attuale: ${waitingQueue.length} utenti`);

    // Gestione ricerca partner
    socket.on('find_partner', () => {
        console.log(`[DEBUG] Utente ${socket.id} cerca partner. Coda attuale: ${waitingQueue.length}`);
        
        // Se l'utente è già in coda, evitiamo duplicati
        if (waitingQueue.includes(socket.id)) {
            console.log(`[DEBUG] Utente ${socket.id} già in coda, ignoro richiesta`);
            return;
        }

        // Se c'è un altro utente in attesa
        if (waitingQueue.length > 0) {
            const partnerId = waitingQueue.shift();
            console.log(`[DEBUG] Trovato partner ${partnerId} per ${socket.id}`);
            const roomId = `room_${socket.id}_${partnerId}`;

            // Fai entrare entrambi nella stanza di chat
            socket.join(roomId);
            const partnerSocket = io.sockets.sockets.get(partnerId);

            if (partnerSocket) {
                partnerSocket.join(roomId);
