'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [allowGuestLogin, setAllowGuestLogin] = useState(false);
  const [allowRegistration, setAllowRegistration] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState('');
  const router = useRouter();

  // 讀取網站組態設定
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/configs');
        const data = await res.json();
        if (data.configs) {
          if (data.configs.allow_guest_login === 'enable') setAllowGuestLogin(true);
          if (data.configs.allow_registration === 'enable') setAllowRegistration(true);
        }
      } catch (err) {
        console.error('Failed to fetch configs:', err);
      }
    })();
  }, []);

  // 標準帳密登入
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const bodyParams = isRegisterMode ? { username, password, displayName } : { username, password };
      const res = await fetch(isRegisterMode ? '/api/register' : '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyParams),
      });

      const data = await res.json();

      if (res.ok) {
        if (isRegisterMode) {
          setRegisterSuccess(data.message);
          setIsRegisterMode(false);
          setUsername('');
          setPassword('');
        } else {
          if (data.require_pwd_change) {
            sessionStorage.setItem('temp_username', data.username);
            router.push('/force-change-password');
            return;
          }
          sessionStorage.setItem('isAuthenticated', 'true');
          sessionStorage.setItem('username', username);
          sessionStorage.setItem('display_name', data.display_name);
          sessionStorage.setItem('pid', data.pid);
          sessionStorage.setItem('userId', data.id);
          sessionStorage.setItem('role', data.role);
          sessionStorage.removeItem('isGuest');
          router.push('/dashboard');
        }
      } else {
        setError(data.error || (isRegisterMode ? '註冊失敗' : '登入失敗，請檢查帳號與密碼'));
      }
    } catch (err) {
      setError('發生錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  // 訪客免密碼試用登入
  const handleGuestLogin = async () => {
    setError('');
    setGuestLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isGuest: true }),
      });

      const data = await res.json();

      if (res.ok && data.isGuest) {
        sessionStorage.setItem('isAuthenticated', 'true');
        sessionStorage.setItem('username', 'guest');
        sessionStorage.setItem('role', 'guests');
        sessionStorage.setItem('isGuest', 'true');
        sessionStorage.setItem('targetUser', data.targetUser || 'cvn');
        if (data.visibleUsers) {
          sessionStorage.setItem('visibleUsers', JSON.stringify(data.visibleUsers));
        }
        router.push('/dashboard');
      } else {
        setError(data.error || '訪客登入失敗');
      }
    } catch (err) {
      setError('連線失敗，請稍後再試');
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <main className="container">
      <div className="glass-card">
        <h1 className="title">Aegis System</h1>
        <p className="subtitle">{isRegisterMode ? '請填寫帳號密碼註冊' : '請登入以繼續存取系統'}</p>

        <form onSubmit={handleLogin}>
          {error && <div className="error-message">{error}</div>}
          {registerSuccess && <div style={{ marginBottom: '16px', padding: '12px', background: '#dcfce7', color: '#166534', borderRadius: '8px', fontSize: '0.9rem', textAlign: 'center' }}>{registerSuccess}</div>}

          <div className="form-group">
            <label className="form-label" htmlFor="username">帳號</label>
            <input
              id="username"
              type="text"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="請輸入帳號"
              required
            />
          </div>

          {isRegisterMode && (
            <div className="form-group">
              <label className="form-label" htmlFor="displayName">顯示名稱</label>
              <input
                id="displayName"
                type="text"
                className="form-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="請輸入您的姓名或暱稱"
                required
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="password">密碼</label>
            <input
              id="password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="請輸入密碼"
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading || guestLoading}>
            {loading ? <div className="spinner"></div> : (isRegisterMode ? '註冊帳號' : '登入')}
          </button>
        </form>

        {allowRegistration && (
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
              {isRegisterMode ? '已經有帳號了？' : '還沒有帳號嗎？'}
            </span>
            <button
              type="button"
              onClick={() => { setIsRegisterMode(!isRegisterMode); setError(''); setRegisterSuccess(''); }}
              style={{ background: 'none', border: 'none', color: '#0ea5e9', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', marginLeft: '8px' }}
            >
              {isRegisterMode ? '返回登入' : '立即註冊'}
            </button>
          </div>
        )}

        {/* 訪客免密碼登入區塊 (當 allow_guest_login === 'enable' 時顯示) */}
        {allowGuestLogin && (
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
            <button
              type="button"
              onClick={handleGuestLogin}
              disabled={loading || guestLoading}
              style={{
                width: '100%',
                padding: '10px 16px',
                borderRadius: '8px',
                border: '1.5px solid #0ea5e9',
                background: 'rgba(14, 165, 233, 0.06)',
                color: '#0284c7',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              {guestLoading ? <div className="spinner"></div> : '👤 訪客免密碼直接體驗'}
            </button>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '6px' }}>
              免輸入帳號密碼即可進入系統瀏覽範例數據
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
