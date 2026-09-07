import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const operatorId = searchParams.get('operatorId');

  if (!operatorId) {
    return NextResponse.json({ error: '請提供帳號識別碼' }, { status: 400 });
  }

  try {
    const db = getDb();
    
    // 檢查 operator 是否為管理員
    const opRes = await db.execute({
      sql: 'SELECT role FROM users WHERE id = ?',
      args: [operatorId]
    });

    if (opRes.rows.length === 0 || opRes.rows[0].role !== 'admins') {
      return NextResponse.json({ error: '權限不足' }, { status: 403 });
    }

    const result = await db.execute({
      sql: `SELECT l.id, l.action_type, l.details, l.created_at, 
                   o.username as operator_username, 
                   t.username as target_username
            FROM admin_actions_log l
            LEFT JOIN users o ON l.operator_id = o.id
            LEFT JOIN users t ON l.target_user_id = t.id
            ORDER BY l.created_at DESC`,
      args: []
    });

    return NextResponse.json({
      success: true,
      logs: result.rows
    });
  } catch (error) {
    console.error('Fetch Logs Error:', error);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
