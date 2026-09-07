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

    const { targetUserId, role, operatorId } = body;

    if (!targetUserId || !role || !operatorId) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 });
    }

    if (!['admins', 'users', 'guests'].includes(role)) {
      return NextResponse.json({ error: '不合法的角色值' }, { status: 400 });
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

    // 防止降級自己
    if (targetUserId === operatorId && role !== 'admins') {
      return NextResponse.json({ error: '不能將自己的管理員身分降級' }, { status: 400 });
    }

    // 更新角色
    await db.execute({
      sql: 'UPDATE users SET role = ? WHERE id = ?',
      args: [role, targetUserId]
    });

    // 紀錄 actions log
    await db.execute({
      sql: `INSERT INTO admin_actions_log (operator_id, target_user_id, action_type, details)
            VALUES (?, ?, ?, ?)`,
      args: [operatorId, targetUserId, 'change_role', `role_changed_to: ${role}`]
    });

    return NextResponse.json({
      success: true,
      message: '權限更新成功'
    });

  } catch (error) {
    console.error('Update Role Error:', error);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
