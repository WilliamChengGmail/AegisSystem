'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceArea, ReferenceLine
} from 'recharts';

// 時間區間選項
const RANGES = [
  { label: '3天', value: '3' },
  { label: '一週', value: '7' },
  { label: '雙週', value: '14' },
  { label: '一月', value: '30' },
  { label: '三月', value: '90' },
  { label: '半年', value: '180' },
  { label: '一年', value: '365' },
  { label: '全部', value: 'all' },
];

// 格式化日期
function fmtDate(dateStr) {
  const d = new Date(dateStr);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
function fmtTime(dateStr) {
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function fmtFull(dateStr) {
  return `${fmtDate(dateStr)} ${fmtTime(dateStr)}`;
}

// 依日期分組
function groupByDate(rows) {
  const groups = {};
  rows.forEach(r => {
    const key = fmtDate(r.date);
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });
  return Object.entries(groups);
}

// 計算日均值
function avgOf(rows, field) {
  const vals = rows.map(r => r[field]).filter(v => v != null);
  if (vals.length === 0) return '--';
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export default function HealthDashboard() {
  const router = useRouter();
  const [data, setData] = useState([]);          // 原始資料 (DESC)
  const [chartData, setChartData] = useState([]); // 圖表用 (ASC)
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeRange, setActiveRange] = useState('3');

  // 捲動連動高亮
  const [hlStart, setHlStart] = useState(null);
  const [hlEnd, setHlEnd] = useState(null);
  const tableRef = useRef(null);
  const rowRefs = useRef({});

  const fetchData = useCallback(async (range) => {
    setLoading(true);
    const user = sessionStorage.getItem('username');
    if (!user) { router.push('/'); return; }

    try {
      const res = await fetch(`/api/health?username=${user}&range=${range}`);
      const json = await res.json();
      if (json.data) {
        setData(json.data);  // DESC
        // 圖表用的反轉資料 (ASC)
        const ascending = [...json.data].reverse().map(d => ({
          ...d,
          label: fmtFull(d.date),
          shortLabel: fmtDate(d.date),
        }));
        setChartData(ascending);
        setSettings(json.settings);
      }
    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const user = sessionStorage.getItem('username');
    if (!user) { router.push('/'); return; }
    fetchData(activeRange);
  }, [router, activeRange, fetchData]);

  const handleRangeChange = (val) => {
    setActiveRange(val);
  };

  // 表格捲動 => 更新圖表高亮區
  const handleScroll = useCallback(() => {
    if (!tableRef.current || data.length === 0) return;
    const container = tableRef.current;
    const scrollTop = container.scrollTop;
    const scrollBottom = scrollTop + container.clientHeight;

    const visibleDates = [];
    Object.entries(rowRefs.current).forEach(([dateStr, el]) => {
      if (!el) return;
      const top = el.offsetTop;
      const bottom = top + el.clientHeight;
      if (bottom >= scrollTop && top <= scrollBottom) {
        visibleDates.push(dateStr);
      }
    });

    if (visibleDates.length > 0) {
      // 找到 chartData 裡對應的 label
      const firstDate = visibleDates[visibleDates.length - 1]; // 最舊（表格最下方）
      const lastDate = visibleDates[0]; // 最新（表格最上方）

      // 在 chartData 中找匹配的 label
      const matchStart = chartData.find(d => fmtFull(d.date) === firstDate);
      const matchEnd = chartData.find(d => fmtFull(d.date) === lastDate);

      if (matchStart && matchEnd) {
        setHlStart(matchStart.label);
        setHlEnd(matchEnd.label);
      }
    }
  }, [data, chartData]);

  // 判斷是否超標
  const isWarning = (val, type) => {
    if (!settings || val == null) return false;
    switch(type) {
      case 'sys': return val > settings.sys_high || val < settings.sys_low;
      case 'dia': return val > settings.dia_high || val < settings.dia_low;
      case 'pul': return val > settings.hr_high || val < settings.hr_low;
      default: return false;
    }
  };

  const valStyle = (val, type) =>
    isWarning(val, type)
      ? { color: '#ef4444', fontWeight: 700 }
      : {};

  const grouped = groupByDate(data);

  return (
    <div className="health-page">
      {/* 頂部返回與標題 */}
      <header className="health-header">
        <button className="btn-back" onClick={() => router.push('/dashboard')}>← 返回</button>
        <h1>血壓心跳紀錄</h1>
        <div style={{ width: 60 }}></div>
      </header>

      {/* 時間區間選擇 */}
      <div className="range-bar">
        {RANGES.map(r => (
          <button
            key={r.value}
            className={`range-btn ${activeRange === r.value ? 'active' : ''}`}
            onClick={() => handleRangeChange(r.value)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-box">
          <div className="spinner"></div>
          <p>載入數據中...</p>
        </div>
      ) : data.length === 0 ? (
        <div className="empty-box">
          <p>🩺 尚無血壓心跳數據</p>
          <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>請先至「設定與匯入」上傳備份檔案</p>
        </div>
      ) : (
        <>
          {/* ===== 折線圖 ===== */}
          <div className="chart-container">
            <div className="chart-legend">
              <span className="legend-item" style={{ '--dot-color': '#22c55e' }}>高壓</span>
              <span className="legend-item" style={{ '--dot-color': '#8b5cf6' }}>低壓</span>
              <span className="legend-item" style={{ '--dot-color': '#ef4444' }}>心率</span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 10, right: 16, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis
                  dataKey="shortLabel"
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 'dataMax + 20']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    fontSize: 13,
                  }}
                  labelFormatter={(label) => `日期: ${label}`}
                />

                {/* 捲動連動淡色高亮區塊 */}
                {hlStart && hlEnd && (
                  <ReferenceArea
                    x1={hlStart} x2={hlEnd}
                    fill="rgba(59, 130, 246, 0.08)"
                    stroke="rgba(59, 130, 246, 0.2)"
                    strokeDasharray="4 4"
                  />
                )}

                {/* 高低標參考線 */}
                {settings && (
                  <>
                    <ReferenceLine y={settings.sys_high} stroke="#ef4444" strokeDasharray="6 3" strokeWidth={1} />
                    <ReferenceLine y={settings.sys_low} stroke="#f97316" strokeDasharray="6 3" strokeWidth={1} />
                  </>
                )}

                <Line type="monotone" dataKey="sys" name="收縮壓" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 3, fill: '#22c55e' }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="dia" name="舒張壓" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3, fill: '#8b5cf6' }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="pul" name="心率" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: '#ef4444' }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ===== 資料表格（卡片式） ===== */}
          <div className="data-table-wrapper" ref={tableRef} onScroll={handleScroll}>
            {grouped.map(([dateLabel, rows]) => (
              <div key={dateLabel} className="date-group">
                {/* 日均平均值 */}
                <div className="date-avg-row">
                  <span className="date-badge">{dateLabel}</span>
                  <div className="avg-values">
                    <span className="avg-val sys">{avgOf(rows, 'sys')}</span>
                    <span className="avg-sep">/</span>
                    <span className="avg-val dia">{avgOf(rows, 'dia')}</span>
                    <span className="avg-heart">❤️ {avgOf(rows, 'pul')}</span>
                  </div>
                  <span className="avg-label">平均值</span>
                </div>

                {/* 個別紀錄 */}
                {rows.map((row) => (
                  <div
                    key={row.date}
                    className="record-row"
                    ref={(el) => (rowRefs.current[fmtFull(row.date)] = el)}
                  >
                    <span className="record-time">{fmtTime(row.date)}</span>
                    <span className="record-val" style={valStyle(row.sys, 'sys')}>{row.sys}</span>
                    <span className="record-sep">/</span>
                    <span className="record-val" style={valStyle(row.dia, 'dia')}>{row.dia}</span>
                    <span className="record-heart" style={valStyle(row.pul, 'pul')}>❤️ {row.pul}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
