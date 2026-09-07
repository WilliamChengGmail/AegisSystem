import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function PUT(request) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
    }

    const { targetUserId, displayName, role, operatorId } = body;

    if (!targetUserId || !displayName || !role || !operatorId) {
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

    // 更新使用者資料
    const updateRes = await db.execute({
      sql: 'UPDATE users SET display_name = ?, role = ? WHERE id = ?',
      args: [displayName, role, targetUserId]
    });

    if (updateRes.rowsAffected === 0) {
      return NextResponse.json({ error: '找不到該帳號' }, { status: 404 });
    }

    // 紀錄 actions log
    await db.execute({
      sql: `INSERT INTO admin_actions_log (operator_id, target_user_id, action_type, details)
            VALUES (?, ?, 'update_user', ?)`,
      args: [operatorId, targetUserId, `更新: 顯示名稱=${displayName}, 角色=${role}`]
    });

    return NextResponse.json({
      success: true,
      message: '使用者資料更新成功'
    });

  } catch (error) {
    console.error('Update User Error:', error);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
