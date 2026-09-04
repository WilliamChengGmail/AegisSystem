import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// 取得使用者設定
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  let username = searchParams.get('username');

  if (!username) {
    return NextResponse.json({ error: '請提供帳號' }, { status: 400 });
  }

  try {
    const db = getDb();

    // 訪客預設取得 cvn 或 target 的高低標設定
    if (username === 'guest') {
      username = 'cvn';
    }

    const result = await db.execute({
      sql: 'SELECT sys_high, sys_low, dia_high, dia_low, hr_high, hr_low FROM users WHERE username = ?',
      args: [username]
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: '找不到使用者' }, { status: 404 });
    }

    return NextResponse.json({ settings: result.rows[0] });
  } catch (error) {
    console.error('Settings GET Error:', error);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}

// 更新使用者設定
export async function POST(request) {
  try {
    const { username, sys_high, sys_low, dia_high, dia_low, hr_high, hr_low } = await request.json();

    if (!username) {
      return NextResponse.json({ error: '請提供帳號' }, { status: 400 });
    }

    if (username === 'guest') {
      return NextResponse.json({ error: '🔒 訪客體驗模式無法變更高低標設定' }, { status: 403 });
    }

    const db = getDb();
    await db.execute({
      sql: `
        UPDATE users 
        SET sys_high = ?, sys_low = ?, dia_high = ?, dia_low = ?, hr_high = ?, hr_low = ?
        WHERE username = ?
      `,
      args: [sys_high, sys_low, dia_high, dia_low, hr_high, hr_low, username]
    });

    return NextResponse.json({ success: true, message: '設定儲存成功' });
  } catch (error) {
    console.error('Settings POST Error:', error);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
