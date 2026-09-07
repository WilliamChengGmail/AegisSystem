import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(request) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
    }

    const { username, password, role, displayName, operatorId } = body;

    if (!username || !password || !role || !displayName || !operatorId) {
      return NextResponse.json({ error: '缺少必要參數 (需包含帳號、密碼、角色與顯示名稱)' }, { status: 400 });
    }

    const db = getDb();

    // 檢查 operator 是否為管理員
    const opRes = await db.execute({
      sql: 'SELECT role FROM users WHERE id = ?',
      args: [operatorId]
    });

    if (opRes.rows.length === 0 || opRes.rows[0].role !== 'admins') {
      return NextResponse.json({ error: '權限不足' }, { status: 403 });
    }

    // 檢查帳號是否已存在
    const existing = await db.execute({
      sql: 'SELECT id FROM users WHERE username = ?',
      args: [username]
    });

    if (existing.rows.length > 0) {
      return NextResponse.json({ error: '該帳號名稱已存在' }, { status: 409 });
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

    // 新增帳號
    const insertRes = await db.execute({
      sql: `INSERT INTO users (username, display_name, pid, password_hash, role, status, require_pwd_change) 
            VALUES (?, ?, ?, ?, ?, 'active', 1)`,
      args: [username, displayName, newPid, passwordHash, role]
    });

    // 紀錄 actions log
    await db.execute({
      sql: `INSERT INTO admin_actions_log (operator_id, target_user_id, action_type, details)
            VALUES (?, ?, 'create_user', ?)`,
      args: [operatorId, insertRes.lastInsertRowid, `role: ${role}`]
    });

    return NextResponse.json({
      success: true,
      message: '帳號建立成功！首次登入將會被強制要求更改密碼。'
    });

  } catch (error) {
    console.error('Create User Error:', error);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
