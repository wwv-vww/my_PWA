window.Chat = (() => {
  const state = {
    accessToken: '',
    userId: '',
    roomId: '',
    lastSyncToken: '',
    messages: [],
    syncTimer: null,
    isTyping: false
  };

  const $ = (id) => document.getElementById(id);

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
      const senderName = isOwn ? 'Ви' : (msg.displayName || msg.sender || 'Користувач');
      
      return `
        <div class="chat__message ${isOwn ? 'chat__message--own' : 'chat__message--other'}">
          <div class="chat__message-sender">${senderName}</div>
          <div class="chat__message-bubble">
            <div class="chat__message-text">${msg.body || ''}</div>
            <div class="chat__message-time">${formatTime(msg.timestamp || Date.now())}</div>
          </div>
        </div>
      `;
    }).join('');

    messagesEl.scrollTop = messagesEl.scrollHeight;
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

      console.log('Message sent:', result);

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
            timestamp: event.origin_server_ts
          }));

        if (newMessages.length > 0) {
          state.messages = [...state.messages, ...newMessages];
          renderMessages();
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
    switchRoom
  };
})();