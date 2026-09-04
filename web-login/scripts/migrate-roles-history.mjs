import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// 載入 .env.local
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error('請先在 .env.local 中設定 TURSO_DATABASE_URL 與 TURSO_AUTH_TOKEN');
  process.exit(1);
}

const client = createClient({ url, authToken });

async function migrate() {
  try {
    console.log('連線至資料庫進行 Roles 與 History Migration...');
    
    // 1. 在 users 表新增 role 欄位
    try {
      await client.execute(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'users'`);
      console.log('✅ 成功新增欄位: role');
    } catch (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('ℹ️ 欄位已存在: role');
      } else {
        console.error('❌ 新增欄位 role 失敗:', err.message);
      }
    }

    // 2. 將初始帳號 cvn 升級為 admins
    try {
      const res = await client.execute({
        sql: "UPDATE users SET role = 'admins' WHERE username = 'cvn'",
        args: []
      });
      if (res.rowsAffected > 0) {
        console.log('✅ 成功將 cvn 帳號升級為 admins');
      } else {
        console.log('ℹ️ 找不到 cvn 帳號，跳過升級');
      }
    } catch (err) {
      console.error('❌ 升級 cvn 失敗:', err.message);
    }

    // 3. 建立 import_history 表格
    await client.execute(`
      CREATE TABLE IF NOT EXISTS import_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_user_id INTEGER NOT NULL,
        operator_user_id INTEGER NOT NULL,
        file_name TEXT,
        total_records INTEGER NOT NULL,
        duplicate_records INTEGER NOT NULL,
        imported_records INTEGER NOT NULL,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (target_user_id) REFERENCES users(id),
        FOREIGN KEY (operator_user_id) REFERENCES users(id)
      )
    `);
    console.log('✅ import_history 資料表檢查/建立完成');

    console.log('Migration 執行完畢！');
  } catch (error) {
    console.error('Migration 失敗:', error);
  }
}

migrate();
