import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import Database from 'better-sqlite3';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import os from 'os';

const LOCATION_MAP = {
  '1': '左臂',
  '2': '右臂',
  '3': '左手腕',
  '4': '右手腕',
  '左臂': '左臂',
  '右臂': '右臂',
  '左手腕': '左手腕',
  '右手腕': '右手腕'
};

const POSTURE_MAP = {
  '1': '坐著',
  '2': '躺著',
  '3': '站著',
  '坐著': '坐著',
  '躺著': '躺著',
  '站著': '站著'
};

export async function POST(request) {
  let operatorUsername = '';
  let targetUsername = '';
  let fileName = '';

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    operatorUsername = formData.get('operator') || '';
    targetUsername = formData.get('targetUser') || '';

    if (!file || !operatorUsername || !targetUsername) {
      return NextResponse.json({ 
        error: '請提供檔案、操作者與目標帳號',
        details: '缺少必要的上傳欄位 (file, operator, targetUser)'
      }, { status: 400 });
    }

    fileName = file.name || 'unknown_file';

    if (operatorUsername === 'guest') {
      return NextResponse.json({ 
        error: '🔒 訪客體驗模式無法匯入或上傳檔案',
        details: '訪客帳號 (guest) 僅具備唯讀權限'
      }, { status: 403 });
    }

    const turso = getDb();
    
    // 取得操作者 ID 與 Role
    const operatorRes = await turso.execute({
      sql: 'SELECT id, role FROM users WHERE username = ?',
      args: [operatorUsername]
    });

    if (operatorRes.rows.length === 0) {
      return NextResponse.json({ 
        error: '找不到操作者帳號',
        details: `帳號 [${operatorUsername}] 不存在於系統使用者清單中`
      }, { status: 404 });
    }
    const operatorId = operatorRes.rows[0].id;
    const operatorRole = operatorRes.rows[0].role || 'users';

    // 權限防呆檢查
    if (operatorRole === 'users' && operatorUsername !== targetUsername) {
      return NextResponse.json({ 
        error: '一般用戶只能上傳資料至自己的帳號',
        details: `帳號 [${operatorUsername}] 權限為一般用戶，無法代為匯入至 [${targetUsername}]`
      }, { status: 403 });
    }

    // 取得目標使用者 ID
    const targetRes = await turso.execute({
      sql: 'SELECT id FROM users WHERE username = ?',
      args: [targetUsername]
    });

    if (targetRes.rows.length === 0) {
      return NextResponse.json({ 
        error: '找不到目標帳號',
        details: `目標帳號 [${targetUsername}] 不存在於系統使用者清單中`
      }, { status: 404 });
    }
    const targetUserId = targetRes.rows[0].id;

    // 解析檔案內容
    const lowerName = fileName.toLowerCase();
    let records = [];

    if (lowerName.endsWith('.csv')) {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      // 跳過標題列，假設第一行是標題 (包含 "日期")
      const startIndex = lines[0].includes('日期') ? 1 : 0;
      
      for (let i = startIndex; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 5) {
          const date = parts[0].trim();
          const time = parts[1].trim();
          const sys = parseInt(parts[2].trim());
          const dia = parseInt(parts[3].trim());
          const pul = parseInt(parts[4].trim());
          const location = parts[5] ? (LOCATION_MAP[parts[5].trim()] || parts[5].trim()) : '左臂';
          const posture = parts[6] ? (POSTURE_MAP[parts[6].trim()] || parts[6].trim()) : '坐著';
          const feel = parts[7] ? parts[7].trim() : null;
          const weight = parts[8] && !isNaN(parseFloat(parts[8].trim())) ? parseFloat(parts[8].trim()) : null;
          const mark = parts[9] ? parts[9].trim() : null;

          if (!isNaN(sys) && !isNaN(dia) && !isNaN(pul) && date && time) {
            records.push({ 
              date: `${date} ${time}`, 
              sys, 
              dia, 
              pul,
              location,
              posture,
              feel,
              weight,
              mark
            });
          }
        }
      }
    } else if (lowerName.endsWith('.json')) {
      const text = await file.text();
      try {
        const arr = JSON.parse(text);
        if (Array.isArray(arr)) {
          records = arr.map(item => ({
            date: item.time ? `${item.date} ${item.time}` : item.date, // 支援拆分或合併
            sys: parseInt(item.sys),
            dia: parseInt(item.dia),
            pul: parseInt(item.pul),
            location: item.location ? (LOCATION_MAP[String(item.location).trim()] || String(item.location).trim()) : '左臂',
            posture: item.posture ? (POSTURE_MAP[String(item.posture).trim()] || String(item.posture).trim()) : '坐著',
            feel: item.feel || null,
            weight: item.weight && !isNaN(Number(item.weight)) ? Number(item.weight) : null,
            mark: item.mark || null
          })).filter(r => !isNaN(r.sys) && !isNaN(r.dia) && !isNaN(r.pul) && r.date);
        }
      } catch (e) {
        return NextResponse.json({ 
          error: 'JSON 格式解析失敗', 
          details: `無法解析檔案內容為有效的 JSON 陣列：${e.message}` 
        }, { status: 400 });
      }
    } else {
      // 假設為 SQLite .bp, .db, .pb
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const tempFilePath = join(os.tmpdir(), `upload-${Date.now()}-${Math.random().toString(36).substring(7)}.sqlite`);
      await writeFile(tempFilePath, buffer);

      try {
        const sqliteDb = new Database(tempFilePath, { fileMustExist: true });
        const tableInfo = sqliteDb.prepare('PRAGMA table_info(bp)').all();
        const colNames = new Set(tableInfo.map(c => c.name.toLowerCase()));
        
        const hasCol = (name) => colNames.has(name.toLowerCase());
        const selectCols = ['date', 'sys', 'dia', 'pul'];
        if (hasCol('location')) selectCols.push('location');
        if (hasCol('posture')) selectCols.push('posture');
        if (hasCol('feel')) selectCols.push('feel');
        if (hasCol('weight')) selectCols.push('weight');
        if (hasCol('mark')) selectCols.push('mark');

        const rawRows = sqliteDb.prepare(`SELECT ${selectCols.join(', ')} FROM bp`).all();
        sqliteDb.close();

        records = rawRows.map(r => ({
          date: r.date,
          sys: parseInt(r.sys),
          dia: parseInt(r.dia),
          pul: parseInt(r.pul),
          location: r.location !== undefined ? (LOCATION_MAP[String(r.location).trim()] || (r.location ? String(r.location) : '左臂')) : '左臂',
          posture: r.posture !== undefined ? (POSTURE_MAP[String(r.posture).trim()] || (r.posture ? String(r.posture) : '坐著')) : '坐著',
          feel: r.feel || null,
          weight: r.weight && Number(r.weight) > 0 ? Number(r.weight) : null,
          mark: r.mark || null
        })).filter(r => !isNaN(r.sys) && !isNaN(r.dia) && !isNaN(r.pul) && r.date);
      } catch (e) {
        console.error('SQLite parsing error:', e);
        await unlink(tempFilePath).catch(() => {});
        return NextResponse.json({ 
          error: '檔案格式錯誤，無法解析資料庫', 
          details: `SQLite 讀取失敗，請確認檔案是否具備 bp 資料表結構：${e.message}`
        }, { status: 400 });
      }
      await unlink(tempFilePath).catch(() => {});
    }

    if (records.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: '檔案解析完成，但未發現有效的血壓紀錄資料', 
        count: 0 
      });
    }

    // 將紀錄批次 (Batch) 匯入至 Turso，每批 100 筆，避免逐筆寫入導致的網路超時與卡頓
    let inserted = 0;
    const BATCH_SIZE = 100;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const chunk = records.slice(i, i + BATCH_SIZE);
      const statements = chunk.map(record => ({
        sql: `INSERT INTO health_data (user_id, measure_time, sys, dia, hr, location, posture, feel, weight, mark) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id, measure_time) DO UPDATE SET
                sys = excluded.sys,
                dia = excluded.dia,
                hr = excluded.hr,
                location = COALESCE(excluded.location, health_data.location),
                posture = COALESCE(excluded.posture, health_data.posture),
                feel = COALESCE(excluded.feel, health_data.feel),
                weight = COALESCE(excluded.weight, health_data.weight),
                mark = COALESCE(excluded.mark, health_data.mark)`,
        args: [
          targetUserId, 
          record.date, 
          record.sys, 
          record.dia, 
          record.pul,
          record.location || null,
          record.posture || null,
          record.feel || null,
          record.weight || null,
          record.mark || null
        ]
      }));

      const batchResults = await turso.batch(statements, 'write');
      for (const res of batchResults) {
        if (res.rowsAffected > 0) {
          inserted++;
        }
      }
    }

    const duplicates = records.length - inserted;

    // 寫入歷史紀錄
    try {
      await turso.execute({
        sql: `INSERT INTO import_history (target_user_id, operator_user_id, file_name, total_records, duplicate_records, imported_records) 
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [targetUserId, operatorId, fileName, records.length, duplicates, inserted]
      });
    } catch (histErr) {
      console.error('寫入歷程失敗:', histErr);
    }

    // 寫入系統日誌
    try {
      await turso.execute({
        sql: `INSERT INTO system_logs (level, category, action, operator, target_user, file_name, message, details)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'INFO',
          'IMPORT',
          'file_import_success',
          operatorUsername,
          targetUsername,
          fileName,
          `成功匯入資料：共解析 ${records.length} 筆，寫入 ${inserted} 筆，略過重複 ${duplicates} 筆`,
          JSON.stringify({ total: records.length, inserted, duplicates })
        ]
      });
    } catch (logErr) {
      console.error('寫入 system_logs 失敗:', logErr);
    }

    return NextResponse.json({ 
      success: true, 
      message: `匯入完成！共解析 ${records.length} 筆，成功匯入 ${inserted} 筆，略過重複 ${duplicates} 筆。`,
      total: records.length,
      inserted: inserted,
      duplicates: duplicates,
      targetUser: targetUsername
    });

  } catch (error) {
    const errorId = `ERR-UPLOAD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    console.error(`[${errorId}] Upload Error:`, error);

    // 記錄錯誤至資料庫 system_logs
    try {
      const turso = getDb();
      await turso.execute({
        sql: `INSERT INTO system_logs (level, category, action, operator, target_user, file_name, message, details)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          'ERROR',
          'IMPORT',
          'file_upload_error',
          operatorUsername || 'unknown',
          targetUsername || 'unknown',
          fileName || 'unknown',
          error.message || '匯入時發生未預期的系統錯誤',
          JSON.stringify({ errorId, errorName: error.name, stack: error.stack })
        ]
      });
    } catch (logErr) {
      console.error('Failed to log error to system_logs:', logErr);
    }

    return NextResponse.json({ 
      error: '伺服器匯入處理失敗',
      details: error.message || '未知錯誤，請檢附錯誤追蹤代碼聯繫系統管理員',
      errorId,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
