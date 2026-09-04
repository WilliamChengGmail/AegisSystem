'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    const user = sessionStorage.getItem('username');
    const guestState = sessionStorage.getItem('isGuest') === 'true';
    if (!user) { router.push('/'); return; }
    
    setIsGuest(guestState);
    if (guestState) {
      setError('🔒 訪客體驗模式無法查看匯入/匯出歷程。');
      setLoading(false);
      return;
    }

    fetch(`/api/history?username=${user}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setHistory(data.history || []);
        } else {
          setError(data.error || '載入失敗');
        }
      })
      .catch(() => setError('網路連線錯誤'))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="health-page">
      <header className="health-header">
        <button className="btn-back" onClick={() => router.push('/dashboard')}>
          ← 返回
        </button>
        <h1>匯入/匯出歷程</h1>
        <div style={{ width: 60 }}></div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {error ? (
          <div style={{ padding: '16px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', textAlign: 'center', fontWeight: 600 }}>
            {error}
          </div>
        ) : loading ? (
          <div style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>載入中...</div>
        ) : history.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#64748b', padding: '20px', background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            目前尚無匯入/匯出歷程。
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                <thead style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <tr>
                    <th style={{ padding: '12px 16px', color: '#475569', fontSize: '0.85rem' }}>時間</th>
                    <th style={{ padding: '12px 16px', color: '#475569', fontSize: '0.85rem' }}>類型</th>
                    <th style={{ padding: '12px 16px', color: '#475569', fontSize: '0.85rem' }}>操作者</th>
                    <th style={{ padding: '12px 16px', color: '#475569', fontSize: '0.85rem' }}>對象</th>
                    <th style={{ padding: '12px 16px', color: '#475569', fontSize: '0.85rem' }}>檔案</th>
                    <th style={{ padding: '12px 16px', color: '#475569', fontSize: '0.85rem' }}>總筆數</th>
                    <th style={{ padding: '12px 16px', color: '#475569', fontSize: '0.85rem' }}>實際寫入</th>
                    <th style={{ padding: '12px 16px', color: '#475569', fontSize: '0.85rem' }}>重複略過</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#1e293b' }}>
                        {new Date(item.executed_at).toLocaleString('zh-TW', { hour12: false })}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.85rem', fontWeight: 600, color: item.action_type === 'export' ? '#059669' : '#0284c7' }}>
                        {item.action_type === 'export' ? '📥 匯出' : '📤 匯入'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#1e293b' }}>{item.operator_username}</td>
                      <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#0ea5e9', fontWeight: 600 }}>{item.target_username}</td>
                      <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#64748b' }}>{item.file_name}</td>
                      <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#1e293b' }}>{item.total_records}</td>
                      <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#16a34a', fontWeight: 600 }}>{item.action_type === 'export' ? '-' : item.imported_records}</td>
                      <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#dc2626' }}>{item.action_type === 'export' ? '-' : item.duplicate_records}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
