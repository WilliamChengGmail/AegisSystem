'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const router = useRouter();
  const [username, setUsername] = useState('');

  useEffect(() => {
    const isAuth = sessionStorage.getItem('isAuthenticated');
    if (!isAuth) {
      router.push('/');
    } else {
      setUsername(sessionStorage.getItem('username') || '');
    }
  }, [router]);

  const handleLogout = () => {
    sessionStorage.removeItem('isAuthenticated');
    sessionStorage.removeItem('username');
    router.push('/');
  };

  return (
    <div className="dashboard-container">
      <div className="glass-card" style={{ maxWidth: '100%' }}>
        <h1 className="welcome-header">
          <span className="title">歡迎登入，{username}</span>
        </h1>
        <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>
          您已成功登入系統。這是一個具備玻璃擬物化風格 (Glassmorphism) 的響應式儀表板。
        </p>
        <button onClick={handleLogout} className="btn-primary" style={{ maxWidth: '200px' }}>
          登出
        </button>
      </div>
    </div>
  );
}
