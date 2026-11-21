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
import { ThesisDecisionSection } from '../components/ThesisDecisionSection';
import {
  generateAiErgonomicAdvice,
  shareViaIOS,
} from '../services/lobsterBridge';
import {
  addErgonomicRuleToSQLite,
  addInspectionItemToSQLite,
  loadErgonomicRulesFromSQLite,
  loadErgonomicValuesFromSQLite,
  loadInspectionChecksFromSQLite,
  loadInspectionItemsFromSQLite,
  removeInspectionItemFromSQLite,
  saveErgonomicValuesToSQLite,
  saveInspectionChecksToSQLite,
} from '../services/storage';
import { IOS_THEME } from '../theme/iosTheme';
import {
  ErgonomicRule,
  InspectionItem,
  InspectionStage,
  LobsterBridgeConfig,
} from '../types/agent';

interface Props {
  bridgeConfig: LobsterBridgeConfig;
}

type SubMode = 'ergonomics' | 'checklist' | 'thesis';

export function ChiefEngineerAgent({ bridgeConfig }: Props) {
  const [subMode, setSubMode] = useState<SubMode>('ergonomics');
  const [rules, setRules] = useState<ErgonomicRule[]>(() =>
    loadErgonomicRulesFromSQLite()
  );
  const [selectedRuleId, setSelectedRuleId] = useState<string>(
    () => rules[0]?.id || 'island_aisle'
  );
  const [customValues, setCustomValues] = useState<Record<string, number>>(() =>
    loadErgonomicValuesFromSQLite()
  );

  // 新增自訂尺寸規則狀態
  const [showAddRule, setShowAddRule] = useState<boolean>(false);
  const [newSpace, setNewSpace] = useState<string>('');
  const [newRuleTitle, setNewRuleTitle] = useState<string>('');
  const [newMinCm, setNewMinCm] = useState<string>('60');
  const [newComfortCm, setNewComfortCm] = useState<string>('80');

  // Strata AI 尺寸勸退說帖狀態
  const [aiAdvice, setAiAdvice] = useState<string>('');
  const [isGeneratingAdvice, setIsGeneratingAdvice] = useState<boolean>(false);

  // 封板防呆清單 SQLite 狀態
  const [activeStage, setActiveStage] = useState<InspectionStage>('carpentry');
  const [inspectItems, setInspectItems] = useState<InspectionItem[]>(() =>
    loadInspectionItemsFromSQLite()
  );
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>(() =>
    loadInspectionChecksFromSQLite()
  );
  const [newCheckTitle, setNewCheckTitle] = useState<string>('');
  const [newCheckHint, setNewCheckHint] = useState<string>('');

  const activeRule =
    rules.find((r) => r.id === selectedRuleId) ?? rules[0];
  const currentVal = customValues[activeRule.id] ?? activeRule.standard;

  const updateDimensionValue = (nextVal: number) => {
    const nextMap = { ...customValues, [activeRule.id]: nextVal };
    setCustomValues(nextMap);
    saveErgonomicValuesToSQLite(nextMap);
  };

  const adjustDimension = (delta: number) => {
    const next = Math.max(
      activeRule.minLimit - 15,
      Math.min(activeRule.maxRange, currentVal + delta)
    );
    updateDimensionValue(next);
  };

  const handleAddRule = () => {
    if (!newRuleTitle.trim()) {
      Alert.alert('提示', '請輸入空間尺寸項目名稱。');
      return;
    }
    const minN = Number(newMinCm) || 60;
    const comfortN = Number(newComfortCm) || minN + 20;
    const nextRules = addErgonomicRuleToSQLite(
      newSpace,
      newRuleTitle,
      minN,
      comfortN,
      comfortN + 10
    );
    setRules(nextRules);
    setSelectedRuleId(nextRules[nextRules.length - 1].id);
    setNewSpace('');
    setNewRuleTitle('');
    setShowAddRule(false);
  };

  const handleAskAiAdvice = async () => {
    setIsGeneratingAdvice(true);
    const reply = await generateAiErgonomicAdvice(
      activeRule.space,
      activeRule.title,
      currentVal,
      activeRule.minLimit,
      activeRule.comfortMin,
      bridgeConfig
    );
    setAiAdvice(reply);
    setIsGeneratingAdvice(false);
  };

  const getSafetyStatus = () => {
    if (currentVal >= activeRule.comfortMin) {
      return {
        badge: '🟢 舒適安全綠燈',
        message: activeRule.comfortNote,
        bg: IOS_THEME.colors.successBg,
        color: IOS_THEME.colors.success,
      };
    }
    if (currentVal >= activeRule.minLimit + 10) {
      return {
        badge: '🟡 緊繃臨界黃燈',
        message: activeRule.cautionNote,
        bg: IOS_THEME.colors.warningBg,
        color: IOS_THEME.colors.warning,
      };
    }
    return {
      badge: '🔴 生活悲劇紅燈（請拿此畫面勸退業主）',
      message: activeRule.tragedyWarning,
      bg: IOS_THEME.colors.dangerBg,
      color: IOS_THEME.colors.danger,
    };
  };

  const status = getSafetyStatus();
  const stageItems = inspectItems.filter((i) => i.stage === activeStage);
  const completedCount = stageItems.filter((i) => checkedIds[i.id]).length;

  const toggleCheck = (id: string) => {
    const next = { ...checkedIds, [id]: !checkedIds[id] };
    setCheckedIds(next);
    saveInspectionChecksToSQLite(next);
  };

  const handleAddCheckItem = () => {
    if (!newCheckTitle.trim()) {
      Alert.alert('提示', '請輸入要新增的驗收項目名稱。');
      return;
    }
    const next = addInspectionItemToSQLite(
      activeStage,
      newCheckTitle,
      newCheckHint
    );
    setInspectItems(next);
    setNewCheckTitle('');
    setNewCheckHint('');
  };

  const handleDeleteCheckItem = (id: string) => {
    const next = removeInspectionItemFromSQLite(id);
    setInspectItems(next);
  };

  const handleExportChecklist = () => {
    const stageName =
      activeStage === 'plumbing'
        ? '水電封槽前'
        : activeStage === 'waterproof'
          ? '泥作防水試水'
          : '木作封板前';
    const lines = stageItems.map(
      (item) =>
        `${checkedIds[item.id] ? '✅ [已驗收]' : '⬜ [待確認]'} ${item.title}\n   📸 必拍：${item.photoHint}`
    );
    const report = `📐【氣韻居所・隱蔽工程防呆驗收單】\n階段：${stageName}（完成度 ${completedCount}/${stageItems.length}）\n━━━━━━━━━━━━━━\n${lines.join('\n\n')}`;
    void shareViaIOS('隱蔽工程防呆驗收單', report);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.heroCard}>
        <Text style={styles.heroTag}>
          AGENT 02 ・ SQLite 記憶 ＆ Strata AI 老工務長
        </Text>
        <Text style={styles.heroTitle}>📐 尺寸勸退・防呆・浴室泥作決策</Text>
        <Text style={styles.heroDesc}>
          所有尺寸模擬、封板打勾、自訂驗收項與論文決策皆自動存入 SQLite，並可隨時呼叫 Strata AI 撰寫現場勸退說帖。
        </Text>
      </View>

      <View style={styles.segmentRow}>
        {(
          [
            { id: 'ergonomics', label: '📏 尺寸勸退' },
            { id: 'checklist', label: '☑️ 封板防呆' },
            { id: 'thesis', label: '🎓 浴室論文知識' },
          ] as { id: SubMode; label: string }[]
        ).map((tab) => (
          <Pressable
            key={tab.id}
            style={[
              styles.segmentBtn,
              subMode === tab.id && styles.segmentBtnActive,
            ]}
            onPress={() => setSubMode(tab.id)}
          >
            <Text
              style={[
                styles.segmentText,
                subMode === tab.id && styles.segmentTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {subMode === 'ergonomics' && (
        <View>
          <View style={styles.headerRowBetween}>
            <Text style={styles.sectionTitle}>1. 選擇或新增空間尺寸規則</Text>
            <Pressable onPress={() => setShowAddRule((v) => !v)}>
              <Text style={styles.linkText}>
                {showAddRule ? '✕ 收起' : '➕ 新增自訂空間尺寸'}
              </Text>
            </Pressable>
          </View>

          {showAddRule && (
            <View style={styles.addBox}>
              <TextInput
                style={styles.input}
                value={newSpace}
                onChangeText={setNewSpace}
                placeholder="空間分類（如：玄關／書房／次臥）"
                placeholderTextColor={IOS_THEME.colors.textMuted}
              />
              <TextInput
                style={styles.input}
                value={newRuleTitle}
                onChangeText={setNewRuleTitle}
                placeholder="尺寸名稱（如：書桌椅後方至書櫃走道淨寬）"
                placeholderTextColor={IOS_THEME.colors.textMuted}
              />
              <View style={styles.inlineInputs}>
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  value={newMinCm}
                  onChangeText={setNewMinCm}
                  keyboardType="numeric"
                  placeholder="悲劇底線 cm (如 60)"
                />
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  value={newComfortCm}
                  onChangeText={setNewComfortCm}
                  keyboardType="numeric"
                  placeholder="舒適標準 cm (如 85)"
                />
              </View>
              <Pressable style={styles.primarySmallBtn} onPress={handleAddRule}>
                <Text style={styles.primarySmallBtnText}>💾 存入 SQLite 規則庫</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.ruleList}>
            {rules.map((rule) => {
              const selected = rule.id === activeRule.id;
              return (
                <Pressable
                  key={rule.id}
                  style={[styles.ruleTab, selected && styles.ruleTabSelected]}
                  onPress={() => {
                    setSelectedRuleId(rule.id);
                    setAiAdvice('');
                  }}
                >
                  <Text style={styles.ruleSpace}>{rule.space}</Text>
                  <Text style={styles.ruleTitle}>{rule.title}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.simulatorCard}>
            <Text style={styles.simLabel}>
              目前現場預留尺寸（自動記憶於 SQLite）
            </Text>
            <View style={styles.counterRow}>
              <Pressable
                style={styles.stepBtn}
                onPress={() => adjustDimension(-5)}
              >
                <Text style={styles.stepBtnText}>- 5 cm</Text>
              </Pressable>
              <View style={styles.valueDisplay}>
                <Text style={[styles.valueNumber, { color: status.color }]}>
                  {currentVal}
                </Text>
                <Text style={styles.valueUnit}>cm</Text>
              </View>
              <Pressable
                style={styles.stepBtn}
                onPress={() => adjustDimension(5)}
              >
                <Text style={styles.stepBtnText}>+ 5 cm</Text>
              </Pressable>
            </View>

            <View style={styles.quickJumpRow}>
              <Pressable
                style={styles.jumpPill}
                onPress={() => updateDimensionValue(activeRule.minLimit)}
              >
                <Text style={styles.jumpPillText}>
                  試看悲劇值 ({activeRule.minLimit}cm)
                </Text>
              </Pressable>
              <Pressable
                style={styles.jumpPill}
                onPress={() => updateDimensionValue(activeRule.standard)}
              >
                <Text style={styles.jumpPillText}>
                  回標準值 ({activeRule.standard}cm)
                </Text>
              </Pressable>
            </View>

            <View style={[styles.alertBox, { backgroundColor: status.bg }]}>
              <Text style={[styles.alertBadge, { color: status.color }]}>
                {status.badge}
              </Text>
              <Text style={styles.alertMessage}>{status.message}</Text>
            </View>

            <Pressable
              style={styles.aiAdviceBtn}
              onPress={() => void handleAskAiAdvice()}
            >
              <Text style={styles.aiAdviceBtnText}>
                {isGeneratingAdvice
                  ? '⏳ Strata 老工務長正在撰寫勸退說帖...'
                  : `🤖 請 Strata AI 針對 ${currentVal}cm 撰寫現場勸退說帖`}
              </Text>
            </Pressable>

            {aiAdvice.length > 0 && (
              <View style={styles.aiAdviceBox}>
                <Text style={styles.aiAdviceTitle}>
                  🦞 老工務長 AI 現場評估說帖：
                </Text>
                <Text style={styles.aiAdviceText} selectable>
                  {aiAdvice}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {subMode === 'checklist' && (
        <View>
          <View style={styles.stageTabs}>
            {(
              [
                { id: 'plumbing', label: '⚡ 水電封槽前' },
                { id: 'waterproof', label: '💧 防水試水前' },
                { id: 'carpentry', label: '🪵 木作封板前' },
              ] as { id: InspectionStage; label: string }[]
            ).map((st) => {
              const active = activeStage === st.id;
              return (
                <Pressable
                  key={st.id}
                  style={[styles.stageTab, active && styles.stageTabActive]}
                  onPress={() => setActiveStage(st.id)}
                >
                  <Text
                    style={[
                      styles.stageTabText,
                      active && styles.stageTabTextActive,
                    ]}
                  >
                    {st.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.progressTitle}>
            本階段防呆進度：{completedCount} / {stageItems.length} 項已確認（已自動存檔，長按可刪除項目）
          </Text>

          {stageItems.map((item) => {
            const checked = !!checkedIds[item.id];
            return (
              <Pressable
                key={item.id}
                style={[styles.checkCard, checked && styles.checkCardDone]}
                onPress={() => toggleCheck(item.id)}
                onLongPress={() => handleDeleteCheckItem(item.id)}
              >
                <View style={styles.checkRow}>
                  <Text style={styles.checkboxIcon}>
                    {checked ? '✅' : '⬜'}
                  </Text>
                  <View style={styles.checkTextWrap}>
                    <Text
                      style={[
                        styles.checkTitle,
                        checked && styles.checkTitleDone,
                      ]}
                    >
                      {item.title}
                    </Text>
                    <Text style={styles.checkHint}>
                      📸 拍照重點：{item.photoHint}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}

          <View style={styles.addBox}>
            <Text style={styles.sectionTitle}>➕ 新增本階段自訂防呆驗收項</Text>
            <TextInput
              style={styles.input}
              value={newCheckTitle}
              onChangeText={setNewCheckTitle}
              placeholder="輸入要新增的驗收檢查重點..."
              placeholderTextColor={IOS_THEME.colors.textMuted}
            />
            <TextInput
              style={styles.input}
              value={newCheckHint}
              onChangeText={setNewCheckHint}
              placeholder="必拍照片提示（選填）..."
              placeholderTextColor={IOS_THEME.colors.textMuted}
            />
            <Pressable
              style={styles.primarySmallBtn}
              onPress={handleAddCheckItem}
            >
              <Text style={styles.primarySmallBtnText}>
                ➕ 加入驗收清單（存入 SQLite）
              </Text>
            </Pressable>
          </View>

          <Pressable style={styles.exportBtn} onPress={handleExportChecklist}>
            <Text style={styles.exportBtnText}>
              📤 匯出本階段驗收紀錄至手機分享選單
            </Text>
          </Pressable>
        </View>
      )}

      {subMode === 'thesis' && <ThesisDecisionSection />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: IOS_THEME.spacing.md, paddingBottom: 40 },
  heroCard: {
    backgroundColor: '#38423B',
    borderRadius: IOS_THEME.radius.lg,
    padding: IOS_THEME.spacing.md,
    marginBottom: IOS_THEME.spacing.md,
  },
  heroTag: {
    color: '#D7C4B0',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 6,
  },
  heroDesc: {
    color: '#DCE2DF',
    fontSize: 13,
    lineHeight: 19,
  },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: IOS_THEME.colors.cardAlt,
    borderRadius: IOS_THEME.radius.md,
    padding: 4,
    marginBottom: IOS_THEME.spacing.md,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: IOS_THEME.radius.sm,
  },
  segmentBtnActive: { backgroundColor: IOS_THEME.colors.card },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: IOS_THEME.colors.textSecondary,
  },
  segmentTextActive: {
    color: IOS_THEME.colors.primary,
    fontWeight: '800',
  },
  headerRowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: IOS_THEME.colors.textMain,
    marginBottom: 6,
  },
  linkText: {
    fontSize: 12,
    fontWeight: '800',
    color: IOS_THEME.colors.accent,
  },
  addBox: {
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
    marginBottom: 12,
  },
  input: {
    backgroundColor: IOS_THEME.colors.background,
    borderRadius: IOS_THEME.radius.sm,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: IOS_THEME.colors.textMain,
    marginBottom: 8,
  },
  inlineInputs: { flexDirection: 'row', gap: 8 },
  halfInput: { flex: 1 },
  primarySmallBtn: {
    backgroundColor: IOS_THEME.colors.primary,
    borderRadius: IOS_THEME.radius.sm,
    paddingVertical: 9,
    alignItems: 'center',
  },
  primarySmallBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  ruleList: { gap: 8, marginBottom: IOS_THEME.spacing.md },
  ruleTab: {
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
  },
  ruleTabSelected: {
    borderColor: IOS_THEME.colors.accent,
    backgroundColor: IOS_THEME.colors.accentSoft,
  },
  ruleSpace: {
    fontSize: 11,
    fontWeight: '700',
    color: IOS_THEME.colors.accent,
    marginBottom: 2,
  },
  ruleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: IOS_THEME.colors.textMain,
  },
  simulatorCard: {
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.lg,
    padding: IOS_THEME.spacing.md,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
  },
  simLabel: {
    fontSize: 12,
    color: IOS_THEME.colors.textSecondary,
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 10,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  stepBtn: {
    backgroundColor: IOS_THEME.colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: IOS_THEME.radius.md,
    minWidth: 88,
    alignItems: 'center',
  },
  stepBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  valueDisplay: { flexDirection: 'row', alignItems: 'baseline' },
  valueNumber: { fontSize: 42, fontWeight: '900' },
  valueUnit: {
    fontSize: 16,
    fontWeight: '700',
    color: IOS_THEME.colors.textSecondary,
    marginLeft: 4,
  },
  quickJumpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 14,
  },
  jumpPill: {
    backgroundColor: IOS_THEME.colors.cardAlt,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: IOS_THEME.radius.pill,
  },
  jumpPillText: {
    fontSize: 12,
    color: IOS_THEME.colors.textSecondary,
    fontWeight: '600',
  },
  alertBox: { borderRadius: IOS_THEME.radius.md, padding: 14, marginBottom: 10 },
  alertBadge: { fontSize: 14, fontWeight: '800', marginBottom: 6 },
  alertMessage: {
    fontSize: 14,
    lineHeight: 21,
    color: IOS_THEME.colors.textMain,
  },
  aiAdviceBtn: {
    backgroundColor: IOS_THEME.colors.accent,
    borderRadius: IOS_THEME.radius.sm,
    paddingVertical: 11,
    alignItems: 'center',
  },
  aiAdviceBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  aiAdviceBox: {
    backgroundColor: IOS_THEME.colors.background,
    borderRadius: IOS_THEME.radius.sm,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.accent,
  },
  aiAdviceTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: IOS_THEME.colors.accent,
    marginBottom: 4,
  },
  aiAdviceText: {
    fontSize: 13,
    lineHeight: 20,
    color: IOS_THEME.colors.textMain,
  },
  stageTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stageTab: {
    flex: 1,
    backgroundColor: IOS_THEME.colors.card,
    paddingVertical: 10,
    borderRadius: IOS_THEME.radius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
  },
  stageTabActive: {
    backgroundColor: IOS_THEME.colors.primary,
    borderColor: IOS_THEME.colors.primary,
  },
  stageTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: IOS_THEME.colors.textMain,
  },
  stageTabTextActive: { color: '#FFFFFF' },
  progressTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: IOS_THEME.colors.accent,
    marginBottom: 10,
  },
  checkCard: {
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
  },
  checkCardDone: {
    backgroundColor: IOS_THEME.colors.successBg,
    borderColor: IOS_THEME.colors.success,
  },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start' },
  checkboxIcon: { fontSize: 18, marginRight: 10, marginTop: 1 },
  checkTextWrap: { flex: 1 },
  checkTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: IOS_THEME.colors.textMain,
    marginBottom: 4,
  },
  checkTitleDone: { color: IOS_THEME.colors.success },
  checkHint: {
    fontSize: 12,
    color: IOS_THEME.colors.textSecondary,
    lineHeight: 17,
  },
  exportBtn: {
    backgroundColor: IOS_THEME.colors.accent,
    borderRadius: IOS_THEME.radius.sm,
    minHeight: IOS_THEME.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  exportBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
