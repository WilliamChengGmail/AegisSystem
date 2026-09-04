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
  console.error('請先設定 TURSO_DATABASE_URL 與 TURSO_AUTH_TOKEN');
  process.exit(1);
}

const client = createClient({ url, authToken });

async function migrate() {
  try {
    console.log('開始更新 import_history 資料表 (新增 action_type)...');
    
    // 在 import_history 表新增 action_type 欄位
    try {
      await client.execute(`ALTER TABLE import_history ADD COLUMN action_type TEXT DEFAULT 'import'`);
      console.log('✅ 成功新增欄位: action_type');
    } catch (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('ℹ️ 欄位已存在: action_type');
      } else {
        console.error('❌ 新增欄位 action_type 失敗:', err.message);
      }
    }

    console.log('Migration 執行完畢！');
  } catch (error) {
    console.error('Migration 失敗:', error);
  }
}

migrate();
