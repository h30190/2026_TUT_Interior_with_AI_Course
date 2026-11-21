import {
  BATHROOM_FLOOR_DECISION_EVENTS,
  ERGONOMIC_RULES,
  INSPECTION_ITEMS,
} from '../../data/presets';
import {
  BathroomFloorDecisionEvent,
  ErgonomicRule,
  InspectionItem,
  InspectionStage,
} from '../../types/agent';
import { generateUniqueId, readKvJson, writeKvJson } from './sqliteClient';

const KEY_ERGO_RULES = 'engineer_ergo_rules_v1';
const KEY_ERGO_VALUES = 'engineer_ergo_values_v1';
const KEY_INSPECT_ITEMS = 'engineer_inspect_items_v1';
const KEY_INSPECT_CHECKS = 'engineer_inspect_checks_v1';
const KEY_THESIS_EVENTS = 'engineer_thesis_events_v1';

const DEFAULT_ERGO_VALUES: Record<string, number> = {
  island_aisle: 105,
  wardrobe_bed: 85,
  shower_zone: 95,
  tv_distance: 320,
};

export function loadErgonomicRulesFromSQLite(): ErgonomicRule[] {
  return readKvJson<ErgonomicRule[]>(KEY_ERGO_RULES, ERGONOMIC_RULES);
}

export function addErgonomicRuleToSQLite(
  space: string,
  title: string,
  minLimit: number,
  comfortMin: number,
  standard: number
): ErgonomicRule[] {
  const current = loadErgonomicRulesFromSQLite();
  const newRule: ErgonomicRule = {
    id: generateUniqueId('ergo'),
    space: space.trim() || '自訂空間',
    title: title.trim() || '自訂動線或櫃體淨寬',
    unit: 'cm',
    minLimit,
    comfortMin,
    standard,
    maxRange: Math.max(standard + 60, 150),
    tragedyWarning: `🔴 悲劇預警（低於 ${minLimit + 10}cm）：低於此空間底線將造成門片開啟碰撞或動線卡死！`,
    cautionNote: `🟡 勉強可用（${minLimit + 10}~${comfortMin - 1}cm）：單人使用尚可，建議微調家具深度爭取餘裕。`,
    comfortNote: `🟢 氣韻舒適標準（${comfortMin}cm 以上）：符合人體工學舒適動線。`,
  };
  const next = [...current, newRule];
  writeKvJson(KEY_ERGO_RULES, next);
  return next;
}

export function loadErgonomicValuesFromSQLite(): Record<string, number> {
  return readKvJson<Record<string, number>>(
    KEY_ERGO_VALUES,
    DEFAULT_ERGO_VALUES
  );
}

export function saveErgonomicValuesToSQLite(
  values: Record<string, number>
): void {
  writeKvJson(KEY_ERGO_VALUES, values);
}

export function loadInspectionItemsFromSQLite(): InspectionItem[] {
  return readKvJson<InspectionItem[]>(KEY_INSPECT_ITEMS, INSPECTION_ITEMS);
}

export function addInspectionItemToSQLite(
  stage: InspectionStage,
  title: string,
  photoHint: string
): InspectionItem[] {
  const current = loadInspectionItemsFromSQLite();
  const newItem: InspectionItem = {
    id: generateUniqueId('insp'),
    stage,
    title: title.trim(),
    photoHint: photoHint.trim() || '請拉捲尺入鏡拍下現場細節存檔',
    critical: true,
  };
  const next = [...current, newItem];
  writeKvJson(KEY_INSPECT_ITEMS, next);
  return next;
}

export function removeInspectionItemFromSQLite(id: string): InspectionItem[] {
  const next = loadInspectionItemsFromSQLite().filter((item) => item.id !== id);
  writeKvJson(KEY_INSPECT_ITEMS, next);
  return next;
}

export function loadInspectionChecksFromSQLite(): Record<string, boolean> {
  return readKvJson<Record<string, boolean>>(KEY_INSPECT_CHECKS, { c1: true });
}

export function saveInspectionChecksToSQLite(
  checks: Record<string, boolean>
): void {
  writeKvJson(KEY_INSPECT_CHECKS, checks);
}

export function loadThesisEventsFromSQLite(): BathroomFloorDecisionEvent[] {
  return readKvJson<BathroomFloorDecisionEvent[]>(
    KEY_THESIS_EVENTS,
    BATHROOM_FLOOR_DECISION_EVENTS
  );
}

export function upsertThesisEventInSQLite(
  eventInput: Omit<BathroomFloorDecisionEvent, 'id'> & { id?: string }
): BathroomFloorDecisionEvent[] {
  const current = loadThesisEventsFromSQLite();
  if (eventInput.id) {
    const next = current.map((ev) =>
      ev.id === eventInput.id
        ? { ...eventInput, id: eventInput.id, isPlaceholder: false }
        : ev
    );
    writeKvJson(KEY_THESIS_EVENTS, next);
    return next;
  }
  const newEv: BathroomFloorDecisionEvent = {
    id: generateUniqueId('thesis'),
    phase: eventInput.phase.trim() || '浴室地坪決策階段',
    scenario: eventInput.scenario.trim(),
    criteria: eventInput.criteria.trim(),
    action: eventInput.action.trim(),
    bimParameter: eventInput.bimParameter.trim() || 'IfcSlab / Pset_BathroomFloor',
    isPlaceholder: false,
  };
  const next = [newEv, ...current];
  writeKvJson(KEY_THESIS_EVENTS, next);
  return next;
}

export function removeThesisEventFromSQLite(
  id: string
): BathroomFloorDecisionEvent[] {
  const next = loadThesisEventsFromSQLite().filter((ev) => ev.id !== id);
  writeKvJson(KEY_THESIS_EVENTS, next);
  return next;
}
