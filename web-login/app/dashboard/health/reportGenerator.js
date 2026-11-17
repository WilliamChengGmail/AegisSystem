/**
 * 血壓報告單 HTML 與 PDF 列印產生器
 * 樣式與風格 100% 參照：D:\AegisSystem\PDF_Sample_Cache\血壓報告單_20261111.pdf
 * 維護者 / 製作者: Office of William
 */

/**
 * 格式化日期為表格顯示用
 * 若跨年度 (isCrossYear = true) -> 包含年份後兩碼，如 "25年12月31日"、"26年1月5日"
 * 若未跨年度 (isCrossYear = false) -> 維持 "M月D日"，如 "12月31日"、"1月5日"
 */
function formatTableDate(dateStr, isCrossYear = false) {
  if (!dateStr) return '';
  const [datePart] = dateStr.split(' ');
  const parts = datePart.split('-');
  if (parts.length < 3) return dateStr;
  const yy = parts[0].slice(-2);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isCrossYear) {
    return `${yy}年${m}月${d}日`;
  }
  return `${m}月${d}日`;
}

function formatMonthDay(dateStr) {
  return formatTableDate(dateStr, false);
}

/**
 * 格式化目前列印時間為 "YYYY/MM/DD am/pm hh:mm:ss"
 * 例: "2026/11/17 am 10:52:33"
 */
function formatPrintDateTime(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rawH = d.getHours();
  const ampm = rawH >= 12 ? 'pm' : 'am';
  let h12 = rawH % 12;
  if (h12 === 0) h12 = 12;
  const hh = String(h12).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${ampm} ${hh}:${min}:${ss}`;
}

/**
 * 格式化時間為 "HH:mm" (例: 06:25)
 */
function formatHourMinute(dateStr) {
  if (!dateStr) return '';
  const [, timePart] = dateStr.split(' ');
  if (!timePart) return '';
  const [hh, mm] = timePart.split(':');
  return `${hh}:${mm}`;
}

/**
 * 格式化日期區間為 "YYYY.MM.DD ➔ YYYY.MM.DD"
 */
function formatRangeHeader(sortedData) {
  if (!sortedData || sortedData.length === 0) return '';
  const first = sortedData[0].date.split(' ')[0].replace(/-/g, '.');
  const last = sortedData[sortedData.length - 1].date.split(' ')[0].replace(/-/g, '.');
  return `${first} ➔ ${last}`;
}

/**
 * 將一筆紀錄指派至時段 (早晨/午間/晚間)
 */
function getPeriod(dateStr) {
  const [, timePart] = dateStr.split(' ');
  if (!timePart) return 'morning';
  const [h, m] = timePart.split(':').map(Number);
  const totalM = h * 60 + m;
  if (totalM < 150) return 'evening'; // 00:00 ~ 02:29
  if (totalM < 720) return 'morning'; // 02:30 ~ 11:59
  if (totalM < 1080) return 'afternoon'; // 12:00 ~ 17:59
  return 'evening'; // 18:00 ~ 23:59
}

/**
 * 依日期將量測記錄分組並計算當日全日均與各時段平均值 (舊到新排序)
 */
function groupDailyRecords(sortedData) {
  const map = {};
  sortedData.forEach(r => {
    const dayStr = r.date.split(' ')[0]; // YYYY-MM-DD
    if (!map[dayStr]) {
      map[dayStr] = {
        date: dayStr,
        rows: [],
        morning: [],
        afternoon: [],
        evening: []
      };
    }
    const period = getPeriod(r.date);
    const enriched = { ...r, period };
    map[dayStr].rows.push(enriched);
    map[dayStr][period].push(enriched);
  });

  const avgOf = (arr, key) => {
    const valid = arr.map(x => Number(x[key])).filter(v => !isNaN(v) && v > 0);
    if (valid.length === 0) return null;
    return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
  };

  return Object.values(map)
    .map(g => ({
      date: g.date,
      allAvg: {
        sys: avgOf(g.rows, 'sys'),
        dia: avgOf(g.rows, 'dia'),
        pul: avgOf(g.rows, 'pul')
      },
      morningAvg: {
        sys: avgOf(g.morning, 'sys'),
        dia: avgOf(g.morning, 'dia'),
        pul: avgOf(g.morning, 'pul')
      },
      afternoonAvg: {
        sys: avgOf(g.afternoon, 'sys'),
        dia: avgOf(g.afternoon, 'dia'),
        pul: avgOf(g.afternoon, 'pul')
      },
      eveningAvg: {
        sys: avgOf(g.evening, 'sys'),
        dia: avgOf(g.evening, 'dia'),
        pul: avgOf(g.evening, 'pul')
      },
      rows: g.rows.sort((a, b) => a.date.localeCompare(b.date))
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 生成高解析度向量 SVG 折線圖 (支援日曆時間軸、忽略空白日期與進階時段趨勢)
 */
function generateSvgChart(dailyGroups, options = {}) {
  if (!dailyGroups || dailyGroups.length === 0) return '';

  const {
    advancedChart = false,
    ignoreMissingDates = false
  } = options;

  const width = 800;
  const height = 240;
  const padding = { top: 22, right: 30, bottom: 35, left: 45 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // 1. 計算 Y 軸數值標尺 (預設 0 ~ 160，極端值自動延展)
  let maxSys = 150;
  dailyGroups.forEach(g => {
    if (g.allAvg.sys && g.allAvg.sys > maxSys) maxSys = g.allAvg.sys;
    if (advancedChart) {
      if (g.morningAvg.sys && g.morningAvg.sys > maxSys) maxSys = g.morningAvg.sys;
      if (g.eveningAvg.sys && g.eveningAvg.sys > maxSys) maxSys = g.eveningAvg.sys;
    }
  });

  const yMax = Math.ceil(Math.max(maxSys + 10, 160) / 20) * 20;
  const yTicks = [];
  for (let y = 0; y <= yMax; y += 20) {
    yTicks.push(y);
  }

  const getY = (val) => {
    if (val == null || isNaN(val)) return null;
    return padding.top + chartH - ((val / yMax) * chartH);
  };

  // 2. 計算 X 軸座標
  const startDateStr = dailyGroups[0].date;
  const endDateStr = dailyGroups[dailyGroups.length - 1].date;
  const startDate = new Date(startDateStr + 'T00:00:00');
  const endDate = new Date(endDateStr + 'T00:00:00');
  const totalDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
  const n = dailyGroups.length;

  const getX = (dateStr, idx) => {
    if (ignoreMissingDates) {
      if (n <= 1) return padding.left + chartW / 2;
      return padding.left + (idx / (n - 1)) * chartW;
    } else {
      if (totalDays === 0) return padding.left + chartW / 2;
      const curDate = new Date(dateStr + 'T00:00:00');
      const dayOffset = Math.round((curDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      return padding.left + (dayOffset / totalDays) * chartW;
    }
  };

  // 3. 水平標尺網格線與 Y 標籤
  const gridLines = yTicks.map(t => {
    const yPos = getY(t);
    return `
      <line x1="${padding.left}" y1="${yPos}" x2="${width - padding.right}" y2="${yPos}" stroke="#f1f5f9" stroke-width="1" />
      <text x="${padding.left - 8}" y="${yPos + 4}" fill="#475569" font-size="11" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, sans-serif">${t}</text>
    `;
  }).join('');

  // 4. X 軸標籤生成
  const xTicks = [];
  if (ignoreMissingDates) {
    const labelStep = Math.max(1, Math.floor(n / 14));
    dailyGroups.forEach((g, i) => {
      if (i % labelStep === 0 || i === n - 1) {
        const xPos = getX(g.date, i);
        const day = g.date.split('-')[2];
        xTicks.push(`
          <line x1="${xPos}" y1="${height - padding.bottom}" x2="${xPos}" y2="${height - padding.bottom + 4}" stroke="#94a3b8" stroke-width="1" />
          <text x="${xPos}" y="${height - 10}" fill="#334155" font-size="11" text-anchor="middle" font-weight="500" font-family="-apple-system, BlinkMacSystemFont, sans-serif">${day}</text>
        `);
      }
    });
  } else {
    let tickIntervalDays = 1;
    if (totalDays > 90) tickIntervalDays = 12;
    else if (totalDays > 45) tickIntervalDays = 6; // 範本三個月每 6 天一刻度
    else if (totalDays > 20) tickIntervalDays = 3;
    else if (totalDays > 7)  tickIntervalDays = 2;
    else tickIntervalDays = 1;

    const curTick = new Date(startDate);
    while (curTick <= endDate) {
      const y = curTick.getFullYear();
      const m = String(curTick.getMonth() + 1).padStart(2, '0');
      const d = String(curTick.getDate()).padStart(2, '0');
      const dStr = `${y}-${m}-${d}`;
      const day = d;
      const xPos = getX(dStr);
      xTicks.push(`
        <line x1="${xPos}" y1="${height - padding.bottom}" x2="${xPos}" y2="${height - padding.bottom + 4}" stroke="#94a3b8" stroke-width="1" />
        <text x="${xPos}" y="${height - 10}" fill="#334155" font-size="11" text-anchor="middle" font-weight="500" font-family="-apple-system, BlinkMacSystemFont, sans-serif">${day}</text>
      `);
      curTick.setDate(curTick.getDate() + tickIntervalDays);
    }
  }

  // 5. 折線產生器 (精準支援忽略空白日期模式與日曆斷點/斷距模式)
  const createPolyline = (getValueFn, strokeColor, strokeWidth = 2, dashArray = '') => {
    const segments = [];
    let currentSegment = [];
    const circles = [];
    let prevValidDate = null;

    dailyGroups.forEach((g, idx) => {
      const val = getValueFn(g);
      if (val != null && !isNaN(val) && val > 0) {
        const x = getX(g.date, idx);
        const y = getY(val);
        const pointStr = `${x.toFixed(1)},${y.toFixed(1)}`;
        circles.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${strokeWidth > 1.5 ? 2.2 : 1.6}" fill="${strokeColor}" />`);

        if (ignoreMissingDates) {
          // 忽略空白日期：所有有資料的點直接連線
          currentSegment.push(pointStr);
        } else {
          // 不忽略空白日期 (日曆時間軸模式)：若與前一個量測日相差超過 1 天，則切斷線段形成斷距
          if (prevValidDate) {
            const diffDays = Math.round((new Date(g.date + 'T00:00:00').getTime() - new Date(prevValidDate + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > 1) {
              if (currentSegment.length > 0) {
                segments.push(currentSegment);
                currentSegment = [];
              }
            }
          }
          currentSegment.push(pointStr);
          prevValidDate = g.date;
        }
      }
    });

    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    if (segments.length === 0 && circles.length === 0) return '';
    const dashAttr = dashArray ? `stroke-dasharray="${dashArray}"` : '';

    // 只有長度 >= 2 的 segment 才會產生折線；單獨一天的紀錄則僅呈現圓點，達成標準斷點效果
    const linesHtml = segments
      .filter(seg => seg.length >= 2)
      .map(seg => `<polyline points="${seg.join(' ')}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" ${dashAttr} stroke-linecap="round" stroke-linejoin="round" />`)
      .join('');

    return `${linesHtml}${circles.join('')}`;
  };

  // 標準折線: 全日均高壓 (#00c4c4)、低壓 (#7d05e7)、心率 (#d0021b)
  let linesSvg = `
    ${createPolyline(g => g.allAvg.sys, '#00c4c4', 2.2)}
    ${createPolyline(g => g.allAvg.dia, '#7d05e7', 2.2)}
    ${createPolyline(g => g.allAvg.pul, '#d0021b', 2.0)}
  `;

  // 若啟用進階時段呈現: 增繪早晨 (☀️ 橘金色) 與晚間 (🌙 靛青色) 趨勢線
  if (advancedChart) {
    linesSvg += `
      ${createPolyline(g => g.morningAvg?.sys, '#f59e0b', 1.5, '4,3')}
      ${createPolyline(g => g.eveningAvg?.sys, '#3b82f6', 1.5, '4,3')}
    `;
  }

  return `
    <svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; display: block; margin: 0 auto;">
      ${gridLines}
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#94a3b8" stroke-width="1.2" />
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#94a3b8" stroke-width="1.2" />
      ${linesSvg}
      ${xTicks.join('')}
    </svg>
  `;
}

/**
 * 產生符合範本風格之完整 HTML 報告文件
 */
export function generateHealthReportHtml(records, settings, options = {}) {
  const {
    title = '血壓報告單',
    includeChart = true,
    advancedChart = false,
    ignoreMissingDates = false,
    hideRecordDetails = false,
    showDailyAvg = true,
    visibleColumns = {
      location: true,
      posture: true,
      feel: false,
      weight: false,
      mark: false
    },
    targetUserName = ''
  } = options;

  // 1. 資料按時間由舊到新排序 (符合醫學常規與範本)
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const dailyGroups = groupDailyRecords(sorted);

  // 判斷資料篩選區間是否發生跨年度 (若跨年，表格日期欄位將自動包含年份後兩碼)
  const years = new Set(sorted.map(r => r.date.split(' ')[0].split('-')[0]));
  const isCrossYear = years.size > 1;

  // 2. 門檻標準 (預設: 收縮壓 140/90, 舒張壓 90/60, 心率 100/60)
  const sysHigh = Number(settings?.sys_high) || 140;
  const sysLow = Number(settings?.sys_low) || 90;
  const diaHigh = Number(settings?.dia_high) || 90;
  const diaLow = Number(settings?.dia_low) || 60;
  const hrHigh = Number(settings?.hr_high) || 100;
  const hrLow = Number(settings?.hr_low) || 60;

  const rangeHeader = formatRangeHeader(sorted);
  const svgChart = includeChart ? generateSvgChart(dailyGroups, { advancedChart, ignoreMissingDates }) : '';

  // 3. 計算動態欄位與權重比例
  const baseCols = [
    { key: 'date', label: '日期', weight: 15, align: 'center', className: 'col-date' },
    { key: 'time', label: '時間', weight: 12, align: 'center', className: 'col-time' },
    { key: 'sys', label: '高壓', weight: 11, align: 'center', className: 'col-val' },
    { key: 'dia', label: '低壓', weight: 11, align: 'center', className: 'col-val' },
    { key: 'pul', label: '心率', weight: 11, align: 'center', className: 'col-val' },
  ];

  if (visibleColumns.feel)     baseCols.push({ key: 'feel', label: '感覺', weight: 10, align: 'center', className: 'col-feel' });
  if (visibleColumns.location) baseCols.push({ key: 'location', label: '位置', weight: 10, align: 'center', className: 'col-location' });
  if (visibleColumns.posture)  baseCols.push({ key: 'posture', label: '姿勢', weight: 10, align: 'center', className: 'col-posture' });
  if (visibleColumns.weight)   baseCols.push({ key: 'weight', label: '體重', weight: 9, align: 'center', className: 'col-weight' });
  if (visibleColumns.mark)     baseCols.push({ key: 'mark', label: '備注', weight: 16, align: 'left', className: 'col-mark' });

  const totalWeight = baseCols.reduce((sum, c) => sum + c.weight, 0);
  const thHtml = baseCols.map(c => {
    const widthPct = ((c.weight / totalWeight) * 100).toFixed(1);
    return `<th class="${c.className}" style="width: ${widthPct}%; text-align: ${c.align};">${c.label}</th>`;
  }).join('');

  // 4. 組合表格列 (包含醒目的「全日均」列與每筆資料列)
  const rowsHtmlArr = [];

  dailyGroups.forEach(g => {
    const dateLabel = formatTableDate(g.date, isCrossYear);
    const avgSys = g.allAvg.sys;
    const avgDia = g.allAvg.dia;
    const avgPul = g.allAvg.pul;

    const isAvgSysAb = avgSys != null && (avgSys >= sysHigh || avgSys <= sysLow);
    const isAvgDiaAb = avgDia != null && (avgDia >= diaHigh || avgDia <= diaLow);
    const isAvgPulAb = avgPul != null && (avgPul >= hrHigh || avgPul <= hrLow);

    const avgSysStyle = isAvgSysAb 
      ? 'background-color: #f7b9a4 !important; font-weight: 800; color: #dc2626 !important;' 
      : 'color: #4169e1 !important; font-weight: 700;';
    const avgDiaStyle = isAvgDiaAb 
      ? 'background-color: #f7b9a4 !important; font-weight: 800; color: #dc2626 !important;' 
      : 'color: #4169e1 !important; font-weight: 700;';
    const avgPulStyle = isAvgPulAb 
      ? 'background-color: #f7b9a4 !important; font-weight: 800; color: #dc2626 !important;' 
      : 'color: #4169e1 !important; font-weight: 700;';

    // === [全日均] 匯總列 (背景為 #c0c0c0，基礎文字為 #4169e1，異常資料為紅色 #dc2626 伴隨蜜桃粉橘背景) ===
    const avgCells = baseCols.map(c => {
      switch (c.key) {
        case 'date':
          return `<td class="${c.className}" style="font-weight: 700; color: #4169e1 !important;">${dateLabel}</td>`;
        case 'time':
          return `<td class="${c.className}" style="font-weight: 700; color: #4169e1 !important;">日均</td>`;
        case 'sys':
          return `<td class="${c.className}" style="${avgSysStyle}">${avgSys ?? ''}</td>`;
        case 'dia':
          return `<td class="${c.className}" style="${avgDiaStyle}">${avgDia ?? ''}</td>`;
        case 'pul':
          return `<td class="${c.className}" style="${avgPulStyle}">${avgPul ?? ''}</td>`;
        default:
          return `<td class="${c.className}" style="color: #4169e1; font-weight: 600;">-</td>`;
      }
    }).join('');

    // === [全日均] 匯總列 (若未指定隱藏時呈現，高對比專屬 CSS 區隔樣式，文字為紅色，保有異常儲存格樣式) ===
    if (showDailyAvg) {
      rowsHtmlArr.push(`
        <tr class="row-daily-avg">
          ${avgCells}
        </tr>
      `);
    }

    // === 每筆量測明細列 (若未勾選「隱藏表格明細」時展開) ===
    if (!hideRecordDetails) {
      g.rows.forEach((r, rIdx) => {
        const timeLabel = formatHourMinute(r.date);
        const sys = Number(r.sys);
        const dia = Number(r.dia);
        const pul = Number(r.pul);

        const isSysAb = !isNaN(sys) && (sys >= sysHigh || sys <= sysLow);
        const isDiaAb = !isNaN(dia) && (dia >= diaHigh || dia <= diaLow);
        const isPulAb = !isNaN(pul) && (pul >= hrHigh || pul <= hrLow);

        const sysStyle = isSysAb ? 'background-color: #f7b9a4; font-weight: 700;' : '';
        const diaStyle = isDiaAb ? 'background-color: #f7b9a4; font-weight: 700;' : '';
        const pulStyle = isPulAb ? 'background-color: #f7b9a4; font-weight: 700;' : '';

        // 若無日均列，則由當日首筆明細顯示日期；若有日均列，明細列日期保持留空以利版面聚焦
        const detailDateText = (!showDailyAvg && rIdx === 0) ? dateLabel : '';

        const rowCells = baseCols.map(c => {
          switch (c.key) {
            case 'date':
              return `<td class="${c.className}" style="font-weight: 600; color: #0f172a;">${detailDateText}</td>`;
            case 'time':
              return `<td class="${c.className}">${timeLabel}</td>`;
            case 'sys':
              return `<td class="${c.className}" style="${sysStyle}">${!isNaN(sys) ? sys : ''}</td>`;
            case 'dia':
              return `<td class="${c.className}" style="${diaStyle}">${!isNaN(dia) ? dia : ''}</td>`;
            case 'pul':
              return `<td class="${c.className}" style="${pulStyle}">${!isNaN(pul) ? pul : ''}</td>`;
            case 'feel':
              return `<td class="${c.className}">${r.feel || ''}</td>`;
            case 'location':
              return `<td class="${c.className}">${r.location || ''}</td>`;
            case 'posture':
              return `<td class="${c.className}">${r.posture || ''}</td>`;
            case 'weight':
              return `<td class="${c.className}">${r.weight && r.weight > 0 ? r.weight : ''}</td>`;
            case 'mark':
              return `<td class="${c.className}">${r.mark || ''}</td>`;
            default:
              return `<td></td>`;
          }
        }).join('');

        rowsHtmlArr.push(`
          <tr class="row-detail">
            ${rowCells}
          </tr>
        `);
      });
    }
  });

  const printTimeStr = formatPrintDateTime();
  const docTitle = `${title}${targetUserName ? ` (${targetUserName})` : ''} ${printTimeStr} - Aegis System`;

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <title>${docTitle}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 14mm 10mm 14mm 10mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Microsoft JhengHei", "PingFang TC", "Helvetica Neue", Arial, sans-serif;
      color: #111827;
      background: #f8fafc;
      padding: 24px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .report-container {
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      padding: 28px 24px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
      border-radius: 8px;
    }
    .action-bar {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-bottom: 20px;
    }
    .btn-action {
      background: #0284c7;
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s;
    }
    .btn-action:hover {
      background: #0369a1;
    }
    .btn-secondary {
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
    }
    .btn-secondary:hover {
      background: #e2e8f0;
    }

    /* 標題與圖例欄 (100% 參照範本) */
    .report-title {
      text-align: center;
      font-size: 26px;
      font-weight: 700;
      letter-spacing: 2px;
      color: #0f172a;
      margin-bottom: 18px;
    }
    .report-meta-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      padding: 0 4px;
      font-size: 14px;
      font-weight: 600;
      color: #334155;
    }
    .meta-range {
      letter-spacing: 0.5px;
    }
    .meta-legend {
      display: flex;
      gap: 14px;
      align-items: center;
      flex-wrap: wrap;
    }
    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-weight: 600;
      font-size: 13.5px;
    }
    .legend-line {
      width: 14px;
      height: 3px;
      border-radius: 2px;
      display: inline-block;
    }

    /* 折線圖區塊 */
    .chart-section {
      width: 100%;
      margin-bottom: 16px;
      background: #ffffff;
    }

    /* 資料表格 (字體放大清晰優化，A4 邊距相容) */
    .table-section {
      width: 100%;
      margin-top: 10px;
    }
    table.report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
      text-align: center;
      border: 1px solid #b0bec5;
    }
    table.report-table th, table.report-table td {
      border: 1px solid #b0bec5;
      padding: 5px 3px;
      line-height: 1.35;
      height: 29px;
    }
    table.report-table th {
      background-color: #c0f0f0; /* 範本精準青色 */
      color: #0f172a;
      font-weight: 700;
      font-size: 14.5px;
    }

    /* === 全日均專屬樣式行 (背景為 #c0c0c0、基礎文字為 #4169e1、異常欄位為紅色 #dc2626 伴隨蜜桃粉橘背景) === */
    tr.row-daily-avg {
      background-color: #c0c0c0; /* 經典銀灰底色，大幅強化視覺層次與明細列區隔 */
      font-weight: 700;
      border-top: 2px solid #64748b; /* 加厚加深上下框線，強化對比視覺重心 */
      border-bottom: 2px solid #64748b;
    }
    tr.row-daily-avg td,
    tr.row-daily-avg .col-date,
    tr.row-daily-avg .col-time,
    tr.row-daily-avg .col-val {
      color: #4169e1 !important; /* 日均文字顏色採用鮮明的藍色 #4169e1 */
      font-weight: 700;
      height: 31px;
    }

    /* 明細資料列 */
    tr.row-detail {
      background-color: #ffffff;
    }
    tr.row-detail:hover {
      background-color: #f8fafc;
    }

    /* 欄位微調與字體辨識度優化 */
    .col-date     { font-weight: 600; color: #0f172a; font-size: 14px; }
    .col-time     { color: #334155; font-size: 14px; }
    .col-val      { font-size: 14.5px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; }
    .col-feel     { font-size: 13.5px; color: #334155; }
    .col-location { font-size: 13.5px; color: #334155; }
    .col-posture  { font-size: 13.5px; color: #334155; }
    .col-weight   { font-size: 13.5px; color: #334155; }
    .col-mark     { font-size: 13.5px; color: #334155; text-align: left; padding-left: 6px; }

    /* 列印特定樣式 */
    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .report-container {
        box-shadow: none;
        padding: 0;
        max-width: 100%;
        border-radius: 0;
      }
      .action-bar {
        display: none !important;
      }
      table.report-table {
        page-break-inside: auto;
      }
      table.report-table thead {
        display: table-header-group;
      }
      table.report-table tr {
        page-break-inside: avoid;
        page-break-after: auto;
      }
      .chart-section {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="report-container">
    <!-- 操作按鈕列 (列印時自動隱藏) -->
    <div class="action-bar">
      <button class="btn-action btn-secondary" onclick="downloadHtml()">💾 下載 HTML 檔案</button>
      <button class="btn-action" onclick="window.print()">🖨️ 列印 / 另存為 PDF</button>
    </div>

    <!-- 報表標題 -->
    <div class="report-title">${title}</div>

    <!-- 統計期間與圖例 (參照範本) -->
    <div class="report-meta-bar">
      <div class="meta-range">${rangeHeader}</div>
      <div class="meta-legend">
        <span class="legend-item" style="color: #00838f;"><span class="legend-line" style="background: #00c4c4;"></span> 高壓</span>
        <span class="legend-item" style="color: #6a1b9a;"><span class="legend-line" style="background: #7d05e7;"></span> 低壓</span>
        <span class="legend-item" style="color: #c62828;"><span class="legend-line" style="background: #d0021b;"></span> 心率</span>
        ${advancedChart ? `
          <span class="legend-item" style="color: #d97706;"><span class="legend-line" style="background: #f59e0b; border-bottom: 1px dashed #d97706;"></span> ☀️早晨</span>
          <span class="legend-item" style="color: #2563eb;"><span class="legend-line" style="background: #3b82f6; border-bottom: 1px dashed #2563eb;"></span> 🌙晚間</span>
        ` : ''}
      </div>
    </div>

    <!-- 折線圖 (依日曆時間軸與每日平均整理繪製) -->
    ${includeChart ? `<div class="chart-section">${svgChart}</div>` : ''}

    <!-- 資料表格 (包含全日均列、動態欄位調整、字體清晰易讀) -->
    <div class="table-section">
      <table class="report-table">
        <thead>
          <tr>
            ${thHtml}
          </tr>
        </thead>
        <tbody>
          ${rowsHtmlArr.join('')}
        </tbody>
      </table>
    </div>
  </div>

  <script>
    function downloadHtml() {
      const htmlContent = document.documentElement.outerHTML;
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const safeTitle = (document.title || '${title}').replace(/[/\\\\?%*:|"<>]/g, '_');
      a.download = safeTitle + '.html';
      a.click();
      URL.revokeObjectURL(a.href);
    }
  </script>
</body>
</html>`;
}

/**
 * 另開視窗並觸發列印 (另存為 PDF / 列印)
 */
export function printHealthReport(records, settings, options = {}) {
  const html = generateHealthReportHtml(records, settings, options);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    if (titleMatch && titleMatch[1]) {
      printWindow.document.title = titleMatch[1];
    }
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 300);
    };
  } else {
    alert('快顯視窗遭瀏覽器封鎖，請允許開啟快顯視窗以進行列印。');
  }
}

/**
 * 下載獨立的 HTML 報告檔案 (檔名比照 PDF 標題格式)
 */
export function exportHealthReportHtml(records, settings, options = {}) {
  const html = generateHealthReportHtml(records, settings, options);
  const title = options.title || '血壓報告單';
  const targetUserName = options.targetUserName || '';

  // 從生成的 HTML 中提取 <title>，直接轉換為安全檔名，保證與 PDF 標題完全一致
  const titleMatch = html.match(/<title>(.*?)<\/title>/);
  const baseTitle = titleMatch && titleMatch[1] 
    ? titleMatch[1] 
    : `${title}${targetUserName ? ` (${targetUserName})` : ''} ${formatPrintDateTime()} - Aegis System`;

  const filename = `${baseTitle.replace(/[/\\?%*:|"<>]/g, '_')}.html`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
