import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const operator = searchParams.get('operator');
  const targetUser = searchParams.get('targetUser');

  if (!operator || !targetUser) {
    return NextResponse.json({ error: '缺少必要參數' }, { status: 400 });
  }

  if (operator === 'guest') {
    return NextResponse.json({ error: '訪客無權限匯出資料' }, { status: 403 });
  }

  try {
    const db = getDb();

    // 1. 驗證 operator 身分
    const operatorRes = await db.execute({
      sql: 'SELECT * FROM users WHERE username = ?',
      args: [operator]
    });
    if (operatorRes.rows.length === 0) {
      return NextResponse.json({ error: '無效的操作者帳號' }, { status: 401 });
    }
    const operatorInfo = operatorRes.rows[0];

    // 檢查權限 (非 admin 只能匯出自己的)
    if (operatorInfo.role !== 'admins' && operator !== targetUser) {
      return NextResponse.json({ error: '權限不足，只能匯出自己的資料' }, { status: 403 });
    }

    // 2. 取得目標對象 id
    const targetRes = await db.execute({
      sql: 'SELECT id FROM users WHERE username = ?',
      args: [targetUser]
    });
    if (targetRes.rows.length === 0) {
      return NextResponse.json({ error: '找不到目標使用者' }, { status: 404 });
    }
    const targetId = targetRes.rows[0].id;

    // 3. 撈取該對象所有歷史資料
    const dataRes = await db.execute({
      sql: 'SELECT measure_time, sys, dia, hr FROM health_data WHERE user_id = ? ORDER BY measure_time DESC',
      args: [targetId]
    });

    const records = dataRes.rows;

    // 4. 寫入匯出歷史紀錄
    await db.execute({
      sql: `INSERT INTO import_history (
              target_user_id, operator_user_id, file_name, 
              total_records, duplicate_records, imported_records, action_type
            ) VALUES (?, ?, ?, ?, ?, ?, 'export')`,
      args: [
        targetId, 
        operatorInfo.id, 
        `export_${targetUser}_${new Date().getTime()}.csv`, 
        records.length, 
        0, 
        0
      ]
    });

    // 5. 轉換為 CSV 格式
    const headers = ['日期時間', '收縮壓', '舒張壓', '心率'];
    const csvRows = [headers.join(',')];
    for (const row of records) {
      csvRows.push(`${row.measure_time},${row.sys || ''},${row.dia || ''},${row.hr || ''}`);
    }
    const csvString = csvRows.join('\n');

    // BOM 以防 Excel 開啟亂碼
    const bom = '\uFEFF';
    const finalCsv = bom + csvString;

    // 6. 回傳檔案
    return new NextResponse(finalCsv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="health_data_${targetUser}.csv"`,
      },
    });

  } catch (error) {
    console.error('Export API error:', error);
    return NextResponse.json({ error: '匯出失敗，伺服器錯誤' }, { status: 500 });
  }
}
