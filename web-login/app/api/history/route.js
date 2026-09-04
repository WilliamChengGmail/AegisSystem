import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');

  if (!username) {
    return NextResponse.json({ error: '請提供帳號' }, { status: 400 });
  }
  
  if (username === 'guest') {
    return NextResponse.json({ error: '訪客無權限查看歷程' }, { status: 403 });
  }

  try {
    const db = getDb();
    
    // 查詢發出請求的用戶身份
    const userRes = await db.execute({
      sql: 'SELECT id, role FROM users WHERE username = ?',
      args: [username]
    });

    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: '找不到使用者' }, { status: 404 });
    }
    const user = userRes.rows[0];
    const role = user.role || 'users';

    let historyQuery = `
      SELECT 
        h.id, h.file_name, h.total_records, h.duplicate_records, h.imported_records, h.executed_at, h.action_type,
        tu.username as target_username,
        ou.username as operator_username
      FROM import_history h
      JOIN users tu ON h.target_user_id = tu.id
      JOIN users ou ON h.operator_user_id = ou.id
    `;
    let args = [];

    if (role !== 'admins') {
      historyQuery += ` WHERE h.target_user_id = ?`;
      args = [user.id];
    }

    historyQuery += ` ORDER BY h.executed_at DESC`;

    const result = await db.execute({
      sql: historyQuery,
      args: args
    });

    return NextResponse.json({
      success: true,
      history: result.rows
    });

  } catch (error) {
    console.error('Fetch History Error:', error);
    return NextResponse.json({ error: '伺服器發生未知錯誤' }, { status: 500 });
  }
}
