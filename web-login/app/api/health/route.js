import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');

  if (!username) {
    return NextResponse.json({ error: '請提供帳號' }, { status: 400 });
  }

  try {
    const db = getDb();

    // 取得使用者的高低標設定
    const userRes = await db.execute({
      sql: 'SELECT id, sys_high, sys_low, dia_high, dia_low, hr_high, hr_low FROM users WHERE username = ?',
      args: [username]
    });

    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: '找不到使用者' }, { status: 404 });
    }
    const user = userRes.rows[0];

    // 一次撈取全部血壓資料，時間區間篩選交由前端處理
    const dataRes = await db.execute({
      sql: 'SELECT date, sys, dia, pul FROM bp ORDER BY date DESC',
      args: []
    });

    return NextResponse.json({
      data: dataRes.rows,
      settings: user,
    });

  } catch (error) {
    console.error('Health GET Error:', error);
    return NextResponse.json({ error: '伺服器發生錯誤: ' + error.message }, { status: 500 });
  }
}
