(() => {
  'use strict';
  const socket = io({ transports: ['websocket', 'polling'] });
  const $ = (id) => document.getElementById(id);
  const lobby = $('lobby'), chat = $('chat'), findBtn = $('find-btn'), leaveBtn = $('leave-btn');
  const status = $('status'), messages = $('messages'), empty = $('empty');
  const input = $('message-input'), sendBtn = $('send-btn'), gallery = $('gallery-input');
  const cameraBtn = $('camera-btn'), cameraVideo = $('camera-video'), cameraOverlay = $('camera-overlay');
  const captureBtn = $('capture-photo-btn'), switchBtn = $('switch-camera-btn'), closeCameraBtn = $('close-camera-btn');
  const canvas = $('camera-canvas'), preview = $('preview'), previewImg = $('preview-img'), cancelPhoto = $('cancel-photo');
  const toast = $('toast');
  let roomId = null, cameraStream = null, facingMode = 'user', pendingImage = null, connecting = false;

  function showToast(text) { toast.textContent = text; toast.classList.add('show'); clearTimeout(showToast.t); showToast.t = setTimeout(() => toast.classList.remove('show'), 3000); }
  function showScreen(which) { lobby.classList.toggle('active', which === 'lobby'); chat.classList.toggle('active', which === 'chat'); }
  function setStatus(text) { status.textContent = text; }
  function scrollBottom() { messages.scrollTop = messages.scrollHeight; }
  function addMessage(msg) {
    empty.style.display = 'none';
    const wrap = document.createElement('div'); wrap.className = 'msg' + (msg.senderId === socket.id ? ' me' : '');
    if (msg.type === 'image' && msg.image) {
      const img = document.createElement('img'); img.src = msg.image; img.alt = 'Foto ricevuta'; img.loading = 'lazy';
      img.addEventListener('click', () => window.open(msg.image, '_blank', 'noopener'));
      wrap.appendChild(img);
    } else {
      wrap.appendChild(document.createTextNode(msg.text || ''));
    }
    const time = document.createElement('div'); time.className = 'time'; time.textContent = new Date(msg.createdAt || Date.now()).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'}); wrap.appendChild(time);
    messages.appendChild(wrap); scrollBottom();
  }

  socket.on('connect', () => { findBtn.disabled = false; setStatus('Pronto'); });
  socket.on('disconnect', () => { if (roomId) $('partner-status').textContent = 'connessione interrotta'; setStatus('Connessione persa'); });
  socket.on('waiting', () => { connecting = false; setStatus('Sto cercando qualcuno...'); findBtn.disabled = true; });
  socket.on('partner_found', ({ roomId: id }) => {
    roomId = id; connecting = false; findBtn.disabled = false; setStatus('Partner trovato');
    messages.innerHTML = ''; messages.appendChild(empty); empty.style.display = 'block';
    $('partner-status').textContent = 'partner connesso'; showScreen('chat');
  });
  socket.on('receive_message', addMessage);
  socket.on('partner_left', () => { showToast('L’altra persona ha lasciato la chat.'); roomId = null; stopCamera(); showScreen('lobby'); setStatus('La chat è terminata.'); findBtn.disabled = false; });
  socket.on('left_chat', () => { roomId = null; showScreen('lobby'); findBtn.disabled = false; });

  findBtn.addEventListener('click', () => { if (connecting || !socket.connected) return; connecting = true; setStatus('Cerco una persona...'); socket.emit('find_partner'); });
  leaveBtn.addEventListener('click', () => { stopCamera(); socket.emit('leave_chat'); roomId = null; showScreen('lobby'); setStatus('Pronto'); });

  function sendText() {
    if (!roomId) return showToast('Prima trova una persona.');
    const text = input.value.trim(); if (!text) return;
    socket.emit('send_message', { roomId, type: 'text', text }); input.value = ''; input.style.height = 'auto';
  }
  function sendImage(dataUrl) {
    if (!roomId) return showToast('Prima trova una persona.');
    if (!dataUrl) return;
    socket.emit('send_message', { roomId, type: 'image', image: dataUrl });
    clearPendingImage();
  }
  sendBtn.addEventListener('click', sendText);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; });

  async function openCamera() {
    stopCamera();
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
      cameraVideo.srcObject = cameraStream;
      cameraOverlay.classList.add('show'); cameraOverlay.setAttribute('aria-hidden', 'false');
      await cameraVideo.play().catch(() => {});
    } catch (err) {
      console.error(err); showToast('Impossibile aprire la fotocamera. Controlla i permessi del browser.'); stopCamera();
    }
  }
  function stopCamera() {
    if (cameraStream) { cameraStream.getTracks().forEach(track => track.stop()); cameraStream = null; }
    cameraVideo.pause(); cameraVideo.srcObject = null;
    cameraOverlay.classList.remove('show'); cameraOverlay.setAttribute('aria-hidden', 'true');
  }
  async function switchCamera() { facingMode = facingMode === 'user' ? 'environment' : 'user'; await openCamera(); }
  function capturePhoto() {
    if (!cameraStream || !cameraVideo.videoWidth) return showToast('Fotocamera non pronta.');
    const max = 1280, scale = Math.min(1, max / cameraVideo.videoWidth);
    canvas.width = Math.round(cameraVideo.videoWidth * scale); canvas.height = Math.round(cameraVideo.videoHeight * scale);
    const ctx = canvas.getContext('2d', { alpha: false }); ctx.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return showToast('Errore nella foto.');
      const reader = new FileReader(); reader.onload = () => { pendingImage = reader.result; previewImg.src = pendingImage; preview.classList.add('show'); stopCamera(); };
      reader.readAsDataURL(blob);
    }, 'image/jpeg', 0.62);
  }
  function clearPendingImage() { pendingImage = null; previewImg.removeAttribute('src'); preview.classList.remove('show'); gallery.value = ''; }
  cameraBtn.addEventListener('click', openCamera); closeCameraBtn.addEventListener('click', stopCamera); switchBtn.addEventListener('click', switchCamera); captureBtn.addEventListener('click', capturePhoto);
  cancelPhoto.addEventListener('click', clearPendingImage);
  preview.addEventListener('click', (e) => { if (e.target === previewImg) sendImage(pendingImage); });

  gallery.addEventListener('change', () => {
    const file = gallery.files && gallery.files[0]; if (!file) return;
    if (!file.type.startsWith('image/')) return showToast('Seleziona un’immagine.');
    compressFile(file).then(data => { pendingImage = data; previewImg.src = data; preview.classList.add('show'); }).catch(() => showToast('Errore nella foto.'));
  });
  function compressFile(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); const max = 1280, scale = Math.min(1, max / img.width); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale); const ctx = canvas.getContext('2d', {alpha:false}); ctx.drawImage(img,0,0,canvas.width,canvas.height); canvas.toBlob(blob => { if (!blob) return reject(new Error('blob')); const r = new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(blob); }, 'image/jpeg', .62); };
      img.onerror = reject; img.src = url;
    });
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });
  window.addEventListener('pagehide', stopCamera); window.addEventListener('beforeunload', stopCamera);
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(console.warn));
})();
