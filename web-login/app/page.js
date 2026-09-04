'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [allowGuestLogin, setAllowGuestLogin] = useState(false);
  const router = useRouter();

  // 讀取網站組態設定
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/configs');
        const data = await res.json();
        if (data.configs && data.configs.allow_guest_login === 'enable') {
          setAllowGuestLogin(true);
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
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok) {
        sessionStorage.setItem('isAuthenticated', 'true');
        sessionStorage.setItem('username', username);
        sessionStorage.setItem('userId', data.id);
        sessionStorage.setItem('role', data.role);
        sessionStorage.removeItem('isGuest');
        router.push('/dashboard');
      } else {
        setError(data.error || '登入失敗，請檢查帳號與密碼');
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
        <p className="subtitle">請登入以繼續存取系統</p>

        <form onSubmit={handleLogin}>
          {error && <div className="error-message">{error}</div>}

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
            {loading ? <div className="spinner"></div> : '登入'}
          </button>
        </form>

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
