export type AgentTabId =
  | 'negotiator'
  | 'engineer'
  | 'pinpoint'
  | 'sandbox'
  | 'chat';

export type NegotiatorPersona =
  | 'consultant'
  | 'contract'
  | 'foreman'
  | 'neighbor';

export interface NegotiatorScenario {
  id: string;
  label: string;
  rawInput: string;
  contextHint: string;
}

export interface NegotiatorOutputs {
  consultant: string;
  contract: string;
  foreman: string;
  neighbor: string;
}

export interface ErgonomicRule {
  id: string;
  space: string;
  title: string;
  unit: 'cm';
  minLimit: number;
  comfortMin: number;
  standard: number;
  maxRange: number;
  tragedyWarning: string;
  cautionNote: string;
  comfortNote: string;
}

export type InspectionStage = 'plumbing' | 'waterproof' | 'carpentry';

export interface InspectionItem {
  id: string;
  stage: InspectionStage;
  title: string;
  photoHint: string;
  critical: boolean;
}

/**
 * 碩士論文：〈住宅浴室地坪泥作之現場決策知識與 BIM 承載可行性〉
 * 浴室地坪決策事件資料結構（範例結構，待填入正式論文資料）
 */
export interface BathroomFloorDecisionEvent {
  id: string;
  phase: string;
  scenario: string;
  criteria: string;
  action: string;
  bimParameter: string;
  isPlaceholder: boolean;
}

export type TradeCategory =
  | '木作'
  | '水電'
  | '泥作'
  | '油漆'
  | '系統櫃'
  | '空調';

export interface FloorZone {
  id: string;
  name: string;
  code: string;
  gridRow: number;
  gridCol: number;
}

export interface PinMarker {
  id: string;
  number: number;
  zoneId: string;
  zoneName: string;
  xPercent: number;
  yPercent: number;
  trade: TradeCategory;
  issueTag: string;
  note: string;
  deadline: string;
}

/**
 * SQLite 落地的歷史派工單紀錄
 */
export interface DispatchHistoryRecord {
  id: number;
  projectName: string;
  photoUri: string | null;
  pinCount: number;
  pinsJson: string;
  reportText: string;
  createdAt: string;
}

/**
 * SQLite 落地的看圖指派當前工作區狀態
 */
export interface ActivePinpointWorkspace {
  projectName: string;
  photoUri: string | null;
  pins: PinMarker[];
}

export interface LobsterBridgeConfig {
  mode: 'local_engine' | 'remote_api';
  endpointUrl: string;
  apiKey: string;
  modelId: string;
  availableModels: string[];
  deviceTag: string;
}

/**
 * 手機本機 SQLite 儲存的連線與模型設定紀錄（可多組切換）
 */
export interface SavedConnectionProfile {
  id: number;
  profileName: string;
  endpointUrl: string;
  apiKey: string;
  modelId: string;
  updatedAt: string;
}

/**
 * 任務 5：多會話對話介面 (Chat UI) 型別
 */
export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessageItem {
  id: number;
  conversationId: number;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface ChatConversationSummary {
  id: number;
  title: string;
  lastMessage: string;
  updatedAt: string;
}

export interface ChatSearchResultItem {
  messageId: number;
  conversationId: number;
  conversationTitle: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

/**
 * 客戶沙盒初談診斷 SQLite 存檔紀錄
 */
export interface ClientSandboxRecord {
  id: string;
  clientName: string;
  moodName: string;
  selectedTags: string[];
  hardDecorRatio: number;
  diagnosisText: string;
  createdAt: string;
}
