import {
  ActivePinpointWorkspace,
  DispatchHistoryRecord,
  PinMarker,
} from '../../types/agent';
import { formatNowTimestamp, getDb } from './sqliteClient';

const DEFAULT_INITIAL_PINS: PinMarker[] = [
  {
    id: 'pin-init-1',
    number: 1,
    zoneId: 'photo-pin',
    zoneName: '照片標註點 #1',
    xPercent: 35,
    yPercent: 42,
    trade: '泥作',
    issueTag: '洩水坡度不足',
    note: '淋浴區落水頭周邊坡度需重新抓順，避免積水',
    deadline: '3 日內完成',
  },
];

let fallbackWorkspace: ActivePinpointWorkspace = {
  projectName: '台南東區・氣韻林公館',
  photoUri: null,
  pins: DEFAULT_INITIAL_PINS,
};
let fallbackHistory: DispatchHistoryRecord[] = [];

export function loadActivePinpointWorkspace(): ActivePinpointWorkspace {
  const db = getDb();
  if (!db) {
    return fallbackWorkspace;
  }
  try {
    const row = db.getFirstSync<{
      project_name: string;
      photo_uri: string | null;
      pins_json: string;
    }>(
      'SELECT project_name, photo_uri, pins_json FROM active_workspace WHERE id = 1'
    );

    if (!row) {
      saveActivePinpointWorkspace(fallbackWorkspace);
      return fallbackWorkspace;
    }

    const parsedPins = JSON.parse(row.pins_json) as PinMarker[];
    return {
      projectName: row.project_name,
      photoUri: row.photo_uri,
      pins: Array.isArray(parsedPins) ? parsedPins : DEFAULT_INITIAL_PINS,
    };
  } catch {
    return fallbackWorkspace;
  }
}

export function saveActivePinpointWorkspace(
  workspace: ActivePinpointWorkspace
): void {
  fallbackWorkspace = workspace;
  const db = getDb();
  if (!db) {
    return;
  }
  try {
    db.runSync(
      `INSERT OR REPLACE INTO active_workspace (id, project_name, photo_uri, pins_json)
       VALUES (1, ?, ?, ?)`,
      [
        workspace.projectName,
        workspace.photoUri,
        JSON.stringify(workspace.pins),
      ]
    );
  } catch {
    // fallback saved in memory
  }
}

export function loadDispatchHistoryList(): DispatchHistoryRecord[] {
  const db = getDb();
  if (!db) {
    return fallbackHistory;
  }
  try {
    const rows = db.getAllSync<{
      id: number;
      project_name: string;
      photo_uri: string | null;
      pin_count: number;
      pins_json: string;
      report_text: string;
      created_at: string;
    }>(
      'SELECT id, project_name, photo_uri, pin_count, pins_json, report_text, created_at FROM dispatch_history ORDER BY id DESC'
    );

    return rows.map((r) => ({
      id: r.id,
      projectName: r.project_name,
      photoUri: r.photo_uri,
      pinCount: r.pin_count,
      pinsJson: r.pins_json,
      reportText: r.report_text,
      createdAt: r.created_at,
    }));
  } catch {
    return fallbackHistory;
  }
}

export function insertDispatchHistoryRecord(
  projectName: string,
  photoUri: string | null,
  pins: PinMarker[],
  reportText: string
): DispatchHistoryRecord[] {
  const createdAt = formatNowTimestamp();
  const pinsJson = JSON.stringify(pins);

  const db = getDb();
  if (db) {
    try {
      db.runSync(
        `INSERT INTO dispatch_history (project_name, photo_uri, pin_count, pins_json, report_text, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [projectName, photoUri, pins.length, pinsJson, reportText, createdAt]
      );
      return loadDispatchHistoryList();
    } catch {
      // fallback below
    }
  }

  const nextId = fallbackHistory.length > 0 ? fallbackHistory[0].id + 1 : 1;
  const record: DispatchHistoryRecord = {
    id: nextId,
    projectName,
    photoUri,
    pinCount: pins.length,
    pinsJson,
    reportText,
    createdAt,
  };
  fallbackHistory = [record, ...fallbackHistory];
  return fallbackHistory;
}

export function removeDispatchHistoryRecord(
  id: number
): DispatchHistoryRecord[] {
  const db = getDb();
  if (db) {
    try {
      db.runSync('DELETE FROM dispatch_history WHERE id = ?', [id]);
      return loadDispatchHistoryList();
    } catch {
      // fallback below
    }
  }
  fallbackHistory = fallbackHistory.filter((item) => item.id !== id);
  return fallbackHistory;
}
