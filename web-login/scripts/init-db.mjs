import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';
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

async function init() {
  try {
    console.log('連線至資料庫...');
    
    // 建立資料表
    await client.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ users 資料表檢查/建立完成');

    // 檢查 cvn 帳號是否存在
    const existingUser = await client.execute({
      sql: 'SELECT * FROM users WHERE username = ?',
      args: ['cvn']
    });

    if (existingUser.rows.length === 0) {
      // 建立初始帳號
      const password = '1234';
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);

      await client.execute({
        sql: 'INSERT INTO users (username, password_hash) VALUES (?, ?)',
        args: ['cvn', hash]
      });
      console.log('✅ 初始帳號 cvn 建立完成 (密碼已加密)');
    } else {
      console.log('ℹ️ 帳號 cvn 已存在，跳過建立');
    }

    console.log('初始化腳本執行完畢！');
  } catch (error) {
    console.error('初始化失敗:', error);
  }
}

init();
