'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardIndex() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [isGuest, setIsGuest] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const isAuth = sessionStorage.getItem('isAuthenticated');
    const user = sessionStorage.getItem('username');
    const guestState = sessionStorage.getItem('isGuest') === 'true';

    if (!isAuth || !user) {
      router.push('/');
      return;
    }
    setUsername(user);
    setIsGuest(guestState);
  }, [router]);

  const handleLogout = () => {
    sessionStorage.removeItem('isAuthenticated');
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('isGuest');
    sessionStorage.removeItem('targetUser');
    sessionStorage.removeItem('visibleUsers');
    router.push('/');
  };

  const handleCardClick = (feature) => {
    if (feature.disabled) {
      setMessage('🔒 訪客體驗模式僅開放查看血壓心跳資料，無法使用設定與匯入功能');
      setTimeout(() => setMessage(''), 4000);
      return;
    }
    router.push(feature.path);
  };

  const features = [
    {
      icon: '🫀',
      title: '血壓心跳',
      desc: '查看血壓與心跳趨勢圖表及詳細數據',
      path: '/dashboard/health',
      color: 'linear-gradient(135deg, #ff6b6b, #ee5a24)',
      disabled: false,
    },
    {
      icon: '⚙️',
      title: '設定與匯入',
      desc: isGuest ? '🔒 訪客體驗模式不開放此功能' : '設定高低標範圍 / 上傳備份檔案',
      path: '/dashboard/settings',
      color: isGuest ? 'linear-gradient(135deg, #94a3b8, #cbd5e1)' : 'linear-gradient(135deg, #6c5ce7, #a29bfe)',
      disabled: isGuest,
    },
  ];

  return (
    <div className="dashboard-home">
      {/* 頂部導航列 */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1 className="header-logo">Aegis</h1>
          <span className="header-user">
            Hi, {isGuest ? 'Guest 訪客' : username}
            {isGuest && (
              <span style={{
                marginLeft: '8px',
                background: 'rgba(14, 165, 233, 0.15)',
                color: '#0284c7',
                fontSize: '0.75rem',
                padding: '2px 8px',
                borderRadius: '12px',
                fontWeight: 600
              }}>
                [訪客模式]
              </span>
            )}
          </span>
        </div>
        <button className="btn-logout" onClick={handleLogout}>登出</button>
      </header>

      {/* 訪客提示訊息 */}
      {message && (
        <div style={{
          margin: '12px 16px 0',
          padding: '10px 16px',
          background: '#fff3cd',
          border: '1px solid #ffeeba',
          color: '#856404',
          borderRadius: '8px',
          fontSize: '0.88rem',
          fontWeight: 600,
          textAlign: 'center'
        }}>
          {message}
        </div>
      )}

      {/* 功能區塊列表 */}
      <main className="dashboard-main">
        <h2 className="section-title">功能模組</h2>
        <div className="feature-grid">
          {features.map((f) => (
            <div
              key={f.path}
              className="feature-card"
              onClick={() => handleCardClick(f)}
              style={{
                '--card-gradient': f.color,
                opacity: f.disabled ? 0.65 : 1,
                cursor: f.disabled ? 'not-allowed' : 'pointer'
              }}
            >
              <div className="feature-icon">{f.icon}</div>
              <div className="feature-info">
                <h3>
                  {f.title}
                  {f.disabled && <span style={{ fontSize: '0.75rem', marginLeft: '6px', color: '#64748b' }}>(🔒 已停用)</span>}
                </h3>
                <p>{f.desc}</p>
              </div>
              <span className="feature-arrow">{f.disabled ? '🔒' : '›'}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
