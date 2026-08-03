// Service worker minimo: necessario perché il browser consideri l'app "installabile".
// Non mette in cache nulla di sensibile: la chat resta sempre live dal server.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

// Passa tutte le richieste direttamente alla rete (nessuna cache dei messaggi/immagini)
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
