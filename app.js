(() => {
  'use strict';

  const socket = io({ transports: ['websocket', 'polling'] });
  const $ = (id) => document.getElementById(id);

  const lobby = $('lobby'), chat = $('chat'), findBtn = $('find-btn'), leaveBtn = $('leave-btn');
  const status = $('status'), messages = $('messages'), empty = $('empty');
  const input = $('message-input'), sendBtn = $('send-btn'), gallery = $('gallery-input');
  const cameraBtn = $('camera-btn'), cameraVideo = $('camera-video'), cameraOverlay = $('camera-overlay');
  const captureBtn = $('capture-photo-btn'), switchBtn = $('switch-camera-btn'), closeCameraBtn = $('close-camera-btn');
  const canvas = $('camera-canvas'), preview = $('preview'), previewImg = $('preview-img'), previewName = $('preview-name');
  const cancelPhoto = $('cancel-photo'), toast = $('toast');

  let roomId = null, cameraStream = null, facingMode = 'user';
  let pendingAttachment = null, connecting = false;

  function showToast(text) {
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  function showScreen(which) {
    lobby.classList.toggle('active', which === 'lobby');
    chat.classList.toggle('active', which === 'chat');
  }

  function setStatus(text) { status.textContent = text; }
  function scrollBottom() { messages.scrollTop = messages.scrollHeight; }

  function addMessage(msg) {
    empty.style.display = 'none';
    const wrap = document.createElement('div');
    wrap.className = 'msg' + (msg.senderId === socket.id ? ' me' : '');

    if (msg.type === 'image' && msg.data) {
      const img = document.createElement('img');
      img.src = msg.data;
      img.alt = 'Foto ricevuta';
      img.loading = 'lazy';
      img.addEventListener('click', () => window.open(msg.data, '_blank', 'noopener'));
      wrap.appendChild(img);
    } else if (msg.type === 'file' && msg.data) {
      const link = document.createElement('a');
      link.href = msg.data;
      link.download = msg.name || 'file';
      link.textContent = '📎 ' + (msg.name || 'File');
      link.className = 'attachment-link';
      wrap.appendChild(link);
    } else {
      wrap.appendChild(document.createTextNode(msg.text || ''));
    }

    const time = document.createElement('div');
    time.className = 'time';
    time.textContent = new Date(msg.createdAt || Date.now()).toLocaleTimeString('it-IT', {
      hour: '2-digit', minute: '2-digit'
    });
    wrap.appendChild(time);
    messages.appendChild(wrap);
    scrollBottom();
  }

  socket.on('connect', () => {
    findBtn.disabled = false;
    setStatus('Pronto');
  });

  socket.on('connect_error', (err) => {
    console.error('Socket error:', err);
    setStatus('Errore di connessione');
    showToast('Connessione al server non riuscita.');
  });

  socket.on('disconnect', () => {
    if (roomId) $('partner-status').textContent = 'connessione interrotta';
    setStatus('Connessione persa');
  });

  socket.on('waiting', () => {
    connecting = false;
    setStatus('Sto cercando qualcuno...');
    findBtn.disabled = true;
  });

  socket.on('partner_found', ({ roomId: id }) => {
    roomId = id;
    connecting = false;
    findBtn.disabled = false;
    messages.innerHTML = '';
    messages.appendChild(empty);
    empty.style.display = 'block';
    $('partner-status').textContent = 'partner connesso';
    showScreen('chat');
  });

  socket.on('receive_message', addMessage);

  socket.on('partner_left', () => {
    showToast('L’altra persona ha lasciato la chat.');
    roomId = null;
    stopCamera();
    clearPendingAttachment();
    showScreen('lobby');
    setStatus('La chat è terminata.');
    findBtn.disabled = false;
  });

  socket.on('left_chat', () => {
    roomId = null;
    clearPendingAttachment();
    showScreen('lobby');
    findBtn.disabled = false;
  });

  findBtn.addEventListener('click', () => {
    if (connecting || !socket.connected) return;
    connecting = true;
    setStatus('Cerco una persona...');
    socket.emit('find_partner');
  });

  leaveBtn.addEventListener('click', () => {
    stopCamera();
    clearPendingAttachment();
    socket.emit('leave_chat');
    roomId = null;
    showScreen('lobby');
    setStatus('Pronto');
  });

  function sendText() {
    if (!roomId) return showToast('Prima trova una persona.');
    const text = input.value.trim();
    if (!text) return;
    socket.emit('send_message', { roomId, type: 'text', text });
    input.value = '';
    input.style.height = 'auto';
  }

  function sendAttachment() {
    if (!roomId) return showToast('Prima trova una persona.');
    if (!pendingAttachment) return false;

    socket.emit('send_message', {
      roomId,
      type: pendingAttachment.type,
      data: pendingAttachment.data,
      name: pendingAttachment.name || '',
      mime: pendingAttachment.mime || ''
    });

    clearPendingAttachment();
    return true;
  }

  // IMPORTANT: il pulsante INVIA ora invia prima foto/file, se presenti.
  sendBtn.addEventListener('click', () => {
    if (pendingAttachment) {
      sendAttachment();
    } else {
      sendText();
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (pendingAttachment) sendAttachment();
      else sendText();
    }
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  async function openCamera() {
    stopCamera();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return showToast('La fotocamera non è disponibile in questo browser.');
    }

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false
      });
      cameraVideo.srcObject = cameraStream;
      cameraOverlay.classList.add('show');
      cameraOverlay.setAttribute('aria-hidden', 'false');
      await cameraVideo.play().catch(() => {});
    } catch (err) {
      console.error(err);
      showToast('Impossibile aprire la fotocamera. Controlla i permessi.');
      stopCamera();
    }
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    cameraVideo.pause();
    cameraVideo.srcObject = null;
    cameraOverlay.classList.remove('show');
    cameraOverlay.setAttribute('aria-hidden', 'true');
  }

  async function switchCamera() {
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    await openCamera();
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function capturePhoto() {
    if (!cameraStream || !cameraVideo.videoWidth) {
      return showToast('Fotocamera non pronta.');
    }

    const max = 1280;
    const scale = Math.min(1, max / cameraVideo.videoWidth);
    canvas.width = Math.round(cameraVideo.videoWidth * scale);
    canvas.height = Math.round(cameraVideo.videoHeight * scale);

    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) return showToast('Errore nella foto.');

      try {
        const data = await blobToDataURL(blob);
        setPendingAttachment({
          type: 'image',
          data,
          name: 'foto.jpg',
          mime: 'image/jpeg'
        });
        stopCamera();
      } catch (err) {
        console.error(err);
        showToast('Errore nella preparazione della foto.');
      }
    }, 'image/jpeg', 0.62);
  }

  cameraBtn.addEventListener('click', openCamera);
  closeCameraBtn.addEventListener('click', stopCamera);
  switchBtn.addEventListener('click', switchCamera);
  captureBtn.addEventListener('click', capturePhoto);

  function setPendingAttachment(att) {
    pendingAttachment = att;

    if (att.type === 'image') {
      previewImg.src = att.data;
      previewImg.style.display = 'block';
    } else {
      previewImg.removeAttribute('src');
      previewImg.style.display = 'none';
    }

    previewName.textContent = att.name || 'File pronto per l’invio';
    preview.classList.add('show');
  }

  function clearPendingAttachment() {
    pendingAttachment = null;
    previewImg.removeAttribute('src');
    previewImg.style.display = 'block';
    previewName.textContent = 'File pronto per l’invio';
    preview.classList.remove('show');
    gallery.value = '';
  }

  cancelPhoto.addEventListener('click', clearPendingAttachment);

  // Galleria: immagini compresse. Altri file: inviati come allegato.
  gallery.addEventListener('change', async () => {
    const file = gallery.files && gallery.files[0];
    if (!file) return;

    const MAX_FILE_SIZE = 8 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      gallery.value = '';
      return showToast('File troppo grande. Massimo 8 MB.');
    }

    try {
      if (file.type.startsWith('image/')) {
        const data = await compressFile(file);
        setPendingAttachment({
          type: 'image',
          data,
          name: file.name || 'foto.jpg',
          mime: 'image/jpeg'
        });
      } else {
        const data = await blobToDataURL(file);
        setPendingAttachment({
          type: 'file',
          data,
          name: file.name,
          mime: file.type || 'application/octet-stream'
        });
      }
    } catch (err) {
      console.error(err);
      showToast('Errore nella preparazione del file.');
    }
  });

  function compressFile(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        const max = 1280;
        const scale = Math.min(1, max / img.width);
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));

        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(async (blob) => {
          if (!blob) return reject(new Error('Impossibile creare JPEG'));
          try {
            resolve(await blobToDataURL(blob));
          } catch (err) {
            reject(err);
          }
        }, 'image/jpeg', 0.62);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Immagine non leggibile'));
      };

      img.src = url;
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCamera();
  });

  window.addEventListener('pagehide', stopCamera);
  window.addEventListener('beforeunload', stopCamera);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(console.warn);
    });
  }
})();
