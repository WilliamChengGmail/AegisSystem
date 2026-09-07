'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function UsersManagementPage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [allowRegistration, setAllowRegistration] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [currentUserId, setCurrentUserId] = useState(null);
  
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState('users');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);
  
  // 編輯使用者狀態
  const [editingUserId, setEditingUserId] = useState(null);
  const [editData, setEditData] = useState({ displayName: '', role: 'users' });

  // 初始化資料
  const fetchData = async (operatorId) => {
    try {
      setLoading(true);
      const [uRes, cRes, lRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/configs'),
        fetch(`/api/admin/logs?operatorId=${operatorId}`)
      ]);
      const [uData, cData, lData] = await Promise.all([uRes.json(), cRes.json(), lRes.json()]);

      if (uData.success) setUsers(uData.users);
      if (cData.success && cData.configs.allow_registration === 'enable') setAllowRegistration(true);
      if (lData.success) setLogs(lData.logs);
    } catch (err) {
      setError('資料載入失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const role = sessionStorage.getItem('role');
    const operatorId = sessionStorage.getItem('userId');
    setCurrentUserId(operatorId);
    if (role !== 'admins') {
      router.push('/dashboard');
      return;
    }
    fetchData(operatorId);
  }, [router]);

  // 切換開放註冊
  const toggleRegistration = async () => {
    const newVal = allowRegistration ? 'disable' : 'enable';
    const operatorId = sessionStorage.getItem('userId');
    try {
      const res = await fetch('/api/admin/configs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'allow_registration', value: newVal, operatorId })
      });
      if (res.ok) {
        setAllowRegistration(!allowRegistration);
        setMessage({ type: 'success', text: '組態更新成功' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: '更新失敗' });
    }
  };

  // 變更狀態
  const changeStatus = async (targetId, newStatus) => {
    if (newStatus === 'suspended' && !confirm('確定要停權該帳號嗎？')) return;
    const operatorId = sessionStorage.getItem('userId');
    try {
      const res = await fetch('/api/admin/users/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: targetId, status: newStatus, operatorId })
      });
      if (res.ok) {
        setMessage({ type: 'success', text: '狀態更新成功' });
        fetchData(operatorId);
      } else {
        const d = await res.json();
        setMessage({ type: 'error', text: d.error || '更新失敗' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: '更新失敗' });
    }
  };

  // 重設密碼
  const resetPassword = async (targetId) => {
    if (!confirm('確定要重設該帳號的密碼嗎？這將會產生一組隨機密碼並要求使用者下次登入時更改。')) return;
    const operatorId = sessionStorage.getItem('userId');
    try {
      const res = await fetch('/api/admin/users/password-reset', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: targetId, operatorId })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: `密碼已重設！臨時密碼為：${data.newPassword}` });
        fetchData(operatorId);
      } else {
        setMessage({ type: 'error', text: data.error || '重設失敗' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: '更新失敗' });
    }
  };

  // 統一編輯使用者資料
  const updateUser = async (targetId) => {
    const operatorId = sessionStorage.getItem('userId');
    try {
      const res = await fetch('/api/admin/users/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          targetUserId: targetId, 
          displayName: editData.displayName, 
          role: editData.role, 
          operatorId 
        })
      });
      if (res.ok) {
        setMessage({ type: 'success', text: '使用者資料更新成功' });
        setEditingUserId(null);
        fetchData(operatorId);
      } else {
        const d = await res.json();
        setMessage({ type: 'error', text: d.error || '更新失敗' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: '更新失敗' });
    }
  };

  // 產生隨機密碼
  const generatePwd = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let p = '';
    for (let i = 0; i < 8; i++) p += chars.charAt(Math.floor(Math.random() * chars.length));
    setNewPassword(p);
  };

  // 新增使用者
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUsername || !newPassword || !newDisplayName) return;
    setCreating(true);
    const operatorId = sessionStorage.getItem('userId');
    try {
      const res = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, displayName: newDisplayName, password: newPassword, role: newRole, operatorId })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: `帳號 ${newUsername} 建立成功！密碼：${newPassword}` });
        setNewUsername('');
        setNewDisplayName('');
        setNewPassword('');
        fetchData(operatorId);
      } else {
        setMessage({ type: 'error', text: data.error || '建立失敗' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: '建立失敗' });
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>載入中...</div>;

  return (
    <div className="health-page">
      <header className="health-header">
        <button className="btn-back" onClick={() => router.push('/dashboard')}>
          ← 返回
        </button>
        <h1>使用者與組態管理</h1>
        <div style={{ width: 60 }}></div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
        {message.text && (
          <div style={{ 
            padding: '12px', marginBottom: '16px', borderRadius: '8px', 
            background: message.type === 'error' ? '#fee2e2' : '#dcfce7',
            color: message.type === 'error' ? '#991b1b' : '#166534',
            fontWeight: 600, textAlign: 'center'
          }}>
            {message.text}
          </div>
        )}

        {/* 組態管理區塊 */}
        <section style={{ background: '#fff', borderRadius: '12px', padding: '16px', marginBottom: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '12px', color: '#1e293b' }}>⚙️ 全域組態設定</h2>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
            <div>
              <div style={{ fontWeight: 600, color: '#1e293b' }}>開放外部註冊功能</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>決定首頁是否顯示註冊按鈕，並開放新使用者申請帳號</div>
            </div>
            <button 
              onClick={toggleRegistration}
              style={{
                padding: '8px 16px', borderRadius: '20px', border: 'none', fontWeight: 600, cursor: 'pointer',
                background: allowRegistration ? '#10b981' : '#cbd5e1',
                color: allowRegistration ? '#fff' : '#475569',
                transition: 'all 0.2s'
              }}
            >
              {allowRegistration ? 'ON 已開放' : 'OFF 已關閉'}
            </button>
          </div>
        </section>

        {/* 新增帳號區塊 */}
        <section style={{ background: '#fff', borderRadius: '12px', padding: '16px', marginBottom: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '12px', color: '#1e293b' }}>➕ 手動建立帳號</h2>
          <form onSubmit={handleCreateUser} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>帳號</label>
              <input type="text" value={newUsername} onChange={e=>setNewUsername(e.target.value)} required style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            </div>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>顯示名稱</label>
              <input type="text" value={newDisplayName} onChange={e=>setNewDisplayName(e.target.value)} required style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            </div>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>角色</label>
              <select value={newRole} onChange={e=>setNewRole(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                <option value="users">一般使用者</option>
                <option value="admins">管理員</option>
                <option value="guests">訪客</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>初始密碼</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input type="text" value={newPassword} onChange={e=>setNewPassword(e.target.value)} required style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                <button type="button" onClick={generatePwd} style={{ background: '#e2e8f0', border: 'none', borderRadius: '6px', padding: '0 8px', cursor: 'pointer' }} title="產生隨機密碼">🎲</button>
              </div>
            </div>
            <button type="submit" disabled={creating} style={{ padding: '9px 16px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
              {creating ? '建立中...' : '建立帳號'}
            </button>
          </form>
          <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '8px' }}>* 建立完成後，該帳號於首次登入時將被強制要求變更密碼。</div>
        </section>

        {/* 使用者列表 */}
        <section style={{ background: '#fff', borderRadius: '12px', padding: '16px', marginBottom: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '12px', color: '#1e293b' }}>👥 使用者列表</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
              <thead style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <tr>
                  <th style={{ padding: '12px', color: '#475569', fontSize: '0.85rem' }}>帳號 (PID)</th>
                  <th style={{ padding: '12px', color: '#475569', fontSize: '0.85rem' }}>顯示名稱</th>
                  <th style={{ padding: '12px', color: '#475569', fontSize: '0.85rem' }}>角色</th>
                  <th style={{ padding: '12px', color: '#475569', fontSize: '0.85rem' }}>狀態</th>
                  <th style={{ padding: '12px', color: '#475569', fontSize: '0.85rem' }}>密碼強制變更</th>
                  <th style={{ padding: '12px', color: '#475569', fontSize: '0.85rem', textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isEditing = editingUserId === u.id;
                  return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px', fontWeight: 600, color: '#1e293b' }}>
                      {u.username}
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 'normal' }}>{u.pid}</div>
                    </td>
                    <td style={{ padding: '12px', fontWeight: 600, color: '#1e293b' }}>
                      {isEditing ? (
                        <input type="text" value={editData.displayName} onChange={e => setEditData({...editData, displayName: e.target.value})} style={{ padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '100%' }} />
                      ) : (
                        u.display_name
                      )}
                    </td>
                    <td style={{ padding: '12px', color: '#1e293b' }}>
                      {isEditing ? (
                        <select value={editData.role} onChange={e => setEditData({...editData, role: e.target.value})} style={{ padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                          <option value="users">一般</option>
                          <option value="admins">管理員</option>
                          <option value="guests">訪客</option>
                        </select>
                      ) : (
                        u.role === 'admins' ? '管理員' : u.role === 'guests' ? '訪客' : '一般'
                      )}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {u.status === 'active' && <span style={{ color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem' }}>🟢 啟用</span>}
                      {u.status === 'suspended' && <span style={{ color: '#dc2626', background: '#fee2e2', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem' }}>🔴 停權</span>}
                      {u.status === 'pending' && <span style={{ color: '#854d0e', background: '#fef08a', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>🟡 待審核</span>}
                    </td>
                    <td style={{ padding: '12px', fontSize: '0.85rem', color: u.require_pwd_change === 1 ? '#ef4444' : '#64748b' }}>
                      {u.require_pwd_change === 1 ? '⚠️ 需變更' : '正常'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {isEditing ? (
                          <>
                            <button onClick={() => updateUser(u.id)} style={{ padding: '4px 8px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>💾 儲存</button>
                            <button onClick={() => setEditingUserId(null)} style={{ padding: '4px 8px', background: '#94a3b8', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>❌ 取消</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditingUserId(u.id); setEditData({ displayName: u.display_name, role: u.role }); }} style={{ padding: '4px 8px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>✏️ 編輯</button>
                        {u.status === 'pending' && (
                          <button onClick={() => changeStatus(u.id, 'active')} style={{ padding: '4px 8px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>✅ 核准</button>
                        )}
                        {u.status === 'active' && String(u.id) !== String(currentUserId) && (
                          <button onClick={() => changeStatus(u.id, 'suspended')} style={{ padding: '4px 8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>🔒 停權</button>
                        )}
                        {u.status === 'suspended' && (
                          <button onClick={() => changeStatus(u.id, 'active')} style={{ padding: '4px 8px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>🔓 解除停權</button>
                        )}
                        <button onClick={() => resetPassword(u.id)} style={{ padding: '4px 8px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>🔑 重設密碼</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </section>

        {/* 操作歷程 */}
        <section style={{ background: '#fff', borderRadius: '12px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '12px', color: '#1e293b' }}>📖 管理員操作歷程</h2>
          <div style={{ overflowX: 'auto', maxHeight: '300px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
              <thead style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ padding: '8px 12px', color: '#475569', fontSize: '0.8rem' }}>時間</th>
                  <th style={{ padding: '8px 12px', color: '#475569', fontSize: '0.8rem' }}>操作者</th>
                  <th style={{ padding: '8px 12px', color: '#475569', fontSize: '0.8rem' }}>動作</th>
                  <th style={{ padding: '8px 12px', color: '#475569', fontSize: '0.8rem' }}>受影響對象</th>
                  <th style={{ padding: '8px 12px', color: '#475569', fontSize: '0.8rem' }}>詳細資訊</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr><td colSpan="5" style={{ padding: '12px', textAlign: 'center', color: '#94a3b8' }}>暫無操作紀錄</td></tr>
                ) : logs.map(l => (
                  <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px', fontSize: '0.75rem', color: '#475569', fontWeight: 500 }}>{new Date(l.created_at).toLocaleString('zh-TW', {hour12:false})}</td>
                    <td style={{ padding: '8px 12px', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b' }}>{l.operator_username}</td>
                    <td style={{ padding: '8px 12px', fontSize: '0.8rem', color: '#0369a1', fontWeight: 600 }}>{l.action_type}</td>
                    <td style={{ padding: '8px 12px', fontSize: '0.8rem', fontWeight: 700, color: '#b45309' }}>{l.target_username}</td>
                    <td style={{ padding: '8px 12px', fontSize: '0.75rem', color: '#0f172a', wordBreak: 'break-all', fontWeight: 500 }}>{l.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </div>
  );
}
