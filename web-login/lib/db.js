import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

let clientInstance = null;

export function getDb() {
  if (!url || !authToken) {
    throw new Error('請在環境變數中設定 TURSO_DATABASE_URL 與 TURSO_AUTH_TOKEN');
  }

  if (!clientInstance) {
    clientInstance = createClient({
      url,
      authToken,
    });
  }
  
  return clientInstance;
}
