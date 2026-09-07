import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error('請先設定 TURSO_DATABASE_URL 與 TURSO_AUTH_TOKEN');
  process.exit(1);
}

const client = createClient({ url, authToken });

function generatePid() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let p = 'P-';
  for (let i = 0; i < 6; i++) {
    p += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return p;
}

async function migrate() {
  try {
    console.log('開始執行 User Display Name & PID Migration...');
    
    // 1. 新增欄位 display_name
    try {
      await client.execute(`ALTER TABLE users ADD COLUMN display_name TEXT`);
      console.log('✅ 成功新增欄位: display_name');
    } catch (err) {
      if (err.message.includes('duplicate column name')) console.log('ℹ️ 欄位已存在: display_name');
      else console.error('❌ 新增欄位 display_name 失敗:', err.message);
    }
    
    // 2. 新增欄位 pid
    try {
      await client.execute(`ALTER TABLE users ADD COLUMN pid TEXT`);
      console.log('✅ 成功新增欄位: pid');
    } catch (err) {
      if (err.message.includes('duplicate column name')) console.log('ℹ️ 欄位已存在: pid');
      else console.error('❌ 新增欄位 pid 失敗:', err.message);
    }

    // 3. 更新既有資料
    const users = await client.execute('SELECT id, username, pid, display_name FROM users');
    for (const user of users.rows) {
      const updates = [];
      const args = [];
      
      if (!user.display_name) {
        updates.push('display_name = ?');
        args.push(user.username);
      }
      
      if (!user.pid) {
        let isUnique = false;
        let newPid = '';
        // 確保不重複
        while (!isUnique) {
          newPid = generatePid();
          const check = await client.execute({ sql: 'SELECT id FROM users WHERE pid = ?', args: [newPid] });
          if (check.rows.length === 0) isUnique = true;
        }
        updates.push('pid = ?');
        args.push(newPid);
      }
      
      if (updates.length > 0) {
        args.push(user.id);
        await client.execute({
          sql: `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
          args: args
        });
        console.log(`✅ 已更新使用者 ${user.username} 的資料`);
      }
    }

    // 4. 建立 unique index
    try {
      await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_pid ON users(pid)');
      console.log('✅ 成功建立 Unique Index: idx_users_pid');
    } catch(err) {
      console.error('❌ 建立 Unique Index 失敗:', err.message);
    }

    console.log('Migration 執行完畢！');
  } catch (error) {
    console.error('Migration 失敗:', error);
  }
}

migrate();
