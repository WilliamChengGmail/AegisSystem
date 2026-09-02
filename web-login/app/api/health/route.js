import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  const range = searchParams.get('range') || '3'; // 預設 3 天

  if (!username) {
    return NextResponse.json({ error: '請提供帳號' }, { status: 400 });
  }

  try {
    const db = getDb();

    // 取得使用者設定
    const userRes = await db.execute({
      sql: 'SELECT id, sys_high, sys_low, dia_high, dia_low, hr_high, hr_low FROM users WHERE username = ?',
      args: [username]
    });

    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: '找不到使用者' }, { status: 404 });
    }
    const user = userRes.rows[0];

    // 找出最新一筆資料日期
    const latestRes = await db.execute(
      "SELECT date FROM bp ORDER BY date DESC LIMIT 1"
    );

    if (latestRes.rows.length === 0) {
      return NextResponse.json({ data: [], settings: user, latestDate: null });
    }

    const latestDateStr = latestRes.rows[0].date;

    // 根據區間過濾
    let dataRes;
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    if (range === 'custom' && start && end) {
      // 自訂時間起訖 (補上時間以便涵蓋全天)
      const startTime = `${start} 00:00:00`;
      const endTime = `${end} 23:59:59`;
      dataRes = await db.execute({
        sql: `SELECT date, sys, dia, pul FROM bp 
              WHERE date >= ? AND date <= ? 
              ORDER BY date DESC`,
        args: [startTime, endTime]
      });
    } else if (range === 'all') {
      dataRes = await db.execute(
        "SELECT date, sys, dia, pul FROM bp ORDER BY date DESC"
      );
    } else {
      const days = parseInt(range) || 3;
      // 找出有資料的最新 N 天
      const distinctDatesRes = await db.execute({
        sql: `SELECT DISTINCT date(date) as d FROM bp ORDER BY d DESC LIMIT ${days}`
      });

      if (distinctDatesRes.rows.length === 0) {
        dataRes = { rows: [] };
      } else {
        const earliestDate = distinctDatesRes.rows[distinctDatesRes.rows.length - 1].d;
        dataRes = await db.execute({
          sql: `SELECT date, sys, dia, pul FROM bp 
                WHERE date(date) >= ? 
                ORDER BY date DESC`,
          args: [earliestDate]
        });
      }
    }

    return NextResponse.json({
      data: dataRes.rows,
      settings: user,
      latestDate: latestDateStr,
    });

  } catch (error) {
    console.error('Health GET Error:', error);
    return NextResponse.json({ error: '伺服器發生錯誤: ' + error.message }, { status: 500 });
  }
}
