import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

// 產生隨機 8 碼密碼
function generateRandomPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function PUT(request) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
    }

    const { targetUserId, operatorId } = body;

    if (!targetUserId || !operatorId) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 });
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

    // 檢查對象是否存在
    const targetRes = await db.execute({
      sql: 'SELECT id, username FROM users WHERE id = ?',
      args: [targetUserId]
    });

    if (targetRes.rows.length === 0) {
      return NextResponse.json({ error: '找不到該對象' }, { status: 404 });
    }

    // 產生密碼並雜湊
    const newPassword = generateRandomPassword();
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // 更新密碼並強制下次登入需修改
    await db.execute({
      sql: 'UPDATE users SET password_hash = ?, require_pwd_change = 1 WHERE id = ?',
      args: [passwordHash, targetUserId]
    });

    // 寫入 Log 紀錄該次發配的臨時密碼 (供管理員之後查詢)
    await db.execute({
      sql: `INSERT INTO admin_actions_log (operator_id, target_user_id, action_type, details)
            VALUES (?, ?, ?, ?)`,
      args: [operatorId, targetUserId, 'reset_password', `temp_password: ${newPassword}`]
    });

    return NextResponse.json({
      success: true,
      message: '密碼重設成功',
      newPassword: newPassword
    });

  } catch (error) {
    console.error('Password Reset Error:', error);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
