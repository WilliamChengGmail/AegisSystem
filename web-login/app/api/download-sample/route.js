import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'csv';

  if (format === 'csv') {
    const csvContent = "\uFEFF日期,時間,收縮壓,舒張壓,心率\n2024-01-01,08:30:00,120,80,72\n2024-01-01,12:15:00,125,82,75\n2024-01-01,19:45:00,118,78,70\n";
    
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="health_data_sample.csv"',
      },
    });
  }

  if (format === 'json') {
    const jsonContent = JSON.stringify([
      { date: '2024-01-01', time: '08:30:00', sys: 120, dia: 80, pul: 72 },
      { date: '2024-01-01', time: '12:15:00', sys: 125, dia: 82, pul: 75 },
      { date: '2024-01-01', time: '19:45:00', sys: 118, dia: 78, pul: 70 }
    ], null, 2);

    return new NextResponse(jsonContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="health_data_sample.json"',
      },
    });
  }

  return NextResponse.json({ error: '不支援的格式' }, { status: 400 });
}
