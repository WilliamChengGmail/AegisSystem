import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const requester = searchParams.get('requester');
  const target = searchParams.get('target');

  // 向下相容舊版前端
  let rUser = requester || searchParams.get('username');
  let tUser = target || searchParams.get('targetUser') || rUser;

  if (!rUser || !tUser) {
    return NextResponse.json({ error: '請提供帳號參數' }, { status: 400 });
  }

  try {
    const db = getDb();
    let requesterRole = 'users';
    let requesterSettings = null;

    if (rUser === 'guest') {
      requesterRole = 'guests';
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
      } catch (dbErr) {}

      if (allowGuest !== 'enable') {
        return NextResponse.json({ error: '訪客存取未開放' }, { status: 403 });
      }

      if (Array.isArray(visibleUsers) && visibleUsers.length > 0 && !visibleUsers.includes(tUser)) {
        return NextResponse.json({ error: '無權限檢視此使用者數據' }, { status: 403 });
      }
    } else {
      // 查詢發出請求的使用者
      const reqRes = await db.execute({
        sql: 'SELECT * FROM users WHERE username = ?',
        args: [rUser]
      });
      if (reqRes.rows.length === 0) {
        return NextResponse.json({ error: '無效的請求者' }, { status: 404 });
      }
      requesterRole = reqRes.rows[0].role || 'users';
      requesterSettings = reqRes.rows[0];
    }

    // 查詢要檢視的目標使用者
    const targetRes = await db.execute({
      sql: 'SELECT * FROM users WHERE username = ?',
      args: [tUser]
    });
    if (targetRes.rows.length === 0) {
      return NextResponse.json({ error: '找不到目標使用者' }, { status: 404 });
    }
    const targetInfo = targetRes.rows[0];

    // 決定使用誰的高低標設定
    let activeSettings = targetInfo;
    if (requesterRole === 'admins' && requesterSettings) {
      activeSettings = requesterSettings;
    }

    // 撈取血壓資料
    const dataRes = await db.execute({
      sql: 'SELECT measure_time as date, sys, dia, hr as pul FROM health_data WHERE user_id = ? ORDER BY measure_time DESC',
      args: [targetInfo.id]
    });

    return NextResponse.json({
      data: dataRes.rows,
      settings: {
        sys_high: activeSettings.sys_high,
        sys_low: activeSettings.sys_low,
        dia_high: activeSettings.dia_high,
        dia_low: activeSettings.dia_low,
        hr_high: activeSettings.hr_high,
        hr_low: activeSettings.hr_low
      },
      viewingUser: tUser,
      settingsOwner: requesterRole === 'admins' ? rUser : tUser
    });

  } catch (error) {
    console.error('Health GET Error:', error);
    return NextResponse.json({ error: '伺服器發生錯誤' }, { status: 500 });
  }
}
