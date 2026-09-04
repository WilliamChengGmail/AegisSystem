const fs = require('fs');
const dotenv = require('dotenv');
const { createClient } = require('@libsql/client');

const env = dotenv.parse(fs.readFileSync('t:/AegisSystem/web-login/.env.local'));
const client = createClient({
  url: env.TURSO_DATABASE_URL,
  authToken: env.TURSO_AUTH_TOKEN
});

async function main() {
  try {
    console.log('正在為 Turso 資料庫建立 site_configs 資料表...');

    await client.execute(`
      CREATE TABLE IF NOT EXISTS site_configs (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ 1. site_configs 資料表建立成功');

    await client.execute({
      sql: `INSERT OR REPLACE INTO site_configs (key, value, description) VALUES (?, ?, ?)`,
      args: ['allow_guest_login', 'enable', '是否允許訪客免密碼直接登入 (enable/disable)']
    });
    console.log('✅ 2. allow_guest_login 設定成功寫入: enable');

    await client.execute({
      sql: `INSERT OR REPLACE INTO site_configs (key, value, description) VALUES (?, ?, ?)`,
      args: ['guest_visible_users', '["cvn"]', '訪客模式下許可查看數據的使用者帳號清單 (JSON 陣列)']
    });
    console.log('✅ 3. guest_visible_users 設定成功寫入: ["cvn"]');

    const result = await client.execute('SELECT * FROM site_configs');
    console.log('\n🎉 site_configs 資料表完整內容如下：');
    console.table(result.rows);
  } catch (err) {
    console.error('❌ 執行失敗:', err);
  }
}

main();
