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
    console.log('連線至資料庫進行 Migration...');
    
    // 檢查並新增欄位
    const columnsToAdd = [
      { name: 'sys_high', type: 'INTEGER DEFAULT 140' },
      { name: 'sys_low', type: 'INTEGER DEFAULT 90' },
      { name: 'dia_high', type: 'INTEGER DEFAULT 90' },
      { name: 'dia_low', type: 'INTEGER DEFAULT 60' },
      { name: 'hr_high', type: 'INTEGER DEFAULT 100' },
      { name: 'hr_low', type: 'INTEGER DEFAULT 60' }
    ];

    for (const col of columnsToAdd) {
      try {
        await client.execute(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
        console.log(`✅ 成功新增欄位: ${col.name}`);
      } catch (err) {
        // 如果欄位已經存在，會丟出錯誤，這時可以忽略
        if (err.message.includes('duplicate column name')) {
          console.log(`ℹ️ 欄位已存在: ${col.name}`);
        } else {
          console.error(`❌ 新增欄位 ${col.name} 失敗:`, err.message);
        }
      }
    }

    // 建立健康數據表 (若不存在)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS health_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        measure_time DATETIME NOT NULL,
        sys INTEGER NOT NULL,
        dia INTEGER NOT NULL,
        hr INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, measure_time)
      )
    `);
    console.log('✅ health_data 資料表檢查/建立完成');

    console.log('Migration 執行完畢！');
  } catch (error) {
    console.error('Migration 失敗:', error);
  }
}

migrate();
