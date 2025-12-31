(function () {
  const API_BASE = 'https://matrix.org/_matrix/client/r0';

  function state() {
    return {
      accessToken: window.AppAuth?.accessToken || '',
      roomId: window.AppAuth?.currentRoomId || '',
      members: [],
    };
  }

  function showError(message) {
    const errorEl = document.getElementById('user-error');
    const successEl = document.getElementById('user-success');
    
    if (successEl) successEl.style.display = 'none';
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      setTimeout(() => {
        errorEl.style.display = 'none';
      }, 5000);
    }
  }

  function showSuccess(message) {
    const errorEl = document.getElementById('user-error');
    const successEl = document.getElementById('user-success');
    
    if (errorEl) errorEl.style.display = 'none';
    if (successEl) {
      successEl.textContent = message;
      successEl.style.display = 'block';
      setTimeout(() => {
        successEl.style.display = 'none';
      }, 3000);
    }
  }

  async function fetchRoomMembers(st) {
    if (!st.accessToken) return;

    const loadingEl = document.getElementById('members-loading');
    const membersList = document.getElementById('room-members');
    const emptyEl = document.getElementById('members-empty');

    if (!st.roomId) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (membersList) membersList.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    try {
      if (loadingEl) loadingEl.style.display = 'flex';
      if (membersList) membersList.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'none';

      const res = await fetch(`${API_BASE}/rooms/${encodeURIComponent(st.roomId)}/joined_members`, {
        headers: { 'Authorization': `Bearer ${st.accessToken}` }
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const members = Object.entries(data.joined || {}).map(([userId, info]) => ({
        userId,
        displayName: info.display_name || userId.split(':')[0].substring(1),
        avatarUrl: info.avatar_url || ''
      }));

      st.members = members;
      renderMembers(members);

    } catch (error) {
      console.error('Error fetching room members:', error);
      showError('Не вдалося завантажити учасників');
      
      if (loadingEl) loadingEl.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'block';
    }
  }

  function renderMembers(members) {
    const loadingEl = document.getElementById('members-loading');
    const membersList = document.getElementById('room-members');
    const emptyEl = document.getElementById('members-empty');

    if (loadingEl) loadingEl.style.display = 'none';

    if (!membersList) return;

    if (members.length === 0) {
      membersList.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    membersList.innerHTML = members.map(member => `
      <li class="user__member">
        <div class="user__member-avatar">
          ${(member.displayName || member.userId).charAt(0).toUpperCase()}
        </div>
        <div class="user__member-info">
          <div class="user__member-name" title="${member.displayName}">
            ${member.displayName}
          </div>
          <div class="user__member-id" title="${member.userId}">
            ${member.userId}
          </div>
        </div>
      </li>
    `).join('');

    membersList.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';
  }

  async function inviteUser(st, userId) {
    if (!st.accessToken || !st.roomId) {
      showError('Оберіть кімнату для запрошення');
      return;
    }

    if (!userId || !userId.includes(':')) {
      showError('Введіть коректний Matrix ID (@username:server.com)');
      return;
    }

    const inviteBtn = document.getElementById('invite-btn');
    const originalText = inviteBtn.innerHTML;

    try {
      inviteBtn.disabled = true;
      inviteBtn.innerHTML = '<span>⏳</span><span>Надсилання...</span>';

      const res = await fetch(`${API_BASE}/rooms/${encodeURIComponent(st.roomId)}/invite`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${st.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ user_id: userId })
      });

      const data = await res.json();

      if (res.ok) {
        showSuccess(`Користувача ${userId} запрошено успішно`);
        document.getElementById('invite-user').value = '';
        await fetchRoomMembers(st);
      } else {
        throw new Error(data.error || `Помилка запрошення: ${res.status}`);
      }
    } catch (error) {
      console.error('Invite error:', error);
      showError(error.message);
    } finally {
      inviteBtn.disabled = false;
      inviteBtn.innerHTML = originalText;
    }
  }

  async function joinRoom(st, joinRoomId) {
    if (!st.accessToken) {
      showError('Необхідна авторизація');
      return;
    }

    if (!joinRoomId || !joinRoomId.startsWith('!')) {
      showError('Введіть коректний Room ID (!roomId:server.com)');
      return;
    }

    const joinBtn = document.getElementById('join-btn');
    const originalText = joinBtn.innerHTML;

    try {
      joinBtn.disabled = true;
      joinBtn.innerHTML = '<span>⏳</span><span>Приєднання...</span>';

      const res = await fetch(`${API_BASE}/join/${encodeURIComponent(joinRoomId)}`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${st.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await res.json();

      if (res.ok) {
        showSuccess('Успішно приєднано до кімнати');
        document.getElementById('join-room-id').value = '';
        
        if (window.AppAuth) {
          window.AppAuth.currentRoomId = data.room_id || joinRoomId;
        }
        
        document.dispatchEvent(new CustomEvent('room:changed', { 
          detail: { roomId: data.room_id || joinRoomId } 
        }));

        document.dispatchEvent(new CustomEvent('rooms:refresh'));
      } else {
        throw new Error(data.error || `Помилка приєднання: ${res.status}`);
      }
    } catch (error) {
      console.error('Join error:', error);
      showError(error.message);
    } finally {
      joinBtn.disabled = false;
      joinBtn.innerHTML = originalText;
    }
  }

  function wireEvents(st, host) {
    const inviteInput = host.querySelector('#invite-user');
    const inviteBtn = host.querySelector('#invite-btn');
    const joinInput = host.querySelector('#join-room-id');
    const joinBtn = host.querySelector('#join-btn');

    inviteBtn?.addEventListener('click', () => {
      const userId = inviteInput?.value?.trim();
      inviteUser(st, userId);
    });

    inviteInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const userId = inviteInput.value.trim();
        inviteUser(st, userId);
      }
    });

    joinBtn?.addEventListener('click', () => {
      const roomId = joinInput?.value?.trim();
      joinRoom(st, roomId);
    });

    joinInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const roomId = joinInput.value.trim();
        joinRoom(st, roomId);
      }
    });

    document.addEventListener('auth:success', (e) => {
      st.accessToken = e.detail.accessToken;
      st.roomId = window.AppAuth?.currentRoomId || '';
      fetchRoomMembers(st);
    });

    document.addEventListener('auth:logout', () => {
      st.accessToken = '';
      st.roomId = '';
      st.members = [];
      renderMembers([]);
    });

    document.addEventListener('room:changed', (e) => {
      console.log('User: Received room:changed event:', e.detail.roomId);
      st.roomId = e.detail.roomId || '';
      fetchRoomMembers(st);
    });

    document.addEventListener('rooms:refresh', () => {
      fetchRoomMembers(st);
    });
  }

  window.User = {
    init(host) {
      const st = state();
      wireEvents(st, host);
      
      if (st.accessToken) {
        fetchRoomMembers(st);
      }
    }
  };
})();