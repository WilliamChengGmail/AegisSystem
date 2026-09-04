import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  let username = searchParams.get('username');

  if (!username) {
    return NextResponse.json({ error: '請提供帳號' }, { status: 400 });
  }

  try {
    const db = getDb();

    // 處理訪客模式
    if (username === 'guest') {
      let allowGuest = 'enable';
      let visibleUsers = ['cvn'];

      try {
        const configRes = await db.execute({
          sql: "SELECT key, value FROM site_configs WHERE key IN ('allow_guest_login', 'guest_visible_users')"
        });

        configRes.rows.forEach(r => {
          if (r.key === 'allow_guest_login') allowGuest = r.value;
          if (r.key === 'guest_visible_users') {
            try { visibleUsers = JSON.parse(r.value); } catch (e) {}
          }
        });
      } catch (dbErr) {
        console.warn('site_configs read warning in health API:', dbErr.message);
      }

      if (allowGuest !== 'enable') {
        return NextResponse.json({ error: '訪客存取未開放' }, { status: 403 });
      }

      // 訪客預設檢視許可的第一位使用者 (例如 cvn)
      const target = searchParams.get('targetUser') || visibleUsers[0] || 'cvn';
      if (Array.isArray(visibleUsers) && visibleUsers.length > 0 && !visibleUsers.includes(target)) {
        return NextResponse.json({ error: '無權限檢視此使用者數據' }, { status: 403 });
      }
      username = target;
    }

    // 取得使用者的高低標設定
    const userRes = await db.execute({
      sql: 'SELECT id, sys_high, sys_low, dia_high, dia_low, hr_high, hr_low FROM users WHERE username = ?',
      args: [username]
    });

    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: '找不到使用者' }, { status: 404 });
    }
    const user = userRes.rows[0];

    // 撈取血壓資料
    const dataRes = await db.execute({
      sql: 'SELECT date, sys, dia, pul FROM bp ORDER BY date DESC',
      args: []
    });

    return NextResponse.json({
      data: dataRes.rows,
      settings: user,
      viewingUser: username
    });

  } catch (error) {
    console.error('Health GET Error:', error);
    return NextResponse.json({ error: '伺服器發生錯誤: ' + (error.message || '未知錯誤') }, { status: 500 });
  }
}
