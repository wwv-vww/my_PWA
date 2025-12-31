// sidebar.js
(function () {
  const API_BASE = 'https://matrix.org/_matrix/client';
  const VERS = 'r0';
  const enc = encodeURIComponent;

  function authHeader() {
    const token = window.AppAuth?.accessToken || '';
    return { 'Authorization': 'Bearer ' + token };
  }

  function hasAuth() {
    return Boolean(window.AppAuth?.accessToken);
  }

  async function apiJson(url, opts = {}) {
    try {
      const res = await fetch(url, opts);
      const data = await res.json();
      return { res, data };
    } catch (error) {
      console.error('API request failed:', error);
      return { res: { ok: false }, data: { error: 'Network error' } };
    }
  }

  function renderRooms(host, state) {
    const list = host.querySelector('#rooms-list');
    
    if (!state.rooms || state.rooms.length === 0) {
      list.innerHTML = '<li class="sidebar__empty">Немає доступних кімнат</li>';
      return;
    }

    list.innerHTML = state.rooms.map(room => `
      <li class="sidebar-list__item ${room.roomId === state.roomId ? 'sidebar-list__item--active' : ''}" 
          data-room-id="${room.roomId}">
        <div class="sidebar-list__item-content">
          <div class="sidebar-list__item-icon">#</div>
          <span class="sidebar-list__item-name" title="${room.name || room.roomId}">
            ${room.name || room.roomId}
          </span>
        </div>
        <div class="sidebar-list__item-actions">
          <button class="sidebar-list__btn sidebar-list__btn--delete" title="Покинути кімнату">
            ×
          </button>
        </div>
      </li>
    `).join('');

    // Add event listeners
    list.querySelectorAll('.sidebar-list__item').forEach(item => {
      const roomId = item.dataset.roomId;
      
      item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('sidebar-list__btn')) {
          switchRoom(host, state, roomId);
        }
      });

      const deleteBtn = item.querySelector('.sidebar-list__btn--delete');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        leaveRoom(host, state, roomId);
      });
    });
  }

  function renderMembers(host, state) {
    const block = host.querySelector('#members-block');
    const list = host.querySelector('#members-list');

    if (!state.roomId || !state.members || state.members.length === 0) {
      list.innerHTML = '<li class="sidebar__empty">Немає учасників або кімната не обрана</li>';
      return;
    }

    list.innerHTML = state.members.map(member => `
      <li class="sidebar__member">
        <div class="sidebar__member-info">
          <div class="sidebar__member-avatar">
            ${(member.displayName || member.userId).charAt(0).toUpperCase()}
          </div>
          <div>
            <div class="sidebar__member-name">${member.displayName || member.userId}</div>
            <div class="sidebar__member-id">${member.userId}</div>
          </div>
        </div>
        <div class="sidebar__member-actions">
          <button class="sidebar__kick-btn" title="Вигнати користувача">
            Вигнати
          </button>
        </div>
      </li>
    `).join('');

    // Add event listeners for kick buttons
    list.querySelectorAll('.sidebar__kick-btn').forEach((btn, index) => {
      btn.addEventListener('click', () => {
        const member = state.members[index];
        if (member) {
          kickUser(host, state, member.userId);
        }
      });
    });
  }

  async function fetchRoomsWithNames(state) {
    if (!hasAuth()) return;

    const { res, data } = await apiJson(`${API_BASE}/${VERS}/joined_rooms`, {
      headers: authHeader()
    });

    if (!res.ok) {
      console.error('Failed to fetch rooms:', data);
      return;
    }

    const rooms = [];
    for (const roomId of (data.joined_rooms || [])) {
      let name = '';
      try {
        const roomRes = await fetch(`${API_BASE}/${VERS}/rooms/${enc(roomId)}/state/m.room.name`, {
          headers: authHeader()
        });
        if (roomRes.ok) {
          const roomData = await roomRes.json();
          name = roomData?.name || '';
        }
      } catch (error) {
        console.error('Failed to fetch room name:', error);
      }
      rooms.push({ roomId, name });
    }

    state.rooms = rooms;

    // Reset active room if it no longer exists
    if (state.roomId && !rooms.find(r => r.roomId === state.roomId)) {
      state.roomId = '';
      state.members = [];
      document.dispatchEvent(new CustomEvent('room:changed', { detail: { roomId: '' } }));
    }
  }

  async function createRoom(host, state) {
    const input = host.querySelector('#new-room-name');
    const button = host.querySelector('#create-room-btn');
    const roomIdDisplay = host.querySelector('#new-room-id');
    const name = input.value.trim();

    if (!name || !hasAuth()) {
      showError(host, 'Будь ласка, введіть назву кімнати');
      return;
    }

    button.disabled = true;
    button.innerHTML = '<span>...</span>';

    try {
      const { res, data } = await apiJson(`${API_BASE}/${VERS}/createRoom`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          ...authHeader() 
        },
        body: JSON.stringify({ name })
      });

      if (res.ok && data.room_id) {
        input.value = '';
        roomIdDisplay.style.display = 'block';
        roomIdDisplay.querySelector('span').textContent = data.room_id;
        
        await fetchRoomsWithNames(state);
        await switchRoom(host, state, data.room_id);
        renderRooms(host, state);
        
        // Hide room ID after 5 seconds
        setTimeout(() => {
          roomIdDisplay.style.display = 'none';
        }, 5000);
      } else {
        showError(host, `Помилка створення: ${data.error || 'Невідома помилка'}`);
      }
    } catch (error) {
      showError(host, 'Мережева помилка');
    } finally {
      button.disabled = false;
      button.innerHTML = '<span>+</span>';
    }
  }

  async function leaveRoom(host, state, roomId) {
    if (!hasAuth() || !roomId) return;

    if (!confirm('Ви дійсно бажаєте покинути цю кімнату?')) return;

    const { res, data } = await apiJson(`${API_BASE}/${VERS}/rooms/${enc(roomId)}/leave`, {
      method: 'POST',
      headers: authHeader()
    });

    if (res.ok) {
      await fetchRoomsWithNames(state);
      renderRooms(host, state);
      renderMembers(host, state);
    } else {
      showError(host, `Помилка: ${data.error || 'Невідома помилка'}`);
    }
  }

  async function switchRoom(host, state, roomId) {
    if (!roomId) return;

    console.log('Switching to room:', roomId); // Додано для дебагу
    
    state.roomId = roomId;
    await fetchRoomMembers(state);
    renderRooms(host, state);
    renderMembers(host, state);
    
    // ВАЖЛИВО: Відправляємо подію з правильним roomId
    document.dispatchEvent(new CustomEvent('room:changed', { 
      detail: { roomId: roomId } 
    }));
    
    // Оновлюємо глобальний стан
    if (window.AppAuth) {
      window.AppAuth.currentRoomId = roomId;
    }
  }

  async function fetchRoomMembers(state) {
    if (!hasAuth() || !state.roomId) return;

    const { res, data } = await apiJson(
      `${API_BASE}/${VERS}/rooms/${enc(state.roomId)}/members?at=`,
      { headers: authHeader() }
    );

    if (res.ok) {
      state.members = (data.chunk || [])
        .filter(ev => ev.type === 'm.room.member' && ev.content?.membership === 'join')
        .map(ev => ({
          userId: ev.state_key,
          displayName: ev.content?.displayname || ev.state_key
        }));
    } else {
      state.members = [];
    }
  }

  async function kickUser(host, state, userId) {
    if (!hasAuth() || !state.roomId || !userId) return;

    if (!confirm(`Вигнати користувача ${userId} з кімнати?`)) return;

    const { res, data } = await apiJson(
      `${API_BASE}/${VERS}/rooms/${enc(state.roomId)}/kick`,
      {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          ...authHeader() 
        },
        body: JSON.stringify({ user_id: userId })
      }
    );

    if (res.ok) {
      await fetchRoomMembers(state);
      renderMembers(host, state);
    } else {
      showError(host, `Помилка: ${data.error || 'Невідома помилка'}`);
    }
  }

  function showError(host, message) {
    // Remove existing errors
    const existingError = host.querySelector('.sidebar__error');
    if (existingError) {
      existingError.remove();
    }

    const errorEl = document.createElement('div');
    errorEl.className = 'sidebar__error';
    errorEl.textContent = message;
    
    host.querySelector('.sidebar__content').prepend(errorEl);
    
    setTimeout(() => {
      errorEl.remove();
    }, 5000);
  }

  window.Sidebar = {
    init(host) {
      const state = {
        rooms: [],
        roomId: '',
        members: []
      };

      // Set up event listeners
      const createBtn = host.querySelector('#create-room-btn');
      const roomInput = host.querySelector('#new-room-name');

      createBtn.addEventListener('click', () => createRoom(host, state));
      
      roomInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          createRoom(host, state);
        }
      });

      roomInput.addEventListener('input', () => {
        // Clear any existing errors when user types
        const error = host.querySelector('.sidebar__error');
        if (error) error.remove();
      });

      // Load rooms if already authenticated
      if (hasAuth()) {
        fetchRoomsWithNames(state).then(() => {
          renderRooms(host, state);
          renderMembers(host, state);
        });
      }

      // Listen for external room changes
      document.addEventListener('room:force', (e) => {
        const { roomId } = e.detail || {};
        if (roomId) {
          switchRoom(host, state, roomId);
        }
      });

      // Listen for auth success to load rooms
      document.addEventListener('auth:success', () => {
        fetchRoomsWithNames(state).then(() => {
          renderRooms(host, state);
          renderMembers(host, state);
        });
      });

      // ВАЖЛИВО: Додаємо метод для отримання поточної кімнати
      window.Sidebar.getCurrentRoomId = () => state.roomId;
    },

    getCurrentRoomId() {
      return '';
    }
  };
})();