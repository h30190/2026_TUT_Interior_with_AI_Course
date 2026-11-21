import * as SQLite from 'expo-sqlite';

const DB_NAME = 'qiyun_pocket_v1.db';
let dbInstance: SQLite.SQLiteDatabase | null = null;

export function formatNowTimestamp(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/**
 * 取得單例 SQLite 連線並確保所有資料表已建立
 */
export function getDb(): SQLite.SQLiteDatabase | null {
  if (dbInstance) {
    return dbInstance;
  }
  try {
    const db = SQLite.openDatabaseSync(DB_NAME);
    db.execSync(`
      CREATE TABLE IF NOT EXISTS active_workspace (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        project_name TEXT NOT NULL,
        photo_uri TEXT,
        pins_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dispatch_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT NOT NULL,
        photo_uri TEXT,
        pin_count INTEGER NOT NULL,
        pins_json TEXT NOT NULL,
        report_text TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bridge_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        config_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS connection_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_name TEXT NOT NULL,
        endpoint_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        model_id TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        last_message TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    dbInstance = db;
    return db;
  } catch {
    return null;
  }
}
