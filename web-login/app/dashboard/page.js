'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardIndex() {
  const router = useRouter();
  const [username, setUsername] = useState('');

  useEffect(() => {
    const isAuth = sessionStorage.getItem('isAuthenticated');
    const user = sessionStorage.getItem('username');
    if (!isAuth || !user) {
      router.push('/');
      return;
    }
    setUsername(user);
  }, [router]);

  const handleLogout = () => {
    sessionStorage.removeItem('isAuthenticated');
    sessionStorage.removeItem('username');
    router.push('/');
  };

  const features = [
    {
      icon: '🫀',
      title: '血壓心跳',
      desc: '查看血壓與心跳趨勢圖表及詳細數據',
      path: '/dashboard/health',
      color: 'linear-gradient(135deg, #ff6b6b, #ee5a24)',
    },
    {
      icon: '⚙️',
      title: '設定與匯入',
      desc: '設定高低標範圍 / 上傳備份檔案',
      path: '/dashboard/settings',
      color: 'linear-gradient(135deg, #6c5ce7, #a29bfe)',
    },
  ];

  return (
    <div className="dashboard-home">
      {/* 頂部導航列 */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1 className="header-logo">Aegis</h1>
          <span className="header-user">Hi, {username}</span>
        </div>
        <button className="btn-logout" onClick={handleLogout}>登出</button>
      </header>

      {/* 功能區塊列表 */}
      <main className="dashboard-main">
        <h2 className="section-title">功能模組</h2>
        <div className="feature-grid">
          {features.map((f) => (
            <div
              key={f.path}
              className="feature-card"
              onClick={() => router.push(f.path)}
              style={{ '--card-gradient': f.color }}
            >
              <div className="feature-icon">{f.icon}</div>
              <div className="feature-info">
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
              <span className="feature-arrow">›</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
