const db = require('better-sqlite3')('t:\\AegisSystem\\HealthData_Cache\\血壓日記備份_2026-08-31.bp');
console.log(db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table'").all());
