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
  const [settings, setSettings] = useState({
    sys_high: 140, sys_low: 90,
    dia_high: 90,  dia_low: 60,
    hr_high: 100,  hr_low: 60,
  });
  const [activePreset, setActivePreset] = useState('custom');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    const user = sessionStorage.getItem('username');
    if (!user) { router.push('/'); return; }
    setUsername(user);

    fetch(`/api/settings?username=${user}`)
      .then(res => res.json())
      .then(data => {
        if (data.settings) {
          setSettings(data.settings);
          // 根據讀取值自動對應預設
          detectPreset(data.settings);
        }
      })
      .catch(() => {});
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
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: parseInt(value) || 0 }));
    setActivePreset('custom'); // 手動修改後切換為自訂
  };

  /** 點擊快速預設按鈕 */
  const applyPreset = (preset) => {
    setActivePreset(preset.id);
    if (preset.id !== 'custom') {
      setSettings(prev => ({
        ...prev,
        sys_high: preset.sys_high,
        sys_low:  preset.sys_low,
        dia_high: preset.dia_high,
        dia_low:  preset.dia_low,
        // hr_high / hr_low 維持不變，由使用者手動設定
      }));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
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
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setMessage({ type: '', text: '' });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('username', username);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      setMessage(res.ok
        ? { type: 'success', text: `✅ ${data.message || '上傳成功'}` }
        : { type: 'error', text: `❌ ${data.error || '解析失敗'}` });
    } catch { setMessage({ type: 'error', text: '❌ 上傳過程發生錯誤' }); }
    finally { setUploading(false); }
  };

  // 血壓欄位（由預設快速填入，也可手動覆蓋）
  const bpFields = [
    { label: '收縮壓 高標 (mmHg)', name: 'sys_high', color: '#22c55e' },
    { label: '收縮壓 低標 (mmHg)', name: 'sys_low',  color: '#22c55e' },
    { label: '舒張壓 高標 (mmHg)', name: 'dia_high', color: '#8b5cf6' },
    { label: '舒張壓 低標 (mmHg)', name: 'dia_low',  color: '#8b5cf6' },
  ];

  // 心跳欄位（純手動）
  const hrFields = [
    { label: '心跳 高標 (bpm)', name: 'hr_high', color: '#ef4444' },
    { label: '心跳 低標 (bpm)', name: 'hr_low',  color: '#ef4444' },
  ];

  const inputStyle = (color) => ({
    padding: '8px 12px', borderRadius: 8,
    border: '1px solid #e2e8f0', fontSize: '1rem',
    fontWeight: 600, color: '#1e293b',
    outline: 'none', transition: 'border-color 0.2s',
    width: '100%', boxSizing: 'border-box',
  });

  return (
    <div className="health-page">
      <header className="health-header">
        <button className="btn-back" onClick={() => router.push('/dashboard')}>← 返回</button>
        <h1>設定與匯入</h1>
        <div style={{ width: 60 }}></div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px' }}>
        {/* 訊息 */}
        {message.text && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, marginBottom: 12,
            background: message.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: message.type === 'success' ? '#166534' : '#991b1b',
            fontSize: '0.9rem', fontWeight: 500,
          }}>
            {message.text}
          </div>
        )}

        {/* 高低標設定 */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>
            🎯 高低標範圍設定
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
                  onClick={() => applyPreset(p)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: activePreset === p.id ? '2px solid #0ea5e9' : '1.5px solid #e2e8f0',
                    background: activePreset === p.id ? '#e0f2fe' : '#f8fafc',
                    color: activePreset === p.id ? '#0369a1' : '#475569',
                    fontWeight: activePreset === p.id ? 700 : 500,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
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
                    onChange={handleChange} required
                    style={inputStyle(f.color)}
                    onFocus={e => e.target.style.borderColor = f.color}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  />
                </div>
              ))}
            </div>

            {/* ── 心跳數值（手動） ── */}
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
                    onChange={handleChange} required
                    style={inputStyle(f.color)}
                    onFocus={e => e.target.style.borderColor = f.color}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  />
                </div>
              ))}
            </div>

            <button type="submit" disabled={saving} style={{
              width: '100%', padding: '10px',
              background: '#0ea5e9', color: '#fff', border: 'none',
              borderRadius: 8, fontWeight: 600, fontSize: '0.95rem',
              cursor: 'pointer',
            }}>
              {saving ? '儲存中...' : '💾 儲存設定'}
            </button>
          </form>
        </div>

        {/* 資料匯入 */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>
            📤 資料匯入
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 12 }}>
            上傳 .bp 或 .db 備份檔，系統將自動解析並將血壓心跳數據匯入至雲端資料庫。
          </p>
          <div style={{ position: 'relative', overflow: 'hidden' }}>
            <button disabled={uploading} style={{
              width: '100%', padding: '14px',
              background: '#f8fafc', border: '2px dashed #cbd5e1',
              borderRadius: 10, color: '#64748b',
              fontWeight: 500, fontSize: '0.9rem', cursor: 'pointer',
              transition: 'all 0.2s',
            }}>
              {uploading ? '⏳ 解析匯入中...' : '📁 點擊選擇檔案 (.bp / .db)'}
            </button>
            <input
              type="file" accept=".bp,.db"
              onChange={handleFileUpload} disabled={uploading}
              style={{ position: 'absolute', left: 0, top: 0, opacity: 0, cursor: 'pointer', height: '100%', width: '100%' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
