// 查詢 Turso 資料庫結構
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
  // 查看所有表格
  const tables = await client.execute("SELECT name, sql FROM sqlite_master WHERE type='table'");
  console.log("=== TABLES ===");
  for (const row of tables.rows) {
    console.log(`Table: ${row.name}`);
    console.log(`SQL: ${row.sql}`);
    console.log('---');
  }

  // 嘗試查看 bp 表
  try {
    const bpFirst = await client.execute("SELECT * FROM bp ORDER BY date DESC LIMIT 5");
    console.log("=== BP (latest 5) ===");
    console.log("Columns:", bpFirst.columns);
    for (const row of bpFirst.rows) {
      console.log(JSON.stringify(row));
    }
    const bpCount = await client.execute("SELECT COUNT(*) as cnt FROM bp");
    console.log("Total bp records:", bpCount.rows[0].cnt);
  } catch(e) {
    console.log("No bp table:", e.message);
  }

  // 嘗試查看 health_data 表
  try {
    const hd = await client.execute("SELECT * FROM health_data ORDER BY measure_time DESC LIMIT 5");
    console.log("=== HEALTH_DATA (latest 5) ===");
    for (const row of hd.rows) {
      console.log(JSON.stringify(row));
    }
    const hdCount = await client.execute("SELECT COUNT(*) as cnt FROM health_data");
    console.log("Total health_data records:", hdCount.rows[0].cnt);
  } catch(e) {
    console.log("No health_data table:", e.message);
  }

  // 看 users 表
  try {
    const users = await client.execute("SELECT id, username, sys_high, sys_low, dia_high, dia_low, hr_high, hr_low FROM users");
    console.log("=== USERS ===");
    for (const row of users.rows) {
      console.log(JSON.stringify(row));
    }
  } catch(e) {
    console.log("Users table:", e.message);
  }
}

main().catch(console.error);
