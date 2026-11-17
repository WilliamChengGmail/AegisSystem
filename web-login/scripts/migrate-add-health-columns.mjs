/**
 * 資料庫 Migration 與歷史資料補齊腳本
 * 目的:
 * 1. 於 health_data 表新增 location, posture, feel, weight, mark 欄位
 * 2. 從歷史 bp 表與本機備份檔中補齊既有資料的量測位置與姿勢等欄位
 * 製作者: Office of William
 */

import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

const LOCATION_MAP = {
  '1': '左臂',
  '2': '右臂',
  '3': '左手腕',
  '4': '右手腕',
  '左臂': '左臂',
  '右臂': '右臂'
};

const POSTURE_MAP = {
  '1': '坐著',
  '2': '躺著',
  '3': '站著',
  '坐著': '坐著',
  '躺著': '躺著',
  '站著': '站著'
};

async function main() {
  console.log('=== [1/3] 檢查並擴充 health_data 資料表結構 ===');
  const info = await turso.execute('PRAGMA table_info(health_data);');
  const existingCols = new Set(info.rows.map(r => r.name));

  const columnsToAdd = [
    { name: 'location', type: 'TEXT' },
    { name: 'posture',  type: 'TEXT' },
    { name: 'feel',     type: 'TEXT' },
    { name: 'weight',   type: 'REAL' },
    { name: 'mark',     type: 'TEXT' }
  ];

  for (const col of columnsToAdd) {
    if (!existingCols.has(col.name)) {
      console.log(`+ 新增欄位: ${col.name} (${col.type})`);
      await turso.execute(`ALTER TABLE health_data ADD COLUMN ${col.name} ${col.type};`);
    } else {
      console.log(`- 欄位已存在: ${col.name}`);
    }
  }

  console.log('\n=== [2/3] 讀取歷史備份並整合資料對照字典 ===');
  // 建立 date -> { location, posture, feel, weight, mark } 查表
  const metaMap = new Map();

  // (A) 從 Turso 既有 bp 表讀取
  try {
    const bpRes = await turso.execute('SELECT date, location, posture, feel, weight, mark FROM bp');
    console.log(`從 Turso 雲端 bp 表讀取到 ${bpRes.rows.length} 筆備份資料`);
    bpRes.rows.forEach(r => {
      if (r.date) {
        metaMap.set(r.date, {
          location: LOCATION_MAP[String(r.location).trim()] || (r.location ? String(r.location) : '左臂'),
          posture: POSTURE_MAP[String(r.posture).trim()] || (r.posture ? String(r.posture) : '坐著'),
          feel: r.feel || null,
          weight: r.weight && Number(r.weight) > 0 ? Number(r.weight) : null,
          mark: r.mark || null
        });
      }
    });
  } catch (e) {
    console.log('Turso bp 表讀取略過或無資料:', e.message);
  }

  // (B) 從本機備份檔讀取補齊
  const localBpPath = 'D:/AegisSystem/HealthData_Cache/血壓日記備份_2026-08-31.bp';
  if (fs.existsSync(localBpPath)) {
    try {
      const localDb = new Database(localBpPath, { fileMustExist: true });
      const localRows = localDb.prepare('SELECT date, location, posture, feel, weight, mark FROM bp').all();
      console.log(`從本機備份檔 [${localBpPath}] 讀取到 ${localRows.length} 筆資料`);
      localRows.forEach(r => {
        if (r.date && !metaMap.has(r.date)) {
          metaMap.set(r.date, {
            location: LOCATION_MAP[String(r.location).trim()] || (r.location ? String(r.location) : '左臂'),
            posture: POSTURE_MAP[String(r.posture).trim()] || (r.posture ? String(r.posture) : '坐著'),
            feel: r.feel || null,
            weight: r.weight && Number(r.weight) > 0 ? Number(r.weight) : null,
            mark: r.mark || null
          });
        }
      });
      localDb.close();
    } catch (e) {
      console.error('本機 bp 檔讀取失敗:', e.message);
    }
  }

  console.log(`共收集到 ${metaMap.size} 個時間點的量測中繼對照資料`);

  console.log('\n=== [3/3] 批次更新 health_data 中的歷史資料 ===');
  // 查詢目前 health_data 中尚未補齊 location 或 posture 的記錄
  const targetRecords = await turso.execute(
    "SELECT id, measure_time FROM health_data WHERE location IS NULL OR location = ''"
  );
  console.log(`目前 health_data 中待補齊資料筆數: ${targetRecords.rows.length}`);

  let updatedCount = 0;
  const BATCH_SIZE = 100;
  const statements = [];

  for (const row of targetRecords.rows) {
    const timeStr = row.measure_time;
    // 若中繼表有對照，使用對照值；若無，預設賦予標準醫學常規值 (左臂 / 坐著)
    const meta = metaMap.get(timeStr) || {
      location: '左臂',
      posture: '坐著',
      feel: null,
      weight: null,
      mark: null
    };

    statements.push({
      sql: `UPDATE health_data 
            SET location = ?, posture = ?, feel = ?, weight = ?, mark = ? 
            WHERE id = ?`,
      args: [meta.location, meta.posture, meta.feel, meta.weight, meta.mark, row.id]
    });
  }

  // 批次執行更新
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const chunk = statements.slice(i, i + BATCH_SIZE);
    await turso.batch(chunk, 'write');
    updatedCount += chunk.length;
    process.stdout.write(`\r已補齊進度: ${updatedCount} / ${statements.length}`);
  }

  console.log(`\n✅ 補齊完成！共更新 ${updatedCount} 筆記錄。`);

  // 驗證最新樣本
  const sample = await turso.execute('SELECT measure_time, sys, dia, hr, location, posture FROM health_data ORDER BY measure_time DESC LIMIT 3');
  console.log('\n最新 3 筆 health_data 資料驗證:');
  console.log(sample.rows);
}

main().catch(console.error);

