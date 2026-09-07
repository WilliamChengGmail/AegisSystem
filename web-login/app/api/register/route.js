import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(request) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ error: '請提供有效的 JSON 請求內容' }, { status: 400 });
    }

    const { username, password, displayName } = body;
    if (!username || !password || !displayName) {
      return NextResponse.json({ error: '請提供帳號、密碼與顯示名稱' }, { status: 400 });
    }

    const db = getDb();

    // 檢查是否開放註冊
    let allowRegistration = 'enable';
    try {
      const configRes = await db.execute({
        sql: "SELECT value FROM site_configs WHERE key = 'allow_registration'"
      });
      if (configRes.rows.length > 0) {
        allowRegistration = configRes.rows[0].value;
      }
    } catch (dbErr) {
      console.warn('Failed to read site_configs:', dbErr.message);
    }

    if (allowRegistration !== 'enable') {
      return NextResponse.json({ error: '目前系統未開放註冊新帳號' }, { status: 403 });
    }

    // 檢查帳號是否已存在
    const existing = await db.execute({
      sql: 'SELECT id FROM users WHERE username = ?',
      args: [username]
    });

    if (existing.rows.length > 0) {
      return NextResponse.json({ error: '該帳號已被使用' }, { status: 409 });
    }

    // 雜湊密碼
    const passwordHash = await bcrypt.hash(password, 10);

    // 產生不重複的 PID
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let isUnique = false;
    let newPid = '';
    while (!isUnique) {
      newPid = 'P-';
      for (let i = 0; i < 6; i++) {
        newPid += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const check = await db.execute({ sql: 'SELECT id FROM users WHERE pid = ?', args: [newPid] });
      if (check.rows.length === 0) isUnique = true;
    }

    // 新增帳號 (預設 status='pending', require_pwd_change=1)
    await db.execute({
      sql: `INSERT INTO users (username, display_name, pid, password_hash, role, status, require_pwd_change) 
            VALUES (?, ?, ?, ?, 'users', 'pending', 1)`,
      args: [username, displayName, newPid, passwordHash]
    });

    return NextResponse.json({ 
      success: true, 
      message: '註冊成功，請等待管理員審核' 
    });

  } catch (error) {
    console.error('Register Error:', error);
    return NextResponse.json({ error: '伺服器錯誤: ' + (error.message || '未知錯誤') }, { status: 500 });
  }
}
