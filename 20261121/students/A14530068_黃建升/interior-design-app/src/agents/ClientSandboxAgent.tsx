import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  generateAiClientSandboxDiagnosis,
  shareViaIOS,
} from '../services/lobsterBridge';
import {
  addLifestyleTagToSQLite,
  insertSandboxRecordToSQLite,
  loadLifestyleTagsFromSQLite,
  loadSandboxHistoryFromSQLite,
  removeSandboxRecordFromSQLite,
} from '../services/storage';
import { IOS_THEME } from '../theme/iosTheme';
import {
  ClientSandboxRecord,
  LobsterBridgeConfig,
} from '../types/agent';

interface Props {
  bridgeConfig: LobsterBridgeConfig;
}

const STYLE_MOODS = [
  { id: 'warm_wood', name: '溫潤木質氣韻', desc: '橡木實木皮＋藝術塗料＋暖白光' },
  { id: 'wabi_sabi', name: '靜謐侘寂微水泥', desc: '特殊鏝刀塗料＋弧形收邊＋低彩度' },
  { id: 'modern_stone', name: '現代俐落石材感', desc: '薄板磁磚＋鐵件玻璃＋線性燈帶' },
];

export function ClientSandboxAgent({ bridgeConfig }: Props) {
  const [clientName, setClientName] = useState<string>('林公館・初談沙盒');
  const [lifestyleTags, setLifestyleTags] = useState<string[]>(() =>
    loadLifestyleTagsFromSQLite()
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([
    '🐾 有養貓／狗毛孩',
    '🍳 常下廚需中島輕食',
    '🧹 依賴掃地機器人',
  ]);
  const [newTagInput, setNewTagInput] = useState<string>('');
  const [selectedMood, setSelectedMood] = useState<string>('warm_wood');
  const [hardDecorRatio, setHardDecorRatio] = useState<number>(65);

  const [aiDiagnosis, setAiDiagnosis] = useState<string>('');
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [savedRecords, setSavedRecords] = useState<ClientSandboxRecord[]>(() =>
    loadSandboxHistoryFromSQLite()
  );

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
    setAiDiagnosis('');
  };

  const handleAddCustomTag = () => {
    const trimmed = newTagInput.trim();
    if (!trimmed) {
      return;
    }
    const nextTags = addLifestyleTagToSQLite(trimmed);
    setLifestyleTags(nextTags);
    setSelectedTags((prev) => Array.from(new Set([...prev, trimmed])));
    setNewTagInput('');
  };

  const currentMood =
    STYLE_MOODS.find((m) => m.id === selectedMood) ?? STYLE_MOODS[0];
  const softDecorRatio = 100 - hardDecorRatio;

  const buildFallbackDiagnosisReport = () => {
    return [
      `🌿【氣韻居所・空間氣質與需求診斷書】`,
      `屋主／案名：${clientName}`,
      `偏好空間調性：${currentMood.name}（${currentMood.desc}）`,
      `理想預算配置：硬裝基礎工程 ${hardDecorRatio}% ／ 軟裝家具家電 ${softDecorRatio}%`,
      `已選生活重心：${selectedTags.join('、') || '尚未勾選'}`,
      `━━━━━━━━━━━━━━`,
      `✨ 空間配置建議（點選上方「請 Strata AI 深度生成」可由 AI 量身撰寫）：`,
      `• 針對所選需求（${selectedTags.slice(0, 3).join('、')}），建議優先於平面放樣階段鎖定水電專用迴路與隱藏式收納動線。`,
      `• 硬裝 ${hardDecorRatio}% 配比建議集中於基礎防水、木作造型天花與高頻率接觸之五金櫃體。`,
    ].join('\n');
  };

  const activeReport = aiDiagnosis || buildFallbackDiagnosisReport();

  const handleGenerateByStrataAi = async () => {
    setIsGeneratingAi(true);
    const reply = await generateAiClientSandboxDiagnosis(
      clientName,
      currentMood.name,
      currentMood.desc,
      selectedTags,
      hardDecorRatio,
      bridgeConfig
    );
    setAiDiagnosis(reply);
    setIsGeneratingAi(false);
  };

  const handleSaveRecord = () => {
    const nextList = insertSandboxRecordToSQLite(
      clientName,
      currentMood.name,
      selectedTags,
      hardDecorRatio,
      activeReport
    );
    setSavedRecords(nextList);
    Alert.alert('已存入 SQLite', '此筆客戶初談沙盒診斷已歸檔保存！');
  };

  const handleDeleteRecord = (id: string) => {
    const nextList = removeSandboxRecordFromSQLite(id);
    setSavedRecords(nextList);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.safeBanner}>
        <Text style={styles.safeBannerText}>
          🔒 零機密客戶展示模式：此頁可放心遞給屋主點選，支援自訂需求標籤、Strata AI 深度生成診斷書與 SQLite 初談紀錄歸檔
        </Text>
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.heroTag}>
          AGENT 04 ・ 客戶初談沙盒 ＆ Strata AI 診斷 ＆ SQLite 歸檔
        </Text>
        <Text style={styles.heroTitle}>🎭 氣韻空間氣質診斷器</Text>
        <Text style={styles.heroDesc}>
          邀請屋主點選或新增日常場景與預算比重，一鍵呼叫 Strata AI 量身撰寫《空間氣質診斷書》並存入初談資料庫。
        </Text>
      </View>

      <View style={styles.clientBar}>
        <Text style={styles.clientLabel}>屋主／案名：</Text>
        <TextInput
          style={styles.clientInput}
          value={clientName}
          onChangeText={setClientName}
          placeholder="輸入客戶稱呼或案名..."
          placeholderTextColor={IOS_THEME.colors.textMuted}
        />
      </View>

      <Text style={styles.sectionTitle}>1. 您偏好的空間氣韻基調</Text>
      <View style={styles.moodList}>
        {STYLE_MOODS.map((m) => {
          const active = selectedMood === m.id;
          return (
            <Pressable
              key={m.id}
              style={[styles.moodCard, active && styles.moodCardActive]}
              onPress={() => {
                setSelectedMood(m.id);
                setAiDiagnosis('');
              }}
            >
              <Text style={[styles.moodName, active && styles.moodNameActive]}>
                {m.name}
              </Text>
              <Text style={styles.moodDesc}>{m.desc}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>
        2. 點選或新增您家的日常場景（可複選・自訂標籤自動存 SQLite）
      </Text>
      <View style={styles.tagWrap}>
        {lifestyleTags.map((tag) => {
          const active = selectedTags.includes(tag);
          return (
            <Pressable
              key={tag}
              style={[styles.tagBtn, active && styles.tagBtnActive]}
              onPress={() => toggleTag(tag)}
            >
              <Text style={[styles.tagText, active && styles.tagTextActive]}>
                {tag}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.addTagRow}>
        <TextInput
          style={styles.addTagInput}
          value={newTagInput}
          onChangeText={setNewTagInput}
          placeholder="新增自訂生活需求（如：🎹 需要放鋼琴／👶 嬰兒車收納）..."
          placeholderTextColor={IOS_THEME.colors.textMuted}
        />
        <Pressable style={styles.addTagBtn} onPress={handleAddCustomTag}>
          <Text style={styles.addTagBtnText}>➕ 新增</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>3. 預算配置天平（點擊調整比重）</Text>
      <View style={styles.balanceCard}>
        <View style={styles.balanceHeader}>
          <Text style={styles.balanceSide}>
            🪵 硬裝與基礎工程 {hardDecorRatio}%
          </Text>
          <Text style={styles.balanceSide}>
            🛋️ 軟裝家具與家電 {softDecorRatio}%
          </Text>
        </View>
        <View style={styles.barTrack}>
          <View
            style={[styles.barFillHard, { width: `${hardDecorRatio}%` }]}
          />
        </View>
        <View style={styles.balanceControlRow}>
          <Pressable
            style={styles.balanceBtn}
            onPress={() => {
              setHardDecorRatio((r) => Math.max(40, r - 5));
              setAiDiagnosis('');
            }}
          >
            <Text style={styles.balanceBtnText}>◀ 強化軟裝家具</Text>
          </Pressable>
          <Pressable
            style={styles.balanceBtn}
            onPress={() => {
              setHardDecorRatio((r) => Math.min(80, r + 5));
              setAiDiagnosis('');
            }}
          >
            <Text style={styles.balanceBtnText}>強化硬裝木作 ▶</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        style={styles.aiGenBtn}
        onPress={() => void handleGenerateByStrataAi()}
      >
        <Text style={styles.aiGenBtnText}>
          {isGeneratingAi
            ? '⏳ Strata AI 正在為屋主量身撰寫空間氣質診斷書...'
            : '🤖 請 Strata AI 根據上方勾選條件深度生成《空間氣質診斷書》'}
        </Text>
      </Pressable>

      <View style={styles.diagnosisCard}>
        <Text style={styles.diagnosisText} selectable>
          {activeReport}
        </Text>
        <View style={styles.actionRow}>
          <Pressable style={styles.saveBtn} onPress={handleSaveRecord}>
            <Text style={styles.saveBtnText}>💾 存入初談紀錄</Text>
          </Pressable>
          <Pressable
            style={styles.shareBtn}
            onPress={() =>
              void shareViaIOS(`${clientName}・空間氣質診斷書`, activeReport)
            }
          >
            <Text style={styles.shareBtnText}>📤 分享給屋主</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.sectionTitle}>
        🗂️ 已存檔客戶初談沙盒紀錄（SQLite 保存・共 {savedRecords.length} 筆）
      </Text>
      {savedRecords.map((rec) => (
        <View key={rec.id} style={styles.historyCard}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>
              {rec.clientName} ・ {rec.moodName}（硬裝 {rec.hardDecorRatio}%）
            </Text>
            <Pressable
              style={styles.delBtn}
              onPress={() => handleDeleteRecord(rec.id)}
            >
              <Text style={styles.delBtnText}>刪除</Text>
            </Pressable>
          </View>
          <Text style={styles.historyDate}>{rec.createdAt}</Text>
          <Text style={styles.historyPreview} numberOfLines={3}>
            {rec.diagnosisText}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: IOS_THEME.spacing.md, paddingBottom: 40 },
  safeBanner: {
    backgroundColor: IOS_THEME.colors.successBg,
    borderRadius: IOS_THEME.radius.sm,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.success,
  },
  safeBannerText: {
    color: IOS_THEME.colors.success,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  heroCard: {
    backgroundColor: IOS_THEME.colors.accent,
    borderRadius: IOS_THEME.radius.lg,
    padding: IOS_THEME.spacing.md,
    marginBottom: IOS_THEME.spacing.md,
  },
  heroTag: {
    color: '#F6E7D8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
  },
  heroDesc: { color: '#FFF6EE', fontSize: 13, lineHeight: 19 },
  clientBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.sm,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  clientLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: IOS_THEME.colors.textSecondary,
    marginRight: 8,
  },
  clientInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: IOS_THEME.colors.primary,
    paddingVertical: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: IOS_THEME.colors.textMain,
    marginBottom: 8,
    marginTop: 4,
  },
  moodList: { gap: 8, marginBottom: IOS_THEME.spacing.md },
  moodCard: {
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.md,
    padding: 12,
    borderWidth: 1.5,
    borderColor: IOS_THEME.colors.border,
  },
  moodCardActive: {
    borderColor: IOS_THEME.colors.accent,
    backgroundColor: IOS_THEME.colors.accentSoft,
  },
  moodName: {
    fontSize: 14,
    fontWeight: '800',
    color: IOS_THEME.colors.textMain,
    marginBottom: 2,
  },
  moodNameActive: { color: IOS_THEME.colors.primary },
  moodDesc: { fontSize: 12, color: IOS_THEME.colors.textSecondary },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  tagBtn: {
    backgroundColor: IOS_THEME.colors.card,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: IOS_THEME.radius.pill,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
  },
  tagBtnActive: {
    backgroundColor: IOS_THEME.colors.primary,
    borderColor: IOS_THEME.colors.primary,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    color: IOS_THEME.colors.textMain,
  },
  tagTextActive: { color: '#FFFFFF' },
  addTagRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: IOS_THEME.spacing.md,
  },
  addTagInput: {
    flex: 1,
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.sm,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12,
    color: IOS_THEME.colors.textMain,
  },
  addTagBtn: {
    backgroundColor: IOS_THEME.colors.primary,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: IOS_THEME.radius.sm,
  },
  addTagBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  balanceCard: {
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
    marginBottom: 12,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  balanceSide: {
    fontSize: 12,
    fontWeight: '700',
    color: IOS_THEME.colors.textMain,
  },
  barTrack: {
    height: 12,
    backgroundColor: '#DEC6B0',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12,
  },
  barFillHard: { height: '100%', backgroundColor: IOS_THEME.colors.primary },
  balanceControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  balanceBtn: {
    flex: 1,
    backgroundColor: IOS_THEME.colors.cardAlt,
    paddingVertical: 9,
    borderRadius: IOS_THEME.radius.sm,
    alignItems: 'center',
  },
  balanceBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: IOS_THEME.colors.primary,
  },
  aiGenBtn: {
    backgroundColor: IOS_THEME.colors.primary,
    borderRadius: IOS_THEME.radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  aiGenBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  diagnosisCard: {
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.lg,
    padding: IOS_THEME.spacing.md,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
    marginBottom: 16,
  },
  diagnosisText: {
    fontSize: 13,
    lineHeight: 21,
    color: IOS_THEME.colors.textMain,
    backgroundColor: IOS_THEME.colors.background,
    padding: 14,
    borderRadius: IOS_THEME.radius.sm,
    marginBottom: 12,
  },
  actionRow: { flexDirection: 'row', gap: 10 },
  saveBtn: {
    flex: 1,
    backgroundColor: IOS_THEME.colors.primary,
    borderRadius: IOS_THEME.radius.sm,
    minHeight: IOS_THEME.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  shareBtn: {
    flex: 1,
    backgroundColor: IOS_THEME.colors.accent,
    borderRadius: IOS_THEME.radius.sm,
    minHeight: IOS_THEME.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  historyCard: {
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.md,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: IOS_THEME.colors.primary,
    flex: 1,
  },
  delBtn: {
    backgroundColor: IOS_THEME.colors.dangerBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: IOS_THEME.radius.sm,
  },
  delBtnText: {
    color: IOS_THEME.colors.danger,
    fontSize: 11,
    fontWeight: '700',
  },
  historyDate: {
    fontSize: 11,
    color: IOS_THEME.colors.textSecondary,
    marginBottom: 6,
  },
  historyPreview: {
    fontSize: 12,
    color: IOS_THEME.colors.textMain,
    lineHeight: 17,
  },
});
