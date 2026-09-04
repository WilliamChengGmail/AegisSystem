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
    const username = formData.get('username');

    if (!file || !username) {
      return NextResponse.json({ error: '請提供檔案與帳號' }, { status: 400 });
    }

    if (username === 'guest') {
      return NextResponse.json({ error: '🔒 訪客體驗模式無法匯入或上傳檔案' }, { status: 403 });
    }

    // 取得使用者 ID
    const turso = getDb();
    const userRes = await turso.execute({
      sql: 'SELECT id FROM users WHERE username = ?',
      args: [username]
    });

    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: '找不到使用者' }, { status: 404 });
    }
    const userId = userRes.rows[0].id;

    // 將上傳的檔案暫存到系統 /tmp 目錄
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const tempFilePath = join(os.tmpdir(), `upload-${Date.now()}.bp`);
    await writeFile(tempFilePath, buffer);

    let records = [];
    try {
      // 使用 better-sqlite3 讀取 .bp / .db 檔案
      const sqliteDb = new Database(tempFilePath, { fileMustExist: true });

      // 讀取 bp 資料表
      records = sqliteDb.prepare('SELECT date, sys, dia, pul FROM bp').all();
      sqliteDb.close();
    } catch (e) {
      console.error('SQLite parsing error:', e);
      await unlink(tempFilePath).catch(() => {});
      return NextResponse.json({ error: '檔案格式錯誤，無法解析資料庫' }, { status: 400 });
    }

    // 刪除暫存檔
    await unlink(tempFilePath).catch(() => {});

    if (records.length === 0) {
       return NextResponse.json({ success: true, message: '檔案中沒有血壓紀錄', count: 0 });
    }

    // 將紀錄匯入至 Turso
    let inserted = 0;
    for (const record of records) {
      try {
        await turso.execute({
          sql: `INSERT INTO health_data (user_id, measure_time, sys, dia, hr) 
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id, measure_time) DO NOTHING`,
          args: [userId, record.date, record.sys, record.dia, record.pul]
        });
        inserted++;
      } catch (e) {
        // 忽略個別寫入錯誤
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `成功解析 ${records.length} 筆資料`,
      total: records.length
    });

  } catch (error) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: '伺服器發生未知的錯誤' }, { status: 500 });
  }
}
