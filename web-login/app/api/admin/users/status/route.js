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

    const { targetUserId, status, operatorId } = body;

    if (!targetUserId || !status || !operatorId) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 });
    }

    if (!['active', 'suspended', 'pending'].includes(status)) {
      return NextResponse.json({ error: '不合法的狀態值' }, { status: 400 });
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

    // 防止停權自己
    if (String(targetUserId) === String(operatorId) && status === 'suspended') {
      return NextResponse.json({ error: '不能將自己的帳號停權' }, { status: 400 });
    }

    // 更新狀態
    await db.execute({
      sql: 'UPDATE users SET status = ? WHERE id = ?',
      args: [status, targetUserId]
    });

    // 紀錄 actions log
    await db.execute({
      sql: `INSERT INTO admin_actions_log (operator_id, target_user_id, action_type, details)
            VALUES (?, ?, ?, ?)`,
      args: [operatorId, targetUserId, 'change_status', `status_changed_to: ${status}`]
    });

    return NextResponse.json({
      success: true,
      message: '狀態更新成功'
    });

  } catch (error) {
    console.error('Update Status Error:', error);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
