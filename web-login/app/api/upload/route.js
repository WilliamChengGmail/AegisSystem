import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import Database from 'better-sqlite3';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import os from 'os';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const operatorUsername = formData.get('operator');
    const targetUsername = formData.get('targetUser');

    if (!file || !operatorUsername || !targetUsername) {
      return NextResponse.json({ error: '請提供檔案、操作者與目標帳號' }, { status: 400 });
    }

    if (operatorUsername === 'guest') {
      return NextResponse.json({ error: '🔒 訪客體驗模式無法匯入或上傳檔案' }, { status: 403 });
    }

    const turso = getDb();
    
    // 取得操作者 ID 與 Role
    const operatorRes = await turso.execute({
      sql: 'SELECT id, role FROM users WHERE username = ?',
      args: [operatorUsername]
    });

    if (operatorRes.rows.length === 0) {
      return NextResponse.json({ error: '找不到操作者帳號' }, { status: 404 });
    }
    const operatorId = operatorRes.rows[0].id;
    const operatorRole = operatorRes.rows[0].role || 'users';

    // 權限防呆檢查
    if (operatorRole === 'users' && operatorUsername !== targetUsername) {
      return NextResponse.json({ error: '一般用戶只能上傳資料至自己的帳號' }, { status: 403 });
    }

    // 取得目標使用者 ID
    const targetRes = await turso.execute({
      sql: 'SELECT id FROM users WHERE username = ?',
      args: [targetUsername]
    });

    if (targetRes.rows.length === 0) {
      return NextResponse.json({ error: '找不到目標帳號' }, { status: 404 });
    }
    const targetUserId = targetRes.rows[0].id;

    // 解析檔案內容
    const fileName = file.name || 'unknown_file';
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
          if (!isNaN(sys) && !isNaN(dia) && !isNaN(pul) && date && time) {
            records.push({ date: `${date} ${time}`, sys, dia, pul });
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
            pul: parseInt(item.pul)
          })).filter(r => !isNaN(r.sys) && !isNaN(r.dia) && !isNaN(r.pul) && r.date);
        }
      } catch (e) {
        return NextResponse.json({ error: 'JSON 格式解析失敗' }, { status: 400 });
      }
    } else {
      // 假設為 SQLite .bp, .db, .pb
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const tempFilePath = join(os.tmpdir(), `upload-${Date.now()}-${Math.random().toString(36).substring(7)}.sqlite`);
      await writeFile(tempFilePath, buffer);

      try {
        const sqliteDb = new Database(tempFilePath, { fileMustExist: true });
        records = sqliteDb.prepare('SELECT date, sys, dia, pul FROM bp').all();
        sqliteDb.close();
      } catch (e) {
        console.error('SQLite parsing error:', e);
        await unlink(tempFilePath).catch(() => {});
        return NextResponse.json({ error: '檔案格式錯誤，無法解析資料庫' }, { status: 400 });
      }
      await unlink(tempFilePath).catch(() => {});
    }

    if (records.length === 0) {
       return NextResponse.json({ success: true, message: '檔案中沒有有效的血壓紀錄', count: 0 });
    }

    // 將紀錄匯入至 Turso
    let inserted = 0;
    for (const record of records) {
      try {
        const res = await turso.execute({
          sql: `INSERT INTO health_data (user_id, measure_time, sys, dia, hr) 
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id, measure_time) DO NOTHING`,
          args: [targetUserId, record.date, record.sys, record.dia, record.pul]
        });
        if (res.rowsAffected > 0) {
          inserted++;
        }
      } catch (e) {
        // 忽略個別寫入錯誤
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

    return NextResponse.json({ 
      success: true, 
      message: `匯入完成。共解析 ${records.length} 筆，成功匯入 ${inserted} 筆，略過重複 ${duplicates} 筆。`,
      total: records.length,
      inserted: inserted,
      duplicates: duplicates,
      targetUser: targetUsername
    });

  } catch (error) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: '伺服器發生未知的錯誤' }, { status: 500 });
  }
}
