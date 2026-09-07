'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 血壓快速預設
const BP_PRESETS = [
  {
    id: 'custom',
    label: '自訂',
    desc: '手動輸入高低標',
    sys_high: null, sys_low: null,
    dia_high: null, dia_low: null,
  },
  {
    id: 'standard1',
    label: '界定標準 (1)',
    desc: '收縮壓 ≥140 / 舒張壓 ≥90 mmHg',
    sys_high: 140, sys_low: 90,
    dia_high: 90,  dia_low: 60,
  },
  {
    id: 'standard2',
    label: '界定標準 (2)',
    desc: '收縮壓 ≥130 / 舒張壓 ≥80 mmHg',
    sys_high: 130, sys_low: 80,
    dia_high: 80,  dia_low: 60,
  },
];

export default function SettingsPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [isGuest, setIsGuest] = useState(false);
  const [settings, setSettings] = useState({
    sys_high: 140, sys_low: 90,
    dia_high: 90,  dia_low: 60,
    hr_high: 100,  hr_low: 60,
  });
  const [activePreset, setActivePreset] = useState('custom');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState('users');
  const [usersList, setUsersList] = useState([]);
  const [uploadTargetUser, setUploadTargetUser] = useState('');

  useEffect(() => {
    const user = sessionStorage.getItem('username');
    const guestState = sessionStorage.getItem('isGuest') === 'true';
    const userRole = sessionStorage.getItem('role') || 'users';
    if (!user) { router.push('/'); return; }
    setUsername(user);
    setIsGuest(guestState);
    setRole(userRole);

    if (userRole === 'admins') {
      fetch('/api/admin/users').then(res => res.json()).then(data => {
        if (data.users) {
          setUsersList(data.users);
          setUploadTargetUser(user); // 預設為自己
        }
      });
    }

    if (guestState) {
      setMessage({
        type: 'error',
        text: '🔒 訪客體驗模式僅開放查看血壓心跳資料，無法使用設定與匯入功能。'
      });
    }

    const target = guestState ? (sessionStorage.getItem('targetUser') || 'cvn') : user;

    fetch(`/api/settings?username=${target}`)
      .then(res => res.json())
      .then(data => {
        if (data.settings) {
          setSettings(data.settings);
          detectPreset(data.settings);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  /** 依照目前 sys_high/dia_high 值自動偵測使用哪種預設 */
  function detectPreset(s) {
    const sh = Number(s.sys_high);
    const dh = Number(s.dia_high);
    if (sh === 140 && dh === 90) { setActivePreset('standard1'); return; }
    if (sh === 130 && dh === 80) { setActivePreset('standard2'); return; }
    setActivePreset('custom');
  }

  const handleChange = (e) => {
    if (isGuest) return;
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: parseInt(value) || 0 }));
    setActivePreset('custom');
  };

  /** 點擊快速預設按鈕 */
  const applyPreset = (preset) => {
    if (isGuest) return;
    setActivePreset(preset.id);
    if (preset.id !== 'custom') {
      setSettings(prev => ({
        ...prev,
        sys_high: preset.sys_high,
        sys_low:  preset.sys_low,
        dia_high: preset.dia_high,
        dia_low:  preset.dia_low,
      }));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (isGuest) {
      setMessage({ type: 'error', text: '🔒 訪客體驗模式無法儲存設定！' });
      return;
    }
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, ...settings }),
      });
      setMessage(res.ok
        ? { type: 'success', text: '✅ 設定已成功儲存！' }
        : { type: 'error', text: '❌ 儲存失敗' });
    } catch { setMessage({ type: 'error', text: '❌ 伺服器連線錯誤' }); }
    finally { setSaving(false); }
  };

  const handleFileUpload = async (e) => {
    if (isGuest) {
      setMessage({ type: 'error', text: '🔒 訪客體驗模式無法匯入檔案！' });
      return;
    }
    const file = e.target.files[0];
    if (!file) return;

    if (role === 'admins') {
      if (!uploadTargetUser) {
        setMessage({ type: 'error', text: '請先選擇要匯入資料的目標用戶' });
        e.target.value = '';
        return;
      }
      if (!window.confirm(`防呆確認：\n您確定要把這份檔案匯入給【${uploadTargetUser}】嗎？\n請再次確認以避免覆蓋或匯錯資料。`)) {
        e.target.value = '';
        return;
      }
    }

    setUploading(true);
    setMessage({ type: '', text: '' });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('operator', username);
    formData.append('targetUser', role === 'admins' ? uploadTargetUser : username);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      setMessage(res.ok
        ? { type: 'success', text: `✅ ${data.message}` }
        : { type: 'error', text: `❌ ${data.error || '解析失敗'}` });
    } catch { setMessage({ type: 'error', text: '❌ 上傳過程發生錯誤' }); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleExport = () => {
    if (isGuest) {
      setMessage({ type: 'error', text: '🔒 訪客體驗模式無法匯出資料！' });
      return;
    }
    const target = role === 'admins' ? (uploadTargetUser || username) : username;
    if (role === 'admins' && !uploadTargetUser) {
      setMessage({ type: 'error', text: '請先選擇要匯出資料的目標用戶' });
      return;
    }
    window.location.href = `/api/export?operator=${username}&targetUser=${target}`;
  };

  // 血壓欄位
  const bpFields = [
    { label: '收縮壓 高標 (mmHg)', name: 'sys_high', color: '#22c55e' },
    { label: '收縮壓 低標 (mmHg)', name: 'sys_low',  color: '#22c55e' },
    { label: '舒張壓 高標 (mmHg)', name: 'dia_high', color: '#8b5cf6' },
    { label: '舒張壓 低標 (mmHg)', name: 'dia_low',  color: '#8b5cf6' },
  ];

  // 心跳欄位
  const hrFields = [
    { label: '心跳 高標 (bpm)', name: 'hr_high', color: '#ef4444' },
    { label: '心跳 低標 (bpm)', name: 'hr_low',  color: '#ef4444' },
  ];

  const inputStyle = (color) => ({
    padding: '8px 12px', borderRadius: 8,
    border: '1px solid #e2e8f0', fontSize: '1rem',
    fontWeight: 600, color: isGuest ? '#94a3b8' : '#1e293b',
    background: isGuest ? '#f1f5f9' : '#fff',
    outline: 'none', transition: 'border-color 0.2s',
    width: '100%', boxSizing: 'border-box',
    cursor: isGuest ? 'not-allowed' : 'text',
  });

  return (
    <div className="health-page">
      <header className="health-header">
        <button className="btn-back" onClick={() => router.push(isGuest ? '/dashboard/health' : '/dashboard')}>
          ← {isGuest ? '前往血壓心跳' : '返回'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h1>設定、匯入與匯出</h1>
          {isGuest && (
            <span style={{
              background: '#fee2e2',
              color: '#dc2626',
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '12px'
            }}>
              🔒 訪客模式 (唯讀)
            </span>
          )}
        </div>
        <div style={{ width: 60 }}></div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            <div className="spinner" style={{ margin: '0 auto 12px', borderTopColor: '#0ea5e9' }}></div>
            正在載入使用者設定...
          </div>
        ) : (
          <>
            {/* 訊息 */}
        {message.text && (
          <div style={{
            padding: '12px 16px', borderRadius: 10, marginBottom: 16,
            background: message.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: message.type === 'success' ? '#166534' : '#991b1b',
            fontSize: '0.9rem', fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8
          }}>
            <span>{message.text}</span>
            {isGuest && (
              <button
                onClick={() => router.push('/dashboard/health')}
                style={{
                  background: '#dc2626', color: '#fff', border: 'none',
                  padding: '4px 10px', borderRadius: 6, fontSize: '0.8rem',
                  fontWeight: 600, cursor: 'pointer'
                }}
              >
                前往血壓心跳資料 ›
              </button>
            )}
          </div>
        )}

        {/* 高低標設定 */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', opacity: isGuest ? 0.75 : 1 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>
            🎯 高低標範圍設定 {isGuest && <span style={{ fontSize: '0.8rem', color: '#dc2626' }}>(🔒 訪客不可修改)</span>}
          </h2>

          {/* ── 血壓快速預設 ── */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500, marginBottom: 8 }}>
              血壓界定標準（快速套用）
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {BP_PRESETS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  disabled={isGuest}
                  onClick={() => applyPreset(p)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: activePreset === p.id ? '2px solid #0ea5e9' : '1.5px solid #e2e8f0',
                    background: activePreset === p.id ? '#e0f2fe' : '#f8fafc',
                    color: activePreset === p.id ? '#0369a1' : '#475569',
                    fontWeight: activePreset === p.id ? 700 : 500,
                    fontSize: '0.82rem',
                    cursor: isGuest ? 'not-allowed' : 'pointer',
                    transition: 'all 0.18s',
                    textAlign: 'left',
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{p.label}</div>
                  <div style={{ fontSize: '0.74rem', opacity: 0.8 }}>{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSave}>
            {/* ── 血壓數值 ── */}
            <p style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500, marginBottom: 8 }}>
              血壓數值（可手動調整）
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {bpFields.map(f => (
                <div key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 500, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.color, display: 'inline-block', flexShrink: 0 }}></span>
                    {f.label}
                  </label>
                  <input
                    type="number" name={f.name} value={settings[f.name]}
                    onChange={handleChange} required disabled={isGuest}
                    style={inputStyle(f.color)}
                    onFocus={e => !isGuest && (e.target.style.borderColor = f.color)}
                    onBlur={e => !isGuest && (e.target.style.borderColor = '#e2e8f0')}
                  />
                </div>
              ))}
            </div>

            {/* ── 心跳數值 ── */}
            <p style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500, marginBottom: 8 }}>
              心跳數值（因人而異，請手動設定）
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {hrFields.map(f => (
                <div key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 500, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.color, display: 'inline-block', flexShrink: 0 }}></span>
                    {f.label}
                  </label>
                  <input
                    type="number" name={f.name} value={settings[f.name]}
                    onChange={handleChange} required disabled={isGuest}
                    style={inputStyle(f.color)}
                    onFocus={e => !isGuest && (e.target.style.borderColor = f.color)}
                    onBlur={e => !isGuest && (e.target.style.borderColor = '#e2e8f0')}
                  />
                </div>
              ))}
            </div>

            <button type="submit" disabled={saving || isGuest} style={{
              width: '100%', padding: '10px',
              background: isGuest ? '#cbd5e1' : '#0ea5e9',
              color: isGuest ? '#64748b' : '#fff',
              border: 'none',
              borderRadius: 8, fontWeight: 600, fontSize: '0.95rem',
              cursor: isGuest ? 'not-allowed' : 'pointer',
            }}>
              {isGuest ? '🔒 訪客模式禁止變更設定' : saving ? '儲存中...' : '💾 儲存設定'}
            </button>
          </form>
        </div>

        {/* 資料匯入 */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', opacity: isGuest ? 0.75 : 1 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>
            📤 資料匯入 {isGuest && <span style={{ fontSize: '0.8rem', color: '#dc2626' }}>(🔒 訪客不可匯入)</span>}
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 12 }}>
            上傳備份檔，系統將自動解析並將數據匯入至雲端。
            支援的格式有：SQLite (.db / .pb) 以及自訂格式的 .csv、.json 檔案。
          </p>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
             <a href="/api/download-sample?format=csv" download style={{ fontSize: '0.75rem', padding: '4px 8px', background: '#e2e8f0', color: '#475569', borderRadius: '4px', textDecoration: 'none' }}>⬇️ 下載 CSV 範例</a>
             <a href="/api/download-sample?format=json" download style={{ fontSize: '0.75rem', padding: '4px 8px', background: '#e2e8f0', color: '#475569', borderRadius: '4px', textDecoration: 'none' }}>⬇️ 下載 JSON 範例</a>
          </div>

          {role === 'admins' && (
            <div style={{ marginBottom: '16px', padding: '12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#92400e', marginBottom: '6px' }}>
                🛡️ 管理員代為匯入 (請選擇目標帳號)：
              </label>
              <select
                value={uploadTargetUser}
                onChange={(e) => setUploadTargetUser(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #fcd34d', outline: 'none' }}
              >
                <option value="">-- 點擊選擇目標用戶 --</option>
                {usersList.map(u => (
                  <option key={u.id} value={u.username}>
                    {u.display_name} ({u.pid}) {u.role === 'admins' ? '(管理員)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ position: 'relative', overflow: 'hidden' }}>
            <button disabled={uploading || isGuest} style={{
              width: '100%', padding: '14px',
              background: isGuest ? '#f1f5f9' : '#f8fafc',
              border: isGuest ? '2px dashed #cbd5e1' : '2px dashed #0ea5e9',
              borderRadius: 10, color: isGuest ? '#94a3b8' : '#0369a1',
              fontWeight: 500, fontSize: '0.9rem',
              cursor: isGuest ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}>
              {isGuest ? '🔒 訪客體驗模式不開放檔案匯入' : uploading ? '⏳ 解析匯入中...' : '📁 點擊選擇檔案 (.bp, .db, .csv, .json)'}
            </button>
            <input
              type="file" accept=".bp,.db,.csv,.json"
              onChange={handleFileUpload} disabled={uploading || isGuest}
              style={{ position: 'absolute', left: 0, top: 0, opacity: 0, cursor: isGuest ? 'not-allowed' : 'pointer', height: '100%', width: '100%' }}
            />
          </div>

          {/* 資料匯出 */}
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>
              📥 資料匯出
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 12 }}>
              下載選擇對象的所有歷史紀錄，格式為標準 CSV。
            </p>
            <button onClick={handleExport} disabled={isGuest} style={{
              width: '100%', padding: '12px',
              background: isGuest ? '#f1f5f9' : '#fff',
              border: isGuest ? '2px solid #cbd5e1' : '2px solid #10b981',
              borderRadius: 10, color: isGuest ? '#94a3b8' : '#059669',
              fontWeight: 600, fontSize: '0.9rem',
              cursor: isGuest ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}>
              {isGuest ? '🔒 訪客不可匯出' : '📥 點擊下載 CSV'}
            </button>
          </div>
        </div>
        </>)}
      </div>
    </div>
  );
}
