import {
  NEGOTIATOR_SCENARIOS,
  QUICK_ISSUE_TAGS,
} from '../../data/presets';
import {
  ClientSandboxRecord,
  NegotiatorScenario,
  TradeCategory,
} from '../../types/agent';
import {
  formatNowTimestamp,
  generateUniqueId,
  readKvJson,
  writeKvJson,
} from './sqliteClient';

const KEY_NEG_SCENARIOS = 'negotiator_scenarios_v1';
const KEY_ISSUE_TAGS = 'pinpoint_issue_tags_v1';
const KEY_SANDBOX_TAGS = 'sandbox_lifestyle_tags_v1';
const KEY_SANDBOX_RECORDS = 'sandbox_client_records_v1';

const DEFAULT_LIFESTYLE_TAGS = [
  '🐾 有養貓／狗毛孩',
  '🍳 常下廚需中島輕食',
  '🧹 依賴掃地機器人',
  '📦 需要海量隱藏收納',
  '💻 居家遠距辦公書房',
  '🍷 喜歡招待朋友小酌',
  '🧘 偏好留白與自然光',
  '👴 需兼顧長輩無障礙',
];

export function loadNegotiatorScenariosFromSQLite(): NegotiatorScenario[] {
  return readKvJson<NegotiatorScenario[]>(
    KEY_NEG_SCENARIOS,
    NEGOTIATOR_SCENARIOS
  );
}

export function addNegotiatorScenarioToSQLite(
  label: string,
  rawInput: string
): NegotiatorScenario[] {
  const current = loadNegotiatorScenariosFromSQLite();
  const newItem: NegotiatorScenario = {
    id: generateUniqueId('scen'),
    label: label.trim() || rawInput.trim().slice(0, 14),
    rawInput: rawInput.trim(),
    contextHint: '自訂現場溝通情境',
  };
  const next = [newItem, ...current];
  writeKvJson(KEY_NEG_SCENARIOS, next);
  return next;
}

export function removeNegotiatorScenarioFromSQLite(
  id: string
): NegotiatorScenario[] {
  const next = loadNegotiatorScenariosFromSQLite().filter((s) => s.id !== id);
  writeKvJson(KEY_NEG_SCENARIOS, next);
  return next;
}

export function loadIssueTagsMapFromSQLite(): Record<TradeCategory, string[]> {
  return readKvJson<Record<TradeCategory, string[]>>(
    KEY_ISSUE_TAGS,
    QUICK_ISSUE_TAGS
  );
}

export function addIssueTagToSQLite(
  trade: TradeCategory,
  newTag: string
): Record<TradeCategory, string[]> {
  const current = loadIssueTagsMapFromSQLite();
  const trimmed = newTag.trim();
  if (!trimmed) {
    return current;
  }
  const existing = current[trade] ?? [];
  const nextMap: Record<TradeCategory, string[]> = {
    ...current,
    [trade]: Array.from(new Set([...existing, trimmed])),
  };
  writeKvJson(KEY_ISSUE_TAGS, nextMap);
  return nextMap;
}

export function loadLifestyleTagsFromSQLite(): string[] {
  return readKvJson<string[]>(KEY_SANDBOX_TAGS, DEFAULT_LIFESTYLE_TAGS);
}

export function addLifestyleTagToSQLite(newTag: string): string[] {
  const current = loadLifestyleTagsFromSQLite();
  const trimmed = newTag.trim();
  if (!trimmed) {
    return current;
  }
  const next = Array.from(new Set([...current, trimmed]));
  writeKvJson(KEY_SANDBOX_TAGS, next);
  return next;
}

export function loadSandboxHistoryFromSQLite(): ClientSandboxRecord[] {
  return readKvJson<ClientSandboxRecord[]>(KEY_SANDBOX_RECORDS, []);
}

export function insertSandboxRecordToSQLite(
  clientName: string,
  moodName: string,
  selectedTags: string[],
  hardDecorRatio: number,
  diagnosisText: string
): ClientSandboxRecord[] {
  const current = loadSandboxHistoryFromSQLite();
  const newRec: ClientSandboxRecord = {
    id: generateUniqueId('sbx'),
    clientName: clientName.trim() || '未命名屋主初談',
    moodName,
    selectedTags,
    hardDecorRatio,
    diagnosisText,
    createdAt: formatNowTimestamp(),
  };
  const next = [newRec, ...current];
  writeKvJson(KEY_SANDBOX_RECORDS, next);
  return next;
}

export function removeSandboxRecordFromSQLite(
  id: string
): ClientSandboxRecord[] {
  const next = loadSandboxHistoryFromSQLite().filter((r) => r.id !== id);
  writeKvJson(KEY_SANDBOX_RECORDS, next);
  return next;
}
