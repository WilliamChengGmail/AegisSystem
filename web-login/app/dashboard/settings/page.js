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
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [copiedError, setCopiedError] = useState(false);
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

    const targetUser = role === 'admins' ? uploadTargetUser : username;

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
    setUploadProgressText('正在傳送檔案至伺服器並解析資料庫...');
    setMessage({ type: '', text: '' });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('operator', username);
    formData.append('targetUser', targetUser);

    // 動態狀態提示排程
    const progressTimer = setTimeout(() => {
      setUploadProgressText('正在進行雲端資料庫批次同步 (Batch Inserting)，請稍候...');
    }, 1500);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      clearTimeout(progressTimer);

      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        throw new Error(`伺服器回應異常 (HTTP ${res.status} ${res.statusText})`);
      }

      if (!res.ok) {
        setMessage({
          type: 'error',
          text: `❌ ${data.error || '匯入失敗'}`,
          details: data.details || `HTTP 狀態碼: ${res.status}`,
          errorId: data.errorId || `ERR-HTTP-${res.status}`,
          timestamp: data.timestamp || new Date().toLocaleString(),
          fileInfo: `${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
          operator: username,
          targetUser: targetUser
        });
      } else {
        setMessage({
          type: 'success',
          text: `✅ ${data.message}`
        });
      }
    } catch (err) {
      clearTimeout(progressTimer);
      console.error('Upload Error:', err);
      setMessage({
        type: 'error',
        text: '❌ 上傳失敗或連線逾時',
        details: err.message || '連線中斷或伺服器處理逾時，請檢查網路連線或聯繫管理員',
        errorId: `ERR-NET-${Date.now().toString(36).toUpperCase()}`,
        timestamp: new Date().toLocaleString(),
        fileInfo: `${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
        operator: username,
        targetUser: targetUser
      });
    } finally {
      setUploading(false);
      setUploadProgressText('');
      e.target.value = '';
    }
  };

  const copyDiagnosticInfo = () => {
    if (!message) return;
    const report = [
      '【Aegis 系統檔案匯入錯誤報告】',
      `發生時間：${message.timestamp || new Date().toLocaleString()}`,
      `操作人員：${message.operator || username}`,
      `目標帳號：${message.targetUser || username}`,
      `檔案資訊：${message.fileInfo || '未提供'}`,
      `錯誤摘要：${message.text || '上傳失敗'}`,
      `追蹤代碼：${message.errorId || 'N/A'}`,
      `詳細原因：${message.details || '無詳細資訊'}`,
      '----------------------------------------',
      '請將此資訊提供給系統維護端 (Office of William) 協助查找問題。'
    ].join('\n');

    navigator.clipboard.writeText(report).then(() => {
      setCopiedError(true);
      setTimeout(() => setCopiedError(false), 3000);
    }).catch(() => {
      alert('複製失敗，請手動複製錯誤資訊');
    });
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
            padding: '14px 16px', borderRadius: 10, marginBottom: 16,
            background: message.type === 'success' ? '#dcfce7' : '#fef2f2',
            border: message.type === 'success' ? '1px solid #86efac' : '1px solid #fecaca',
            color: message.type === 'success' ? '#166534' : '#991b1b',
            fontSize: '0.9rem', fontWeight: 500,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{message.text}</span>
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

            {/* 若為錯誤且有詳細資訊，顯示輔助診斷資訊與複製按鈕 */}
            {message.type === 'error' && (message.details || message.errorId) && (
              <div style={{
                marginTop: 10, paddingTop: 10, borderTop: '1px dashed #fca5a5',
                fontSize: '0.82rem', color: '#7f1d1d'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 8px', marginBottom: 8 }}>
                  {message.errorId && (
                    <>
                      <span style={{ fontWeight: 600 }}>追蹤代碼：</span>
                      <code style={{ background: '#fee2e2', padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace' }}>{message.errorId}</code>
                    </>
                  )}
                  {message.details && (
                    <>
                      <span style={{ fontWeight: 600 }}>詳細原因：</span>
                      <span>{message.details}</span>
                    </>
                  )}
                  {message.fileInfo && (
                    <>
                      <span style={{ fontWeight: 600 }}>相關檔案：</span>
                      <span>{message.fileInfo}</span>
                    </>
                  )}
                  {message.timestamp && (
                    <>
                      <span style={{ fontWeight: 600 }}>發生時間：</span>
                      <span>{message.timestamp}</span>
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={copyDiagnosticInfo}
                    style={{
                      background: copiedError ? '#15803d' : '#b91c1c',
                      color: '#fff', border: 'none',
                      padding: '5px 12px', borderRadius: 6,
                      fontSize: '0.78rem', fontWeight: 600,
                      cursor: 'pointer', transition: 'background 0.2s'
                    }}
                  >
                    {copiedError ? '✅ 已複製錯誤資訊！' : '📋 複製除錯資訊 (提供維護端)'}
                  </button>
                  <span style={{ fontSize: '0.74rem', color: '#991b1b', opacity: 0.85 }}>
                    若問題持續，請複製資訊並通知系統管理人員 (Office of William)。
                  </span>
                </div>
              </div>
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
            <div className="settings-grid">
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
            <div className="settings-grid">
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
              background: isGuest ? '#f1f5f9' : uploading ? '#f0f9ff' : '#f8fafc',
              border: isGuest ? '2px dashed #cbd5e1' : uploading ? '2px dashed #38bdf8' : '2px dashed #0ea5e9',
              borderRadius: 10, color: isGuest ? '#94a3b8' : uploading ? '#0284c7' : '#0369a1',
              fontWeight: 600, fontSize: '0.9rem',
              cursor: isGuest || uploading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}>
              {isGuest ? '🔒 訪客體驗模式不開放檔案匯入' : uploading ? '⏳ 檔案處理與同步中...' : '📁 點擊選擇檔案 (.bp, .db, .csv, .json)'}
            </button>
            <input
              type="file" accept=".bp,.db,.csv,.json"
              onChange={handleFileUpload} disabled={uploading || isGuest}
              style={{ position: 'absolute', left: 0, top: 0, opacity: 0, cursor: isGuest || uploading ? 'not-allowed' : 'pointer', height: '100%', width: '100%' }}
            />
          </div>

          {/* 匯入處理中之動態提示卡片 */}
          {uploading && (
            <div style={{
              marginTop: 12, padding: '12px 14px',
              background: '#f0f9ff', border: '1px solid #bae6fd',
              borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12,
              animation: 'pulse 2s infinite'
            }}>
              <div className="spinner" style={{
                width: 20, height: 20, borderWidth: 2,
                borderTopColor: '#0284c7', flexShrink: 0
              }}></div>
              <div style={{ fontSize: '0.85rem', color: '#0369a1', lineHeight: 1.4 }}>
                <div style={{ fontWeight: 700 }}>
                  {uploadProgressText || '正在處理檔案，請稍候...'}
                </div>
                <div style={{ fontSize: '0.76rem', color: '#0284c7', marginTop: 2 }}>
                  系統正進行雲端資料批次校驗與寫入，請勿關閉網頁或切換頁面以確保資料完整性。
                </div>
              </div>
            </div>
          )}

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
