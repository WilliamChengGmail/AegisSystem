import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// 取得全站組態設定
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    const result = await db.execute('SELECT key, value, description FROM site_configs');

    const configs = {};
    result.rows.forEach(row => {
      let val = row.value;
      // 若為 JSON 格式 (例如 JSON 陣列) 則解析
      if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
        try {
          val = JSON.parse(val);
        } catch (e) {}
      }
      configs[row.key] = val;
    });

    return NextResponse.json({ success: true, configs });
  } catch (error) {
    console.error('GET /api/configs Error:', error);
    return NextResponse.json({ error: '無法讀取組態設定' }, { status: 500 });
  }
}

// 更新全站組態設定
export async function POST(request) {
  try {
    const { key, value, description } = await request.json();

    if (!key || value === undefined) {
      return NextResponse.json({ error: '請提供 key 與 value' }, { status: 400 });
    }

    const db = getDb();
    const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

    await db.execute({
      sql: `
        INSERT INTO site_configs (key, value, description, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          description = COALESCE(excluded.description, site_configs.description),
          updated_at = CURRENT_TIMESTAMP
      `,
      args: [key, strValue, description || null]
    });

    return NextResponse.json({ success: true, message: '組態更新成功' });
  } catch (error) {
    console.error('POST /api/configs Error:', error);
    return NextResponse.json({ error: '無法更新組態設定' }, { status: 500 });
  }
}
