import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(request) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ error: '請提供有效的 JSON 請求內容' }, { status: 400 });
    }

    const { username, password, isGuest } = body;
    const db = getDb();

    // 處理訪客免密碼登入
    if (isGuest === true || isGuest === 'true') {
      let allowGuest = 'enable';
      let visibleUsers = ['cvn'];

      try {
        const configRes = await db.execute({
          sql: "SELECT key, value FROM site_configs WHERE key IN ('allow_guest_login', 'guest_visible_users')"
        });

        configRes.rows.forEach(r => {
          if (r.key === 'allow_guest_login') allowGuest = r.value;
          if (r.key === 'guest_visible_users') {
            try {
              visibleUsers = JSON.parse(r.value);
            } catch (e) {}
          }
        });
      } catch (dbErr) {
        console.warn('site_configs read warning, using default guest settings:', dbErr.message);
      }

      if (allowGuest !== 'enable') {
        return NextResponse.json({ error: '目前系統未開放訪客試用登入' }, { status: 403 });
      }

      return NextResponse.json({
        success: true,
        isGuest: true,
        message: '以訪客身份登入成功',
        username: 'guest',
        role: 'guests',
        targetUser: Array.isArray(visibleUsers) && visibleUsers.length > 0 ? visibleUsers[0] : 'cvn',
        visibleUsers: Array.isArray(visibleUsers) ? visibleUsers : ['cvn']
      });
    }

    if (!username || !password) {
      return NextResponse.json({ error: '請提供帳號與密碼' }, { status: 400 });
    }

    // 查詢使用者
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE username = ?',
      args: [username]
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: '無效的帳號或密碼' }, { status: 401 });
    }

    const user = result.rows[0];

    // 狀態攔截
    if (user.status === 'pending') {
      return NextResponse.json({ error: '帳號審核中，無法登入' }, { status: 403 });
    }
    if (user.status === 'suspended') {
      return NextResponse.json({ error: '帳號已被停權，請聯絡管理員' }, { status: 403 });
    }

    // 比對密碼
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return NextResponse.json({ error: '無效的帳號或密碼' }, { status: 401 });
    }

    // 若需要換密碼，只發放換密碼用的通行證
    if (user.require_pwd_change === 1) {
      return NextResponse.json({ 
        success: true, 
        message: '首次登入或密碼已被重設，請先修改密碼',
        require_pwd_change: true,
        id: user.id,
        username: user.username // 前端需要帶入
      });
    }

    return NextResponse.json({ 
      success: true, 
      message: '登入成功',
      id: user.id,
      role: user.role || 'users',
      display_name: user.display_name,
      pid: user.pid
    });

  } catch (error) {
    console.error('Login Error:', error);
    return NextResponse.json({ error: '伺服器錯誤: ' + (error.message || '未知錯誤') }, { status: 500 });
  }
}
