import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: '請提供帳號與密碼' }, { status: 400 });
    }

    const db = getDb();
    
    // 查詢使用者
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE username = ?',
      args: [username]
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: '無效的帳號或密碼' }, { status: 401 });
    }

    const user = result.rows[0];
    
    // 比對密碼 (假設已啟用雜湊)
    const isMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!isMatch) {
      return NextResponse.json({ error: '無效的帳號或密碼' }, { status: 401 });
    }

    return NextResponse.json({ success: true, message: '登入成功' });

  } catch (error) {
    console.error('Login Error:', error);
    return NextResponse.json({ error: '伺服器內部錯誤' }, { status: 500 });
  }
}
