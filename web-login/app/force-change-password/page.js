'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ForceChangePasswordPage() {
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const tempUser = sessionStorage.getItem('temp_username');
    if (!tempUser) {
      router.push('/');
    } else {
      setUsername(tempUser);
    }
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('兩次輸入的新密碼不一致');
      return;
    }
    if (newPassword.length < 6) {
      setError('新密碼長度必須至少 6 個字元');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/user/force-change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, newPassword }),
      });

      const data = await res.json();

      if (res.ok) {
        sessionStorage.removeItem('temp_username');
        alert('密碼已成功更新，請重新登入！');
        router.push('/');
      } else {
        setError(data.error || '更新失敗');
      }
    } catch (err) {
      setError('連線失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  if (!username) return <div style={{ padding: '20px', textAlign: 'center' }}>載入中...</div>;

  return (
    <main className="container">
      <div className="glass-card">
        <h1 className="title" style={{ color: '#dc2626' }}>🔒 安全性更新</h1>
        <p className="subtitle">
          這是您第一次登入，或者管理員已為您重設密碼。<br/>
          請設定新的密碼才能繼續使用系統。
        </p>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label className="form-label">帳號</label>
            <input
              type="text"
              className="form-input"
              value={username}
              disabled
              style={{ background: '#f1f5f9', cursor: 'not-allowed', color: '#64748b' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="newPassword">新密碼</label>
            <input
              id="newPassword"
              type="password"
              className="form-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="請輸入至少 6 位的新密碼"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confirmPassword">確認新密碼</label>
            <input
              id="confirmPassword"
              type="password"
              className="form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="請再次輸入新密碼"
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading} style={{ background: '#dc2626' }}>
            {loading ? <div className="spinner"></div> : '✅ 確認修改'}
          </button>
        </form>
      </div>
    </main>
  );
}
