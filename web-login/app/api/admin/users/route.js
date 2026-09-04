import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  try {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT id, username, role FROM users ORDER BY username ASC',
      args: []
    });

    return NextResponse.json({
      success: true,
      users: result.rows
    });
  } catch (error) {
    console.error('Fetch Users Error:', error);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
