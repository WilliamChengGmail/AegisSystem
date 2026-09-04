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

/** 格式化為 YYYY/MM/DD */
function fmtDate(dateStr) {
  const d = parseLocalDate(dateStr);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

/** 格式化為 HH:MM:SS */
function fmtTime(dateStr) {
  const d = parseLocalDate(dateStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
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
      displayDate: `${logicalDate.replace(/-/g, '/')}`,
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
 * 將原始量測資料依時間排序後，依據「兩分鐘內」規則分批。
 * 回傳: [[row, row, ...], [row, ...], ...]
 */
function groupIntoBatches(rows) {
  if (rows.length === 0) return [];
  // 依時間由舊到新排序
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const batches = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = parseLocalDate(sorted[i - 1].date);
    const curr = parseLocalDate(sorted[i].date);
    const diffMs = Math.abs(curr - prev);
    if (diffMs <= 120000) { // 2 分鐘 = 120,000 毫秒
      batches[batches.length - 1].push(sorted[i]);
    } else {
      batches.push([sorted[i]]);
    }
  }
  return batches;
}

/**
 * 對分批後的資料套用篩選條件。
 * option: 'none' | 'first_two' | 'last_two' | 'highest_two_sys' | 'lowest_two_sys'
 * 回傳: 過濾後的一維陣列。
 */
function applyBatchFilter(rows, option) {
  if (option === 'none') return rows;
  const batches = groupIntoBatches(rows);
  const result = [];

  batches.forEach(batch => {
    if (batch.length <= 2) {
      // 批次筆數不超過 2，全數保留
      result.push(...batch);
      return;
    }

    let picked;
    switch (option) {
      case 'first_two':
        // 時間最早的 2 筆（batch 已由舊到新排序）
        picked = batch.slice(0, 2);
        break;
      case 'last_two':
        // 時間最晚的 2 筆
        picked = batch.slice(-2);
        break;
      case 'highest_two_sys':
        // 收縮壓最高的 2 筆
        picked = [...batch].sort((a, b) => (b.sys ?? 0) - (a.sys ?? 0)).slice(0, 2);
        break;
      case 'lowest_two_sys':
        // 收縮壓最低的 2 筆
        picked = [...batch].sort((a, b) => (a.sys ?? 999) - (b.sys ?? 999)).slice(0, 2);
        break;
      default:
        picked = batch;
    }
    result.push(...picked);
  });

  return result;
}

/**
 * 從分組資料建立圖表用的「每日平均」陣列（舊→新排序）。
 * ignoreMissing=false → 自動填補缺失日期（值為 null），使折線圖出現斷點以標示缺少量測。
 * ignoreMissing=true  → 僅回傳有資料的日期，折線圖會自動連接。
 */
function buildChartData(grouped, ignoreMissing = false) {
  const sorted = [...grouped].reverse(); // 舊→新
  if (sorted.length < 2 || ignoreMissing) {
    return sorted.map(g => ({
      name: g.displayDate,
      logicalDate: g.logicalDate,
      sys: g.allAvg.sys,
      dia: g.allAvg.dia,
      pul: g.allAvg.pul,
      isMissing: false,
      allRows: g.allRows || [],
    }));
  }

  const result = [];
  const startDate = parseLocalDate(sorted[0].logicalDate + ' 00:00:00');
  const endDate = parseLocalDate(sorted[sorted.length - 1].logicalDate + ' 00:00:00');

  // 建立日期→資料的查找表
  const dataMap = {};
  sorted.forEach(g => { dataMap[g.logicalDate] = g; });

  // 逐日遍歷，填補缺失日期
  const current = new Date(startDate);
  while (current <= endDate) {
    const key = fmtISO(current);
    if (dataMap[key]) {
      const g = dataMap[key];
      result.push({
        name: g.displayDate,
        logicalDate: g.logicalDate,
        sys: g.allAvg.sys,
        dia: g.allAvg.dia,
        pul: g.allAvg.pul,
        isMissing: false,
        allRows: g.allRows || [],
      });
    } else {
      // 缺失日期：插入 null 值
      const displayDate = key.replace(/-/g, '/');
      result.push({
        name: displayDate,
        logicalDate: key,
        sys: null,
        dia: null,
        pul: null,
        isMissing: true,
        allRows: [],
      });
    }
    current.setDate(current.getDate() + 1);
  }

  return result;
}

/**
 * 建立異常分析模式的圖表資料。
 * 僅保留含異常紀錄的日期，並輸出全日均 / 早上 / 午間 / 晚上四組平均值。
 */
function buildAbnormalChartData(grouped, ignoreMissing, isRowAbnormalFn) {
  const abnormalGrouped = grouped.filter(g =>
    g.allRows && g.allRows.some(r => isRowAbnormalFn(r))
  );

  const sorted = [...abnormalGrouped].reverse(); // 舊→新

  const mapEntry = (g) => ({
    name: g.displayDate,
    logicalDate: g.logicalDate,
    sys: g.allAvg.sys,
    dia: g.allAvg.dia,
    pul: g.allAvg.pul,
    morningSys: g.morningAvg?.sys ?? null,
    morningDia: g.morningAvg?.dia ?? null,
    morningPul: g.morningAvg?.pul ?? null,
    afternoonSys: g.afternoonAvg?.sys ?? null,
    afternoonDia: g.afternoonAvg?.dia ?? null,
    afternoonPul: g.afternoonAvg?.pul ?? null,
    eveningSys: g.eveningAvg?.sys ?? null,
    eveningDia: g.eveningAvg?.dia ?? null,
    eveningPul: g.eveningAvg?.pul ?? null,
    isMissing: false,
    allRows: g.allRows || [],
  });

  if (sorted.length < 2 || ignoreMissing) {
    return sorted.map(mapEntry);
  }

  // 填補缺失日期（在異常日期之間的空白日期）
  const result = [];
  const startDate = parseLocalDate(sorted[0].logicalDate + ' 00:00:00');
  const endDate = parseLocalDate(sorted[sorted.length - 1].logicalDate + ' 00:00:00');

  const dataMap = {};
  sorted.forEach(g => { dataMap[g.logicalDate] = g; });

  const current = new Date(startDate);
  while (current <= endDate) {
    const key = fmtISO(current);
    if (dataMap[key]) {
      result.push(mapEntry(dataMap[key]));
    } else {
      const displayDate = key.replace(/-/g, '/');
      result.push({
        name: displayDate,
        logicalDate: key,
        sys: null, dia: null, pul: null,
        morningSys: null, morningDia: null, morningPul: null,
        afternoonSys: null, afternoonDia: null, afternoonPul: null,
        eveningSys: null, eveningDia: null, eveningPul: null,
        isMissing: true,
        allRows: [],
      });
    }
    current.setDate(current.getDate() + 1);
  }

  return result;
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

  // 進階篩選狀態
  const [ignoreMissingDates, setIgnoreMissingDates] = useState(false);
  const [batchFilterOption, setBatchFilterOption] = useState('none');
  const [hideRecordDetails, setHideRecordDetails] = useState(false);
  const [onlyAbnormalDays, setOnlyAbnormalDays] = useState(false);
  const [hideChart, setHideChart] = useState(false);
  const [abnormalAnalysis, setAbnormalAnalysis] = useState(false);
  const [abnormalLineVisibility, setAbnormalLineVisibility] = useState({
    allDay: true, morning: true, afternoon: true, evening: true,
  });
  const [savedHideRecordDetails, setSavedHideRecordDetails] = useState(false);

  // Brush 連動
  const [brushRange, setBrushRange] = useState(null);
  const [brushKey, setBrushKey] = useState(0); // 用於強制重新渲染 Brush

  // 表格捲動連動
  const tableRef = useRef(null);
  const dateGroupRefs = useRef({});

  // 滾輪縮放連動
  const chartContainerRef = useRef(null);
  const zoomStateRef = useRef({ len: 0, range: null });

  // 手機版螢幕偵測 (<=768px)
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const [isGuest, setIsGuest] = useState(false);
  const [targetUser, setTargetUser] = useState('');

  // ===== 資料讀取 (僅一次) =====
  useEffect(() => {
    document.title = '血壓心跳紀錄 - Aegis System';
    const user = sessionStorage.getItem('username');
    const guestState = sessionStorage.getItem('isGuest') === 'true';
    const target = sessionStorage.getItem('targetUser') || 'cvn';
    
    if (!user) { router.push('/'); return; }
    setIsGuest(guestState);
    setTargetUser(target);

    (async () => {
      try {
        const url = guestState ? `/api/health?username=guest&targetUser=${target}` : `/api/health?username=${user}`;
        const res = await fetch(url);
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

  // ===== 前端篩選 (時間區間 + 連續資料批次過濾) =====
  const filteredData = useMemo(() => {
    const rangeFiltered = filterByRange(allData, activeRange, customStart, customEnd);
    return applyBatchFilter(rangeFiltered, batchFilterOption);
  }, [allData, activeRange, customStart, customEnd, batchFilterOption]);

  // ===== 判斷單筆紀錄是否異常 (高標或低標) =====
  const isRowAbnormal = useCallback((row) => {
    if (!settings || !row) return false;
    const sys = Number(row.sys);
    const dia = Number(row.dia);
    const pul = Number(row.pul);
    const sysAbnormal = !isNaN(sys) && (sys > Number(settings.sys_high) || sys < Number(settings.sys_low));
    const diaAbnormal = !isNaN(dia) && (dia > Number(settings.dia_high) || dia < Number(settings.dia_low));
    const pulAbnormal = !isNaN(pul) && (pul > Number(settings.hr_high) || pul < Number(settings.hr_low));
    return sysAbnormal || diaAbnormal || pulAbnormal;
  }, [settings]);

  // ===== 分組 (原始無異常篩選，供給圖表使用) =====
  const rawGrouped = useMemo(() => {
    return groupByLogicalDate(filteredData);
  }, [filteredData]);

  // ===== 表格用分組 (套用「僅顯示含異常紀錄之日期」) =====
  const grouped = useMemo(() => {
    if (!onlyAbnormalDays) return rawGrouped;
    // 篩選出該邏輯日期中，至少有一筆紀錄屬於異常的日期
    return rawGrouped.filter(g => g.allRows && g.allRows.some(r => isRowAbnormal(r)));
  }, [rawGrouped, onlyAbnormalDays, isRowAbnormal]);

  // ===== 圖表資料 (每日平均, 舊→新，不套用異常篩選) =====
  const chartData = useMemo(() => {
    return buildChartData(rawGrouped, ignoreMissingDates);
  }, [rawGrouped, ignoreMissingDates]);

  // ===== 異常分析圖表資料 =====
  const abnormalChartData = useMemo(() => {
    if (!abnormalAnalysis) return [];
    return buildAbnormalChartData(rawGrouped, ignoreMissingDates, isRowAbnormal);
  }, [abnormalAnalysis, rawGrouped, ignoreMissingDates, isRowAbnormal]);

  // ===== 圖表資料來源 (根據模式切換) =====
  const activeChartData = abnormalAnalysis ? abnormalChartData : chartData;

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

  // ===== 曲線圖進階呈現切換 =====
  const handleAbnormalAnalysisToggle = useCallback((checked) => {
    setAbnormalAnalysis(checked);
    setBrushRange(null);
    if (checked) {
      setSavedHideRecordDetails(hideRecordDetails);
    } else {
      setHideRecordDetails(savedHideRecordDetails);
    }
  }, [hideRecordDetails, savedHideRecordDetails]);

  // ===== 滾輪縮放連動 =====
  useEffect(() => {
    zoomStateRef.current = { len: activeChartData.length, range: brushRange };
  }, [activeChartData.length, brushRange]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      const { len, range } = zoomStateRef.current;
      if (len <= 5) return;

      // 判斷是否在時間軸(X軸)或選擇器(Brush)上方
      // 加上座標判斷，避免因 Recharts 透明遮罩擋住而失效
      const isOverAxisClass = e.target.closest('.recharts-brush') || e.target.closest('.recharts-cartesian-axis-x');
      const rect = container.getBoundingClientRect();
      const isOverBottom = (e.clientY - rect.top) > (rect.height - 60); // 底部 60px 範圍

      if (!isOverAxisClass && !isOverBottom) return;

      e.preventDefault();

      const start = range ? range.startIndex : 0;
      const end = range ? range.endIndex : len - 1;

      // 動態縮放比例：至少 1，最大為當前範圍的 10%
      const currentSpan = end - start;
      const zoomFactor = Math.max(1, Math.floor(currentSpan * 0.1));
      let newStart = start;
      let newEnd = end;

      if (e.deltaY < 0) {
        newStart = Math.min(start + zoomFactor, end - 1);
        newEnd = Math.max(end - zoomFactor, start + 1);
      } else if (e.deltaY > 0) {
        newStart = Math.max(start - zoomFactor, 0);
        newEnd = Math.min(end + zoomFactor, len - 1);
      }

      if (newStart !== start || newEnd !== end) {
        setBrushRange({ startIndex: newStart, endIndex: newEnd });
        setBrushKey(k => k + 1); // 強制 Brush 更新視圖
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [loading, filteredData.length]); // 確保在元件實際渲染後才綁定事件

  // ===== 判斷高標與低標樣式 =====
  const valStyle = useCallback((val, type) => {
    if (!settings || val == null) return {};
    let highLimit, lowLimit;
    const numVal = Number(val);
    if (isNaN(numVal)) return {};

    switch (type) {
      case 'sys':
        highLimit = Number(settings.sys_high);
        lowLimit = Number(settings.sys_low);
        break;
      case 'dia':
        highLimit = Number(settings.dia_high);
        lowLimit = Number(settings.dia_low);
        break;
      case 'pul':
        highLimit = Number(settings.hr_high);
        lowLimit = Number(settings.hr_low);
        break;
      default:
        return {};
    }

    if (numVal > highLimit) {
      return { color: '#ef4444', fontWeight: 700 }; // 超標：紅色
    }
    if (numVal < lowLimit) {
      return { color: '#3b82f6', fontWeight: 700 }; // 低標：藍色
    }
    return {};
  }, [settings]);

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
        <button className="btn-back" onClick={() => router.push(isGuest ? '/' : '/dashboard')}>← {isGuest ? '回登入頁' : '返回'}</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h1>血壓心跳紀錄</h1>
          {isGuest && (
            <span style={{
              background: 'rgba(14, 165, 233, 0.12)',
              color: '#0284c7',
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '12px',
              border: '1px solid rgba(14, 165, 233, 0.3)'
            }}>
              👤 訪客體驗模式 ({targetUser})
            </span>
          )}
        </div>
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

      {/* 進階篩選列 */}
      <div className="filter-bar">
        <label className="filter-checkbox">
          <input
            type="checkbox"
            checked={ignoreMissingDates}
            onChange={(e) => setIgnoreMissingDates(e.target.checked)}
          />
          <span>圖表忽略空白日期</span>
        </label>

        <div className="filter-select-group">
          <span className="filter-label">連續資料篩選：</span>
          <select
            className="filter-select"
            value={batchFilterOption}
            onChange={(e) => setBatchFilterOption(e.target.value)}
          >
            <option value="none">不篩選（顯示全部）</option>
            <option value="first_two">取前兩筆</option>
            <option value="last_two">取後兩筆</option>
            <option value="highest_two_sys">取最高收縮壓兩筆</option>
            <option value="lowest_two_sys">取最低收縮壓兩筆</option>
          </select>
        </div>

        <label className={`filter-checkbox${abnormalAnalysis ? ' disabled' : ''}`}>
          <input
            type="checkbox"
            checked={hideRecordDetails}
            onChange={(e) => setHideRecordDetails(e.target.checked)}
            disabled={abnormalAnalysis}
          />
          <span>隱藏表格明細</span>
        </label>

        <label className={`filter-checkbox${abnormalAnalysis ? ' disabled' : ''}`} style={{ color: '#ef4444', fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={onlyAbnormalDays}
            onChange={(e) => setOnlyAbnormalDays(e.target.checked)}
            disabled={abnormalAnalysis}
          />
          <span>僅顯示包含異常紀錄之日期(僅改變下方表格呈現效果)</span>
        </label>
        <label className={`filter-checkbox${hideChart ? ' disabled' : ''}`} style={{ color: '#0ea5e9', fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={abnormalAnalysis}
            onChange={(e) => handleAbnormalAnalysisToggle(e.target.checked)}
            disabled={hideChart}
          />
          <span>📊 曲線圖進階呈現</span>
        </label>
        <label className={`filter-checkbox${abnormalAnalysis ? ' disabled' : ''}`}>
          <input
            type="checkbox"
            checked={hideChart}
            onChange={(e) => setHideChart(e.target.checked)}
            disabled={abnormalAnalysis}
          />
          <span>隱藏曲線圖</span>
        </label>
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
          {!hideChart && (
            <div className="chart-container" ref={chartContainerRef}>
              {abnormalAnalysis ? (
                <div className="abnormal-legend-bar">
                  {[
                    { key: 'allDay', label: '📊 全日均', color: '#22c55e' },
                    { key: 'morning', label: '☀️ 早上', color: '#f59e0b' },
                    { key: 'afternoon', label: '🌤️ 午間', color: '#06b6d4' },
                    { key: 'evening', label: '🌙 晚上', color: '#6366f1' },
                  ].map(item => (
                    <button
                      key={item.key}
                      className={`abnormal-legend-btn ${abnormalLineVisibility[item.key] ? 'active' : ''}`}
                      onClick={() => setAbnormalLineVisibility(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                      style={abnormalLineVisibility[item.key] ? { '--btn-color': item.color } : {}}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="chart-legend">
                  <span className="legend-item" style={{ '--dot-color': '#22c55e' }}>高壓(均)</span>
                  <span className="legend-item" style={{ '--dot-color': '#8b5cf6' }}>低壓(均)</span>
                  <span className="legend-item" style={{ '--dot-color': '#ef4444' }}>心率(均)</span>
                </div>
              )}
              <ResponsiveContainer width="100%" height={abnormalAnalysis ? 420 : 240}>
                <LineChart data={activeChartData} margin={{ top: 10, right: 16, left: -20, bottom: 0 }}>
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
                    domain={abnormalAnalysis ? ['dataMin - 20', 'dataMax + 20'] : ['dataMin - 10', 'dataMax + 10']}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const dataPoint = payload[0]?.payload;
                      if (abnormalAnalysis) {
                        return (
                          <div style={{
                            backgroundColor: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            padding: '10px 14px',
                            fontSize: 13,
                            maxWidth: 360,
                          }}>
                            <p style={{ fontWeight: 600, marginBottom: 6, color: '#334155' }}>📅 {label}</p>
                            {dataPoint?.sys != null && (
                              <p style={{ margin: '4px 0', color: '#22c55e' }}>
                                📊 全日均: <b>{dataPoint.sys}</b>/<b>{dataPoint.dia}</b> ❤️<b>{dataPoint.pul}</b>
                              </p>
                            )}
                            {dataPoint?.morningSys != null && (
                              <p style={{ margin: '4px 0', color: '#f59e0b' }}>
                                ☀️ 早上: <b>{dataPoint.morningSys}</b>/<b>{dataPoint.morningDia}</b> ❤️<b>{dataPoint.morningPul}</b>
                              </p>
                            )}
                            {dataPoint?.afternoonSys != null && (
                              <p style={{ margin: '4px 0', color: '#06b6d4' }}>
                                🌤️ 午間: <b>{dataPoint.afternoonSys}</b>/<b>{dataPoint.afternoonDia}</b> ❤️<b>{dataPoint.afternoonPul}</b>
                              </p>
                            )}
                            {dataPoint?.eveningSys != null && (
                              <p style={{ margin: '4px 0', color: '#6366f1' }}>
                                🌙 晚上: <b>{dataPoint.eveningSys}</b>/<b>{dataPoint.eveningDia}</b> ❤️<b>{dataPoint.eveningPul}</b>
                              </p>
                            )}
                          </div>
                        );
                      }
                      const rows = dataPoint?.allRows || [];
                      return (
                        <div style={{
                          backgroundColor: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: 8,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                          padding: '10px 14px',
                          fontSize: 13,
                          maxWidth: 320,
                        }}>
                          <p style={{ fontWeight: 600, marginBottom: 6, color: '#334155' }}>📅 {label}</p>
                          <p style={{ margin: '2px 0', color: '#22c55e' }}>收縮壓(均): {dataPoint?.sys ?? '—'}</p>
                          <p style={{ margin: '2px 0', color: '#8b5cf6' }}>舒張壓(均): {dataPoint?.dia ?? '—'}</p>
                          <p style={{ margin: '2px 0', color: '#ef4444' }}>心率(均): {dataPoint?.pul ?? '—'}</p>
                          {rows.length > 0 && (
                            <>
                              <hr style={{ margin: '6px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />
                              <p style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>量測明細 ({rows.length} 筆)：</p>
                              {rows.map((r, i) => (
                                <p key={i} style={{ margin: '2px 0', fontSize: 11, color: '#475569', display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                                  <span style={{ color: '#94a3b8', marginRight: 2 }}>{fmtTime(r.date)}</span>
                                  <span style={{ color: '#cbd5e1' }}>—</span>
                                  <span style={{ color: '#64748b', fontSize: 10 }}>高</span>
                                  <span style={{ fontWeight: 600, ...valStyle(r.sys, 'sys') }}>{r.sys ?? '—'}</span>
                                  <span style={{ color: '#cbd5e1' }}>/</span>
                                  <span style={{ color: '#64748b', fontSize: 10 }}>低</span>
                                  <span style={{ fontWeight: 600, ...valStyle(r.dia, 'dia') }}>{r.dia ?? '—'}</span>
                                  <span style={{ color: '#cbd5e1' }}>❤️</span>
                                  <span style={{ fontWeight: 600, ...valStyle(r.pul, 'pul') }}>{r.pul ?? '—'}</span>
                                </p>
                              ))}
                            </>
                          )}
                        </div>
                      );
                    }}
                  />

                  {/* 高低標參考線 */}
                  {settings && (
                    <>
                      <ReferenceLine y={settings.sys_high} stroke="#ef4444" strokeDasharray="6 3" strokeWidth={1} label={{ value: `高壓高標 ${settings.sys_high}`, position: 'right', fontSize: 10, fill: '#ef4444' }} />
                      <ReferenceLine y={settings.sys_low} stroke="#f97316" strokeDasharray="6 3" strokeWidth={1} />
                    </>
                  )}

                  {/* ===== 曲線 ===== */}
                  {(() => {
                    /* 密集時間區間與自訂時間軸 (包含 custom / all / 長天數) 縮小節點(r: 1.2)，避免遮蔽曲線 */
                    const targetRanges = isMobile ? ['90', '180', '365', 'all', 'custom'] : ['180', '365', 'all', 'custom'];
                    const isLargeRange = targetRanges.includes(activeRange);
                    const dotR = isLargeRange ? 1.2 : 3;
                    const subDotR = isLargeRange ? 1.2 : 2.5;
                    const activeR = isLargeRange ? 4 : 5;
                    const sysW = isLargeRange ? 1.8 : 2.5;
                    const lineW = isLargeRange ? 1.5 : 2;

                    if (abnormalAnalysis) {
                      return (
                        <>
                          {/* 全日均 — 實線 */}
                          {abnormalLineVisibility.allDay && (
                            <>
                              <Line type="monotone" dataKey="sys" name="全日均-高壓" stroke="#22c55e" strokeWidth={sysW} dot={{ r: dotR, fill: '#22c55e' }} activeDot={{ r: activeR }} connectNulls={ignoreMissingDates} />
                              <Line type="monotone" dataKey="dia" name="全日均-低壓" stroke="#8b5cf6" strokeWidth={lineW} dot={{ r: dotR, fill: '#8b5cf6' }} activeDot={{ r: activeR }} connectNulls={ignoreMissingDates} />
                              <Line type="monotone" dataKey="pul" name="全日均-心率" stroke="#ef4444" strokeWidth={lineW} dot={{ r: dotR, fill: '#ef4444' }} activeDot={{ r: activeR }} connectNulls={ignoreMissingDates} />
                            </>
                          )}
                          {/* 早上 — 長虛線 */}
                          {abnormalLineVisibility.morning && (
                            <>
                              <Line type="monotone" dataKey="morningSys" name="早上-高壓" stroke="#f59e0b" strokeWidth={lineW} dot={{ r: subDotR, fill: '#f59e0b' }} activeDot={{ r: activeR }} connectNulls={ignoreMissingDates} strokeDasharray="6 3" />
                              <Line type="monotone" dataKey="morningDia" name="早上-低壓" stroke="#d97706" strokeWidth={isLargeRange ? 1.2 : 1.5} dot={{ r: subDotR, fill: '#d97706' }} activeDot={{ r: activeR }} connectNulls={ignoreMissingDates} strokeDasharray="6 3" />
                              <Line type="monotone" dataKey="morningPul" name="早上-心率" stroke="#b45309" strokeWidth={isLargeRange ? 1.2 : 1.5} dot={{ r: subDotR, fill: '#b45309' }} activeDot={{ r: activeR }} connectNulls={ignoreMissingDates} strokeDasharray="6 3" />
                            </>
                          )}
                          {/* 午間 — 中虛線 */}
                          {abnormalLineVisibility.afternoon && (
                            <>
                              <Line type="monotone" dataKey="afternoonSys" name="午間-高壓" stroke="#06b6d4" strokeWidth={lineW} dot={{ r: subDotR, fill: '#06b6d4' }} activeDot={{ r: activeR }} connectNulls={ignoreMissingDates} strokeDasharray="4 2" />
                              <Line type="monotone" dataKey="afternoonDia" name="午間-低壓" stroke="#0891b2" strokeWidth={isLargeRange ? 1.2 : 1.5} dot={{ r: subDotR, fill: '#0891b2' }} activeDot={{ r: activeR }} connectNulls={ignoreMissingDates} strokeDasharray="4 2" />
                              <Line type="monotone" dataKey="afternoonPul" name="午間-心率" stroke="#0e7490" strokeWidth={isLargeRange ? 1.2 : 1.5} dot={{ r: subDotR, fill: '#0e7490' }} activeDot={{ r: activeR }} connectNulls={ignoreMissingDates} strokeDasharray="4 2" />
                            </>
                          )}
                          {/* 晚上 — 短虛線 */}
                          {abnormalLineVisibility.evening && (
                            <>
                              <Line type="monotone" dataKey="eveningSys" name="晚上-高壓" stroke="#6366f1" strokeWidth={lineW} dot={{ r: subDotR, fill: '#6366f1' }} activeDot={{ r: activeR }} connectNulls={ignoreMissingDates} strokeDasharray="2 2" />
                              <Line type="monotone" dataKey="eveningDia" name="晚上-低壓" stroke="#4f46e5" strokeWidth={isLargeRange ? 1.2 : 1.5} dot={{ r: subDotR, fill: '#4f46e5' }} activeDot={{ r: activeR }} connectNulls={ignoreMissingDates} strokeDasharray="2 2" />
                              <Line type="monotone" dataKey="eveningPul" name="晚上-心率" stroke="#4338ca" strokeWidth={isLargeRange ? 1.2 : 1.5} dot={{ r: subDotR, fill: '#4338ca' }} activeDot={{ r: activeR }} connectNulls={ignoreMissingDates} strokeDasharray="2 2" />
                            </>
                          )}
                        </>
                      );
                    }

                    return (
                      <>
                        <Line type="monotone" dataKey="sys" name="sys" stroke="#22c55e" strokeWidth={sysW} dot={{ r: dotR, fill: '#22c55e' }} activeDot={{ r: activeR }} connectNulls={ignoreMissingDates} />
                        <Line type="monotone" dataKey="dia" name="dia" stroke="#8b5cf6" strokeWidth={lineW} dot={{ r: dotR, fill: '#8b5cf6' }} activeDot={{ r: activeR }} connectNulls={ignoreMissingDates} />
                        <Line type="monotone" dataKey="pul" name="pul" stroke="#ef4444" strokeWidth={lineW} dot={{ r: dotR, fill: '#ef4444' }} activeDot={{ r: activeR }} connectNulls={ignoreMissingDates} />
                      </>
                    );
                  })()}

                  {/* Brush 拖曳選擇器 */}
                  {activeChartData.length > 5 && (
                    <Brush
                      key={`brush-${brushKey}`}
                      dataKey="name"
                      height={28}
                      stroke="#0ea5e9"
                      fill="rgba(14, 165, 233, 0.05)"
                      travellerWidth={10}
                      onChange={handleBrushChange}
                      startIndex={brushRange?.startIndex}
                      endIndex={brushRange?.endIndex}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ===== 資料表格 ===== */}
          <div className="data-table-wrapper" ref={tableRef} style={abnormalAnalysis ? { display: 'none' } : undefined}>
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
                {!hideRecordDetails && g.allRows.map((row, idx) => (
                  <div key={`${row.date}-${idx}`} className={`record-row period-${row.period}`}>
                    <span className="record-period-icon">{periodIcon(row.period)}</span>
                    <span className="record-time">{fmtTime(row.date)}</span>

                    <span className="metric-label">高壓</span>
                    <span className="record-val" style={valStyle(row.sys, 'sys')}>{row.sys}</span>
                    <span className="record-sep">/</span>
                    <span className="metric-label">低壓</span>
                    <span className="record-val" style={valStyle(row.dia, 'dia')}>{row.dia}</span>

                    <span className="record-heart" style={valStyle(row.pul, 'pul')}>
                      <span className="metric-label" style={{ marginRight: '4px' }}>心率</span>
                      ❤️ {row.pul}
                    </span>
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
