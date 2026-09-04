import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

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
    console.log('連線至 Turso 資料庫執行 site_configs 遷移...');

    // 建立 site_configs 資料表
    await client.execute(`
      CREATE TABLE IF NOT EXISTS site_configs (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ site_configs 資料表檢查/建立完成');

    // 初始設定 1: allow_guest_login (enable)
    await client.execute({
      sql: `
        INSERT INTO site_configs (key, value, description)
        VALUES ('allow_guest_login', 'enable', '是否允許訪客免密碼直接登入 (enable/disable)')
        ON CONFLICT(key) DO NOTHING
      `
    });
    console.log('✅ 組態 allow_guest_login 檢查/初始化完成');

    // 初始設定 2: guest_visible_users (["cvn"])
    await client.execute({
      sql: `
        INSERT INTO site_configs (key, value, description)
        VALUES ('guest_visible_users', '["cvn"]', '訪客模式下許可查看數據的使用者帳號清單 (JSON 陣列)')
        ON CONFLICT(key) DO NOTHING
      `
    });
    console.log('✅ 組態 guest_visible_users 檢查/初始化完成');

    console.log('🎉 網站組態資料庫遷移全部順利完成！');
  } catch (error) {
    console.error('❌ 遷移失敗:', error);
  }
}

migrate();
