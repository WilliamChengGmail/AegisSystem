import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error('請設定 TURSO_DATABASE_URL 與 TURSO_AUTH_TOKEN');
  process.exit(1);
}

const client = createClient({ url, authToken });

async function migrate() {
  try {
    console.log('開始從 bp 資料表遷移資料至 health_data...');

    // 取得 cvn 使用者 ID
    const userRes = await client.execute("SELECT id FROM users WHERE username = 'cvn'");
    if (userRes.rows.length === 0) {
      console.error('找不到 cvn 使用者，無法遷移');
      return;
    }
    const cvnId = userRes.rows[0].id;

    // 讀取所有 bp 資料
    let records = [];
    try {
      const bpRes = await client.execute("SELECT * FROM bp");
      records = bpRes.rows;
      console.log(`在 bp 資料表中找到 ${records.length} 筆資料`);
    } catch (e) {
      console.log('bp 資料表可能不存在或無法讀取:', e.message);
      return;
    }

    if (records.length === 0) {
      console.log('bp 資料表為空，不需遷移');
      return;
    }

    // 寫入 health_data
    let inserted = 0;
    for (const record of records) {
      try {
        const res = await client.execute({
          sql: `INSERT INTO health_data (user_id, measure_time, sys, dia, hr) 
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id, measure_time) DO NOTHING`,
          args: [cvnId, record.date, record.sys, record.dia, record.pul]
        });
        if (res.rowsAffected > 0) inserted++;
      } catch (err) {
        // ignore individual insert errors
      }
    }

    console.log(`遷移完成！共匯入 ${inserted} 筆新資料至 cvn 帳號 (略過重複 ${records.length - inserted} 筆)`);
  } catch (err) {
    console.error('發生錯誤:', err);
  }
}

migrate();
