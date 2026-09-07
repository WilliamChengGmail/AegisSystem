import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT key, value, description, updated_at FROM site_configs',
      args: []
    });

    const configs = {};
    result.rows.forEach(r => {
      configs[r.key] = r.value;
    });

    return NextResponse.json({
      success: true,
      configs
    });
  } catch (error) {
    console.error('Fetch Configs Error:', error);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
    }

    const { key, value, operatorId } = body;

    if (!key || !value || !operatorId) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 });
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

    // 寫入/更新 Config
    await db.execute({
      sql: `INSERT INTO site_configs (key, value) 
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      args: [key, value]
    });

    return NextResponse.json({
      success: true,
      message: '組態更新成功'
    });

  } catch (error) {
    console.error('Update Config Error:', error);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
