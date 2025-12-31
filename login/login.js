(function () {
  async function matrixLogin(user, pass) {
    const res = await fetch('https://matrix.org/_matrix/client/r0/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'm.login.password',
        user,
        password: pass
      })
    });
    
    const data = await res.json();
    if (!res.ok || !data?.access_token) {
      const code = data?.errcode || '';
      if (code === 'M_FORBIDDEN') throw new Error('Невірний логін або пароль');
      if (code === 'M_LIMIT_EXCEEDED') throw new Error('Перевищено ліміт запитів. Спробуйте пізніше');
      throw new Error(data?.error || 'Помилка під час входу');
    }
    return { accessToken: data.access_token, userId: data.user_id || '' };
  }

  function showLogin(formEl, panelEl) {
    formEl.style.display = 'grid';
    panelEl.style.display = 'none';
  }

  function showPanel(formEl, panelEl) {
    formEl.style.display = 'none';
    panelEl.style.display = 'block';
  }

  function updateUserAvatar(userId) {
    const avatarEl = document.getElementById('login-avatar');
    if (avatarEl && userId) {
      const initial = userId.charAt(1).toUpperCase();
      avatarEl.textContent = initial;
    }
  }

  function setRoomId(roomId) {
    const el = document.getElementById('room-id-value');
    const msg = document.getElementById('room-id-copy-msg');
    
    if (!el) return;

    if (roomId && typeof roomId === 'string') {
      el.textContent = roomId;
      el.title = 'Клікніть для копіювання Room ID';
      
      el.onclick = async () => {
        try {
          await navigator.clipboard.writeText(roomId);
          if (msg) {
            msg.textContent = 'Room ID скопійовано в буфер обміну';
            setTimeout(() => msg.textContent = '', 2000);
          }
        } catch (err) {
          if (msg) {
            msg.textContent = 'Помилка копіювання';
            setTimeout(() => msg.textContent = '', 2000);
          }
        }
      };
    } else {
      el.textContent = 'Не обрано';
      el.title = '';
      el.onclick = null;
      if (msg) msg.textContent = '';
    }
  }

  function init(host, { onAuth, onLogout } = {}) {
    const $form = host.querySelector('#login-form');
    const $user = host.querySelector('#login-username');
    const $pass = host.querySelector('#login-password');
    const $submit = host.querySelector('#login-submit');
    const $error = host.querySelector('#login-error');

    const $panel = host.querySelector('#login-panel');
    const $userid = host.querySelector('#login-userid');
    const $token = host.querySelector('#login-token');
    const $copyBtn = host.querySelector('#login-copy');
    const $copyMsg = host.querySelector('#login-copy-msg');
    const $logout = host.querySelector('#login-logout');

    showLogin($form, $panel);
    setRoomId('');

    const clearError = () => {
      if ($error.textContent) {
        $error.textContent = '';
      }
    };

    $user.addEventListener('input', clearError);
    $pass.addEventListener('input', clearError);

    $submit.addEventListener('click', async () => {
      $submit.disabled = true;
      $submit.innerHTML = '<span>Вхід...</span>';
      $error.textContent = '';
      
      try {
        const username = $user.value.trim();
        const password = $pass.value;
        
        if (!username) throw new Error('Вкажіть Matrix ID або логін');
        if (!password) throw new Error('Вкажіть пароль');

        const { accessToken, userId } = await matrixLogin(username, password);

        $userid.textContent = userId;
        $token.textContent = accessToken ? `${accessToken.substring(0, 25)}...` : '';
        updateUserAvatar(userId);
        showPanel($form, $panel);

        if (typeof onAuth === 'function') {
          onAuth({ accessToken, userId });
        }
      } catch (e) {
        $error.textContent = e.message || 'Сталася невідома помилка';
      } finally {
        $submit.disabled = false;
        $submit.innerHTML = '<span>Увійти в систему</span>';
      }
    });

    $copyBtn.addEventListener('click', async () => {
      const fullToken = window.AppAuth?.accessToken || '';
      if (!fullToken) return;

      try {
        await navigator.clipboard.writeText(fullToken);
        $copyMsg.textContent = 'Токен скопійовано в буфер обміну';
        setTimeout(() => $copyMsg.textContent = '', 2000);
      } catch {
        $copyMsg.textContent = 'Не вдалося скопіювати токен';
        setTimeout(() => $copyMsg.textContent = '', 2000);
      }
    });

    $token.addEventListener('click', async () => {
      const fullToken = window.AppAuth?.accessToken || '';
      if (!fullToken) return;

      try {
        await navigator.clipboard.writeText(fullToken);
        $copyMsg.textContent = 'Токен скопійовано в буфер обміну';
        setTimeout(() => $copyMsg.textContent = '', 2000);
      } catch (err) {
        // Ignore clipboard errors
      }
    });

    $logout.addEventListener('click', () => {
      $user.value = '';
      $pass.value = '';
      $token.textContent = '';
      $userid.textContent = '';
      setRoomId('');
      showLogin($form, $panel);
      
      if (typeof onLogout === 'function') {
        onLogout();
      }
    });

    document.addEventListener('room:changed', (e) => {
      const roomId = e?.detail?.roomId || '';
      if (window.AppAuth) {
        window.AppAuth.currentRoomId = roomId;
      }
      setRoomId(roomId);
    });

    document.addEventListener('auth:success', () => {
      try {
        const initialRoom = window.Sidebar?.getCurrentRoomId ? window.Sidebar.getCurrentRoomId() : '';
        setRoomId(initialRoom || '');
      } catch {
        setRoomId('');
      }
    });

    $pass.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        $submit.click();
      }
    });
  }

  window.Login = { init };
})();