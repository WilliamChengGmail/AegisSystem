'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Brush, ReferenceLine
} from 'recharts';

// ========== 常數 ==========

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

// ========== 工具函數 ==========

/** 解析 "YYYY-MM-DD HH:MM:SS" 字串，不做時區轉換（資料庫已是 UTC+8） */
function parseLocalDate(dateStr) {
  const [datePart, timePart] = dateStr.split(' ');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, ss] = (timePart || '00:00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, ss);
}

/** 格式化為 MM/DD */
function fmtDate(dateStr) {
  const d = parseLocalDate(dateStr);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

/** 格式化為 HH:MM */
function fmtTime(dateStr) {
  const d = parseLocalDate(dateStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 格式化為 YYYY-MM-DD */
function fmtISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * 將一筆量測紀錄指派到邏輯日期與時段。
 * - 凌晨 00:00 ~ 02:29 → 歸屬到「前一天的晚上」
 * - 02:30 ~ 11:59 → 早上
 * - 12:00 ~ 17:59 → 午間
 * - 18:00 ~ 23:59 → 晚上
 */
function assignLogicalDate(dateStr) {
  const d = parseLocalDate(dateStr);
  const hour = d.getHours();
  const minute = d.getMinutes();
  const totalMinutes = hour * 60 + minute;

  let logicalDate;
  let period;

  if (totalMinutes < 150) {
    // 00:00 ~ 02:29 → 前一天的晚上
    const prev = new Date(d);
    prev.setDate(prev.getDate() - 1);
    logicalDate = fmtISO(prev);
    period = 'evening';
  } else if (totalMinutes < 720) {
    // 02:30 ~ 11:59 → 早上
    logicalDate = fmtISO(d);
    period = 'morning';
  } else if (totalMinutes < 1080) {
    // 12:00 ~ 17:59 → 午間
    logicalDate = fmtISO(d);
    period = 'afternoon';
  } else {
    // 18:00 ~ 23:59 → 晚上
    logicalDate = fmtISO(d);
    period = 'evening';
  }

  return { logicalDate, period, localHour: hour };
}

/** 計算陣列中某欄位的平均值 */
function avgOf(rows, field) {
  const vals = rows.map(r => r[field]).filter(v => v != null);
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/**
 * 將原始量測資料依邏輯日期分組。
 * 回傳: [{ logicalDate, allAvg, morningAvg, afternoonAvg, eveningAvg,
 *          morningRows, afternoonRows, eveningRows, allRows }]
 * 排序: 日期從新到舊
 */
function groupByLogicalDate(rows) {
  const map = {};

  rows.forEach(r => {
    const { logicalDate, period } = assignLogicalDate(r.date);
    if (!map[logicalDate]) {
      map[logicalDate] = { morning: [], afternoon: [], evening: [], all: [] };
    }
    const enriched = { ...r, period };
    map[logicalDate][period].push(enriched);
    map[logicalDate].all.push(enriched);
  });

  // 轉為陣列，新到舊排序
  return Object.entries(map)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([logicalDate, g]) => ({
      logicalDate,
      displayDate: `${logicalDate.substring(5).replace('-', '/')}`,
      allAvg: { sys: avgOf(g.all, 'sys'), dia: avgOf(g.all, 'dia'), pul: avgOf(g.all, 'pul') },
      morningAvg: g.morning.length > 0
        ? { sys: avgOf(g.morning, 'sys'), dia: avgOf(g.morning, 'dia'), pul: avgOf(g.morning, 'pul') } : null,
      afternoonAvg: g.afternoon.length > 0
        ? { sys: avgOf(g.afternoon, 'sys'), dia: avgOf(g.afternoon, 'dia'), pul: avgOf(g.afternoon, 'pul') } : null,
      eveningAvg: g.evening.length > 0
        ? { sys: avgOf(g.evening, 'sys'), dia: avgOf(g.evening, 'dia'), pul: avgOf(g.evening, 'pul') } : null,
      morningRows: g.morning.sort((a, b) => b.date.localeCompare(a.date)),
      afternoonRows: g.afternoon.sort((a, b) => b.date.localeCompare(a.date)),
      eveningRows: g.evening.sort((a, b) => b.date.localeCompare(a.date)),
      allRows: g.all.sort((a, b) => b.date.localeCompare(a.date)),
    }));
}

/**
 * 依時間區間過濾原始資料 (前端篩選)。
 * range: '3','7','14'... 或 'all' 或 'custom'
 */
function filterByRange(allData, range, customStart, customEnd) {
  if (range === 'all') return allData;

  if (range === 'custom' && customStart && customEnd) {
    const startStr = `${customStart} 00:00:00`;
    const endStr = `${customEnd} 23:59:59`;
    return allData.filter(r => r.date >= startStr && r.date <= endStr);
  }

  const days = parseInt(range) || 3;
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = fmtISO(cutoff) + ' 00:00:00';

  return allData.filter(r => r.date >= cutoffStr);
}

/**
 * 從分組資料建立圖表用的「每日平均」陣列（舊→新排序）。
 */
function buildChartData(grouped) {
  return [...grouped].reverse().map(g => ({
    name: g.displayDate,
    logicalDate: g.logicalDate,
    sys: g.allAvg.sys,
    dia: g.allAvg.dia,
    pul: g.allAvg.pul,
  }));
}

// ========== 主元件 ==========

export default function HealthDashboard() {
  const router = useRouter();

  // 全部原始資料（僅從 API 拉一次）
  const [allData, setAllData] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  // 篩選狀態
  const [activeRange, setActiveRange] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Brush 連動
  const [brushRange, setBrushRange] = useState(null);

  // 表格捲動連動
  const tableRef = useRef(null);
  const dateGroupRefs = useRef({});

  // ===== 資料讀取 (僅一次) =====
  useEffect(() => {
    const user = sessionStorage.getItem('username');
    if (!user) { router.push('/'); return; }

    (async () => {
      try {
        const res = await fetch(`/api/health?username=${user}`);
        const json = await res.json();
        if (json.data) {
          setAllData(json.data);
          setSettings(json.settings);
        }
      } catch (e) {
        console.error('Fetch error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  // ===== 前端篩選 =====
  const filteredData = useMemo(() => {
    return filterByRange(allData, activeRange, customStart, customEnd);
  }, [allData, activeRange, customStart, customEnd]);

  // ===== 分組 =====
  const grouped = useMemo(() => {
    return groupByLogicalDate(filteredData);
  }, [filteredData]);

  // ===== 圖表資料 (每日平均, 舊→新) =====
  const chartData = useMemo(() => {
    return buildChartData(grouped);
  }, [grouped]);

  // ===== Brush 可見的表格分組 =====
  const visibleGrouped = useMemo(() => {
    if (!brushRange || chartData.length === 0) return grouped;
    const { startIndex, endIndex } = brushRange;
    // chartData 是舊→新，取得可見日期清單
    const visibleDates = new Set(
      chartData.slice(startIndex, endIndex + 1).map(d => d.logicalDate)
    );
    // grouped 是新→舊，篩選出可見日期
    return grouped.filter(g => visibleDates.has(g.logicalDate));
  }, [brushRange, chartData, grouped]);

  // ===== Brush 改變 =====
  const handleBrushChange = useCallback((range) => {
    if (range) {
      setBrushRange({ startIndex: range.startIndex, endIndex: range.endIndex });
    }
  }, []);

  // ===== 判斷超標 =====
  const isWarning = useCallback((val, type) => {
    if (!settings || val == null) return false;
    switch (type) {
      case 'sys': return val > settings.sys_high || val < settings.sys_low;
      case 'dia': return val > settings.dia_high || val < settings.dia_low;
      case 'pul': return val > settings.hr_high || val < settings.hr_low;
      default: return false;
    }
  }, [settings]);

  const valStyle = useCallback((val, type) =>
    isWarning(val, type)
      ? { color: '#ef4444', fontWeight: 700 }
      : {}
  , [isWarning]);

  // ===== 時段 Emoji =====
  const periodIcon = (period) => {
    switch (period) {
      case 'morning': return '☀️';
      case 'afternoon': return '🌤️';
      case 'evening': return '🌙';
      default: return '';
    }
  };

  // ===== 渲染平均值片段 =====
  const renderAvgBadge = (label, avg, icon) => {
    if (!avg) return null;
    return (
      <span className="period-avg-badge">
        <span className="period-avg-icon">{icon}</span>
        <span style={valStyle(avg.sys, 'sys')}>{avg.sys}</span>
        <span className="avg-sep">/</span>
        <span style={valStyle(avg.dia, 'dia')}>{avg.dia}</span>
        <span className="avg-heart" style={valStyle(avg.pul, 'pul')}>❤️{avg.pul}</span>
      </span>
    );
  };

  return (
    <div className="health-page">
      {/* 頂部 */}
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
            onClick={() => { setActiveRange(r.value); setBrushRange(null); }}
          >
            {r.label}
          </button>
        ))}
        <button
          className={`range-btn ${activeRange === 'custom' ? 'active' : ''}`}
          onClick={() => { setActiveRange('custom'); setBrushRange(null); }}
        >
          自訂
        </button>

        {activeRange === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
            />
            <span style={{ color: '#64748b', fontSize: '0.8rem' }}>至</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading-box">
          <div className="spinner"></div>
          <p>載入數據中...</p>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="empty-box">
          <p>🩺 尚無血壓心跳數據</p>
          <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>此時間範圍內無量測紀錄</p>
        </div>
      ) : (
        <>
          {/* ===== 折線圖 (每日平均) ===== */}
          <div className="chart-container">
            <div className="chart-legend">
              <span className="legend-item" style={{ '--dot-color': '#22c55e' }}>高壓(均)</span>
              <span className="legend-item" style={{ '--dot-color': '#8b5cf6' }}>低壓(均)</span>
              <span className="legend-item" style={{ '--dot-color': '#ef4444' }}>心率(均)</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 10, right: 16, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  domain={['dataMin - 10', 'dataMax + 10']}
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
                  formatter={(value, name) => {
                    const nameMap = { sys: '收縮壓', dia: '舒張壓', pul: '心率' };
                    return [value, nameMap[name] || name];
                  }}
                />

                {/* 高低標參考線 */}
                {settings && (
                  <>
                    <ReferenceLine y={settings.sys_high} stroke="#ef4444" strokeDasharray="6 3" strokeWidth={1} label={{ value: `高壓高標 ${settings.sys_high}`, position: 'right', fontSize: 10, fill: '#ef4444' }} />
                    <ReferenceLine y={settings.sys_low} stroke="#f97316" strokeDasharray="6 3" strokeWidth={1} />
                  </>
                )}

                <Line type="monotone" dataKey="sys" name="sys" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 3, fill: '#22c55e' }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="dia" name="dia" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3, fill: '#8b5cf6' }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="pul" name="pul" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: '#ef4444' }} activeDot={{ r: 5 }} />

                {/* Brush 拖曳選擇器 */}
                {chartData.length > 5 && (
                  <Brush
                    dataKey="name"
                    height={28}
                    stroke="#0ea5e9"
                    fill="rgba(14, 165, 233, 0.05)"
                    travellerWidth={10}
                    onChange={handleBrushChange}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ===== 資料表格 ===== */}
          <div className="data-table-wrapper" ref={tableRef}>
            {visibleGrouped.map(g => (
              <div
                key={g.logicalDate}
                className="date-group"
                ref={(el) => (dateGroupRefs.current[g.logicalDate] = el)}
              >
                {/* 日期標題列：全日平均 + 各時段平均 */}
                <div className="date-header-row">
                  <div className="date-header-top">
                    <span className="date-badge">{g.displayDate}</span>
                    <span className="date-header-allavg">
                      <span className="allavg-label">全日均</span>
                      <span style={valStyle(g.allAvg.sys, 'sys')}>{g.allAvg.sys}</span>
                      <span className="avg-sep">/</span>
                      <span style={valStyle(g.allAvg.dia, 'dia')}>{g.allAvg.dia}</span>
                      <span className="avg-heart" style={valStyle(g.allAvg.pul, 'pul')}>❤️{g.allAvg.pul}</span>
                    </span>
                  </div>
                  <div className="date-header-periods">
                    {renderAvgBadge('早上', g.morningAvg, '☀️')}
                    {renderAvgBadge('午間', g.afternoonAvg, '🌤️')}
                    {renderAvgBadge('晚上', g.eveningAvg, '🌙')}
                  </div>
                </div>

                {/* 明細列 */}
                {g.allRows.map((row, idx) => (
                  <div key={`${row.date}-${idx}`} className={`record-row period-${row.period}`}>
                    <span className="record-period-icon">{periodIcon(row.period)}</span>
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
