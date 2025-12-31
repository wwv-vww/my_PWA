window.Chat = (() => {
  const state = {
    accessToken: '',
    userId: '',
    roomId: '',
    lastSyncToken: '',
    messages: [],
    syncTimer: null,
    isTyping: false,
    editMode: null,
    editText: ''
  };

  const $ = (id) => document.getElementById(id);

  const playNotificationSound = () => {
    try {
      const audio = new Audio('./chat/assets/ping.mp3');
      audio.volume = 0.5;
      audio.play().catch(e => console.log('Sound blocked:', e));
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  };

  const showDesktopNotification = (sender, body) => {
    if (Notification.permission !== 'granted') return;
    
    const senderName = sender === state.userId ? 'Ви' : (sender?.split(':')[0]?.substring(1) || 'Користувач');
    const shortBody = body.length > 100 ? body.substring(0, 97) + '...' : body;
    
    const options = {
      body: shortBody,
      icon: './chat/assets/icon.png',
      tag: 'matrix-chat',
      renotify: true
    };

    try {
      const notification = new Notification(senderName, options);
      
      setTimeout(() => notification.close(), 5000);
      
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  };

  const showError = (message) => {
    const errorEl = $('chat-error');
    if (!errorEl) return;

    if (message) {
      errorEl.textContent = message;
      errorEl.style.display = 'flex';
      setTimeout(() => {
        errorEl.style.display = 'none';
      }, 5000);
    } else {
      errorEl.style.display = 'none';
    }
  };

  const renderUserInfo = () => {
    const userEl = $('chat-user-id');
    const roomEl = $('chat-room-id');

    if (userEl) {
      userEl.textContent = state.userId || '—';
    }

    if (roomEl) {
      roomEl.textContent = state.roomId ? state.roomId.substring(0, 20) + '...' : 'Не обрано';
      
      if (state.roomId) {
        roomEl.title = `Клікніть для копіювання: ${state.roomId}`;
        roomEl.onclick = async () => {
          try {
            await navigator.clipboard.writeText(state.roomId);
            roomEl.style.background = 'rgba(255, 255, 255, 0.4)';
            setTimeout(() => {
              roomEl.style.background = '';
            }, 300);
          } catch (err) {
            console.error('Copy failed:', err);
          }
        };
      } else {
        roomEl.title = '';
        roomEl.onclick = null;
      }
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('uk-UA', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const startEdit = (messageId, currentBody) => {
    state.editMode = messageId;
    state.editText = currentBody;
    
    setTimeout(() => {
      const textarea = document.querySelector(`[data-edit-id="${messageId}"] textarea`);
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
    }, 10);
  };

  const cancelEdit = () => {
    state.editMode = null;
    state.editText = '';
    renderMessages();
  };

  const saveEdit = async (messageId) => {
    if (!state.editText.trim()) return;

    const message = state.editText.trim();
    const sendBtn = document.querySelector(`[data-save-id="${messageId}"]`);
    
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span>Збереження...</span>';
    }

    try {
      const result = await apiCall(`/rooms/${encodeURIComponent(state.roomId)}/send/m.room.message`, {
        method: 'POST',
        body: JSON.stringify({
          msgtype: 'm.text',
          body: message,
          "m.new_content": true,
          "m.relates_to": {
            rel_type: "m.replace",
            event_id: messageId
          }
        })
      });

      const msgIndex = state.messages.findIndex(msg => msg.id === messageId);
      if (msgIndex !== -1) {
        state.messages[msgIndex].body = message;
        state.messages[msgIndex].edited = true;
      }

      state.editMode = null;
      state.editText = '';
      renderMessages();
      
    } catch (error) {
      showError(`Помилка редагування: ${error.message}`);
    } finally {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<span>Зберегти</span>';
      }
    }
  };

  const deleteMessage = async (messageId) => {
    if (!confirm('Видалити повідомлення?')) return;

    try {
      await apiCall(`/rooms/${encodeURIComponent(state.roomId)}/redact/${messageId}`, {
        method: 'POST'
      });

      state.messages = state.messages.filter(msg => msg.id !== messageId);
      renderMessages();
      
    } catch (error) {
      showError(`Помилка видалення: ${error.message}`);
    }
  };

  const renderMessages = () => {
    const messagesEl = $('chat-messages');
    if (!messagesEl) return;

    if (state.messages.length === 0) {
      messagesEl.innerHTML = `
        <div class="chat__empty">
          ${state.roomId ? 'Немає повідомлень у цій кімнаті' : 'Оберіть кімнату для перегляду повідомлень'}
        </div>
      `;
      return;
    }

    messagesEl.innerHTML = state.messages.map(msg => {
      const isOwn = msg.sender === state.userId;
      const senderName = isOwn ? 'Ви' : (msg.displayName || msg.sender?.split(':')[0]?.substring(1) || 'Користувач');
      const isEditing = state.editMode === msg.id;
      
      return `
        <div class="chat__message ${isOwn ? 'chat__message--own' : 'chat__message--other'} ${isEditing ? 'chat__message--editing' : ''}">
          <div class="chat__message-header">
            <div class="chat__message-sender">${senderName}</div>
            ${isOwn ? `
              <div class="chat__message-actions">
                <button class="chat__message-action chat__message-action--edit" data-message-id="${msg.id}">
                  <span>✏️</span>
                </button>
                <button class="chat__message-action chat__message-action--delete" data-message-id="${msg.id}">
                  <span>🗑️</span>
                </button>
              </div>
            ` : ''}
          </div>
          
          ${isEditing ? `
            <div class="chat__edit-container" data-edit-id="${msg.id}">
              <textarea class="chat__edit-textarea" rows="3">${state.editText}</textarea>
              <div class="chat__edit-buttons">
                <button class="chat__edit-btn chat__edit-btn--save" data-save-id="${msg.id}">
                  <span>Зберегти</span>
                </button>
                <button class="chat__edit-btn chat__edit-btn--cancel">
                  <span>Скасувати</span>
                </button>
              </div>
            </div>
          ` : `
            <div class="chat__message-bubble">
              <div class="chat__message-text">${msg.body || ''}</div>
              <div class="chat__message-footer">
                <div class="chat__message-time">${formatTime(msg.timestamp || Date.now())}</div>
                ${msg.edited ? '<div class="chat__message-edited">(змінено)</div>' : ''}
              </div>
            </div>
          `}
        </div>
      `;
    }).join('');

    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    setupMessageEventListeners();
  };

  const setupMessageEventListeners = () => {
    const messagesEl = $('chat-messages');
    if (!messagesEl) return;

    messagesEl.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.chat__message-action--edit');
      const deleteBtn = e.target.closest('.chat__message-action--delete');
      const saveBtn = e.target.closest('.chat__edit-btn--save');
      const cancelBtn = e.target.closest('.chat__edit-btn--cancel');

      if (editBtn) {
        const messageId = editBtn.dataset.messageId;
        const message = state.messages.find(msg => msg.id === messageId);
        if (message) {
          startEdit(messageId, message.body);
        }
      }

      if (deleteBtn) {
        const messageId = deleteBtn.dataset.messageId;
        deleteMessage(messageId);
      }

      if (saveBtn) {
        const messageId = saveBtn.closest('.chat__edit-container').dataset.editId;
        saveEdit(messageId);
      }

      if (cancelBtn) {
        cancelEdit();
      }
    });

    messagesEl.addEventListener('keydown', (e) => {
      if (e.target.classList.contains('chat__edit-textarea')) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const messageId = e.target.closest('.chat__edit-container').dataset.editId;
          saveEdit(messageId);
        }
        
        if (e.key === 'Escape') {
          cancelEdit();
        }
      }
    });

    messagesEl.addEventListener('input', (e) => {
      if (e.target.classList.contains('chat__edit-textarea')) {
        state.editText = e.target.value;
      }
    });
  };

  const apiCall = async (path, options = {}) => {
    if (!state.accessToken) {
      throw new Error('Необхідна авторизація');
    }

    const url = `https://matrix.org/_matrix/client/r0${path}`;
    const config = {
      headers: {
        'Authorization': `Bearer ${state.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      
      return data;
    } catch (error) {
      console.error('API call failed:', error);
      throw error;
    }
  };

  const sendMessage = async () => {
    const inputEl = $('chat-input');
    const message = inputEl?.value.trim();

    if (!message) {
      showError('Введіть повідомлення');
      return;
    }

    if (!state.roomId) {
      showError('Оберіть кімнату для надсилання повідомлень');
      return;
    }

    const sendBtn = $('chat-send');
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span>Надсилання...</span><span>⏳</span>';

    try {
      const result = await apiCall(`/rooms/${encodeURIComponent(state.roomId)}/send/m.room.message`, {
        method: 'POST',
        body: JSON.stringify({
          msgtype: 'm.text',
          body: message
        })
      });

      if (inputEl) {
        inputEl.value = '';
        inputEl.style.height = 'auto';
      }

      state.messages.push({
        id: result.event_id,
        body: message,
        sender: state.userId,
        timestamp: Date.now()
      });
      
      renderMessages();
      
    } catch (error) {
      showError(`Помилка надсилання: ${error.message}`);
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<span>Надіслати</span><span>✈</span>';
    }
  };

  const fetchMessages = async () => {
    if (!state.accessToken || !state.roomId) {
      return;
    }

    try {
      console.log('Fetching messages for room:', state.roomId);
      
      const query = state.lastSyncToken 
        ? `?since=${encodeURIComponent(state.lastSyncToken)}&timeout=10000`
        : '?timeout=10000';

      const data = await apiCall(`/sync${query}`);

      if (data?.next_batch) {
        state.lastSyncToken = data.next_batch;
      }

      const roomData = data?.rooms?.join?.[state.roomId];
      if (roomData?.timeline?.events) {
        const newMessages = roomData.timeline.events
          .filter(event => 
            event.type === 'm.room.message' && 
            event.content?.body &&
            !state.messages.some(msg => msg.id === event.event_id)
          )
          .map(event => ({
            id: event.event_id,
            body: event.content.body,
            sender: event.sender,
            displayName: event.content?.displayname,
            timestamp: event.origin_server_ts,
            edited: event.content?.['m.new_content'] || false
          }));

        if (newMessages.length > 0) {
          state.messages = [...state.messages, ...newMessages];
          renderMessages();

          newMessages.forEach(msg => {
            if (msg.sender !== state.userId && (document.hidden || msg.sender !== state.userId)) {
              playNotificationSound();
              showDesktopNotification(msg.sender, msg.body);
            }
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  };

  const switchRoom = (roomId) => {
    console.log('Chat: Switching to room:', roomId);
    
    state.roomId = roomId;
    state.messages = [];
    state.lastSyncToken = '';
    state.editMode = null;
    state.editText = '';
    
    renderUserInfo();
    renderMessages();
    
    if (roomId) {
      fetchMessages();
    }
  };

  const refreshMessages = () => {
    if (state.roomId) {
      fetchMessages();
    } else {
      showError('Оберіть кімнату для оновлення повідомлень');
    }
  };

  return {
    init(host) {
      state.accessToken = window.AppAuth.accessToken || '';
      state.userId = window.AppAuth.userId || '';
      state.roomId = window.AppAuth.currentRoomId || '';

      $('chat-send')?.addEventListener('click', sendMessage);
      $('chat-refresh')?.addEventListener('click', refreshMessages);

      $('chat-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
          e.preventDefault();
          sendMessage();
        }
      });

      $('chat-input')?.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
      });

      renderUserInfo();
      renderMessages();

      if (state.syncTimer) {
        clearInterval(state.syncTimer);
      }
      state.syncTimer = setInterval(fetchMessages, 3000);

      document.addEventListener('auth:success', (e) => {
        state.accessToken = e.detail.accessToken;
        state.userId = e.detail.userId;
        renderUserInfo();
        
        if (window.Sidebar?.getCurrentRoomId) {
          const currentRoomId = window.Sidebar.getCurrentRoomId();
          if (currentRoomId && currentRoomId !== state.roomId) {
            switchRoom(currentRoomId);
          }
        }
      });

      document.addEventListener('auth:logout', () => {
        state.accessToken = '';
        state.userId = '';
        state.roomId = '';
        state.messages = [];
        state.lastSyncToken = '';
        state.editMode = null;
        state.editText = '';
        
        if (state.syncTimer) {
          clearInterval(state.syncTimer);
          state.syncTimer = null;
        }
        
        renderUserInfo();
        renderMessages();
        showError('');
      });

      document.addEventListener('room:changed', (e) => {
        const roomId = e.detail?.roomId;
        console.log('Chat: Received room:changed event:', roomId);
        
        if (roomId !== state.roomId) {
          switchRoom(roomId);
        }
      });

      if (state.roomId) {
        fetchMessages();
      }
    },

    sendMessage,
    fetchMessages,
    switchRoom,
    startEdit,
    cancelEdit,
    saveEdit,
    deleteMessage,
    playNotificationSound,
    showDesktopNotification
  };
})();