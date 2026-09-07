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
    console.log('開始執行 User Management Migration...');
    
    // 1. users 表新增 status, require_pwd_change
    try {
      await client.execute(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'pending'`);
      console.log('✅ 成功新增欄位: status');
    } catch (err) {
      if (err.message.includes('duplicate column name')) console.log('ℹ️ 欄位已存在: status');
      else console.error('❌ 新增欄位 status 失敗:', err.message);
    }
    
    try {
      await client.execute(`ALTER TABLE users ADD COLUMN require_pwd_change INTEGER DEFAULT 1`);
      console.log('✅ 成功新增欄位: require_pwd_change');
    } catch (err) {
      if (err.message.includes('duplicate column name')) console.log('ℹ️ 欄位已存在: require_pwd_change');
      else console.error('❌ 新增欄位 require_pwd_change 失敗:', err.message);
    }

    // 將既有的帳號 (如 cvn) 全部設為 active, 且不用換密碼 (require_pwd_change = 0) 
    // 以免現有使用者一登入就被卡住
    await client.execute(`UPDATE users SET status = 'active', require_pwd_change = 0 WHERE status IS NULL OR status = 'pending'`);
    console.log('✅ 已更新現有使用者狀態為 active，不需強制換密碼。');

    // 2. 建立 admin_actions_log 資料表
    await client.execute(`
      CREATE TABLE IF NOT EXISTS admin_actions_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operator_id INTEGER NOT NULL,
        target_user_id INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (operator_id) REFERENCES users(id),
        FOREIGN KEY (target_user_id) REFERENCES users(id)
      )
    `);
    console.log('✅ admin_actions_log 資料表建立/檢查完成。');

    // 3. 建立 site_configs 資料表 (如果不存在的話)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS site_configs (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ site_configs 資料表建立/檢查完成。');

    // 初始化 allow_registration = enable
    await client.execute(`
      INSERT INTO site_configs (key, value) 
      VALUES ('allow_registration', 'enable')
      ON CONFLICT(key) DO NOTHING
    `);
    console.log('✅ 系統組態 allow_registration 預設值初始化完成。');

    console.log('Migration 執行完畢！');
  } catch (error) {
    console.error('Migration 失敗:', error);
  }
}

migrate();
