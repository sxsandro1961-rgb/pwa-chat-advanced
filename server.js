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
    console.log(`[+] Utente connesso: ${socket.id}`);

    // Gestione ricerca partner
    socket.on('find_partner', () => {
        // Se l'utente è già in coda, evitiamo duplicati
        if (waitingQueue.includes(socket.id)) return;

        // Se c'è un altro utente in attesa
        if (waitingQueue.length > 0) {
            const partnerId = waitingQueue.shift();
            const roomId = `room_${socket.id}_${partnerId}`;

            // Fai entrare entrambi nella stanza di chat
            socket.join(roomId);
            const partnerSocket = io.sockets.sockets.get(partnerId);

            if (partnerSocket) {
                partnerSocket.join(roomId);

                // Salva le informazioni sulla stanza per entrambi
                socket.roomId = roomId;
                partnerSocket.roomId = roomId;

                // Notifica entrambi i client
                io.to(roomId).emit('peer_connected');
                console.log(`[=] Stanza creata: ${roomId}`);
            } else {
                // Se il partner si è disconnesso prima dell'abbinamento, rimetti l'utente corrente in coda
                waitingQueue.push(socket.id);
            }
        } else {
            // Nessun utente disponibile: metti questo socket in coda
            waitingQueue.push(socket.id);
            console.log(`[...] Utente ${socket.id} aggiunto alla coda.`);
        }
    });

    // Inoltro messaggi
    socket.on('send_message', (data) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('receive_message', data);
        }
    });

    // Indicatore "Sta scrivendo..."
    socket.on('typing', (isTyping) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('partner_typing', isTyping);
        }
    });

    // Abbandono stanza / Tasto "Prossimo" / Annulla ricerca
    socket.on('leave_room', () => {
        // Se l'utente stava ancora aspettando un partner, rimuovilo dalla coda
        waitingQueue = waitingQueue.filter(id => id !== socket.id);
        leaveCurrentRoom(socket);
    });

    // Gestione disconnessione improvvisa
    socket.on('disconnect', () => {
        console.log(`[-] Utente disconnesso: ${socket.id}`);
        // Rimuovi dalla coda se era in attesa
        waitingQueue = waitingQueue.filter(id => id !== socket.id);
        // Gestisci l'uscita dalla stanza se era in chat
        leaveCurrentRoom(socket);
    });

    // Funzione ausiliaria per uscire dalla stanza
    function leaveCurrentRoom(sock) {
        if (sock.roomId) {
            sock.to(sock.roomId).emit('peer_disconnected');
            sock.leave(sock.roomId);
            sock.roomId = null;
        }
    }
});

// Porta del server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server in esecuzione sulla porta ${PORT}`);
});