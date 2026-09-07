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

    const { username, newPassword } = body;

    if (!username || !newPassword) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: '新密碼長度必須大於或等於 6 個字元' }, { status: 400 });
    }

    const db = getDb();

    // 檢查使用者
    const result = await db.execute({
      sql: 'SELECT id, require_pwd_change FROM users WHERE username = ?',
      args: [username]
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: '找不到該帳號' }, { status: 404 });
    }

    const user = result.rows[0];

    if (user.require_pwd_change !== 1) {
      return NextResponse.json({ error: '該帳號目前不需要強制更改密碼' }, { status: 403 });
    }

    // 雜湊新密碼
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // 更新密碼並解除限制
    await db.execute({
      sql: 'UPDATE users SET password_hash = ?, require_pwd_change = 0 WHERE id = ?',
      args: [passwordHash, user.id]
    });

    return NextResponse.json({
      success: true,
      message: '密碼更新成功，請重新登入！'
    });
  } catch (error) {
    console.error('Force Change Password Error:', error);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
