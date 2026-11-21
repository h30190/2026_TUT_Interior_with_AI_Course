import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ThesisDecisionSection } from '../components/ThesisDecisionSection';
import {
  ERGONOMIC_RULES,
  INSPECTION_ITEMS,
} from '../data/presets';
import { shareViaIOS } from '../services/lobsterBridge';
import { IOS_THEME } from '../theme/iosTheme';
import { InspectionStage } from '../types/agent';

type SubMode = 'ergonomics' | 'checklist' | 'thesis';

export function ChiefEngineerAgent() {
  const [subMode, setSubMode] = useState<SubMode>('ergonomics');
  const [selectedRuleId, setSelectedRuleId] = useState<string>(
    ERGONOMIC_RULES[0].id
  );
  const [customValues, setCustomValues] = useState<Record<string, number>>({
    island_aisle: 105,
    wardrobe_bed: 85,
    shower_zone: 95,
    tv_distance: 320,
  });

  const [activeStage, setActiveStage] = useState<InspectionStage>('carpentry');
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>({
    c1: true,
  });

  const activeRule =
    ERGONOMIC_RULES.find((r) => r.id === selectedRuleId) ?? ERGONOMIC_RULES[0];
  const currentVal = customValues[activeRule.id] ?? activeRule.standard;

  const adjustDimension = (delta: number) => {
    const next = Math.max(
      activeRule.minLimit - 10,
      Math.min(activeRule.maxRange, currentVal + delta)
    );
    setCustomValues((prev) => ({ ...prev, [activeRule.id]: next }));
  };

  const getSafetyStatus = () => {
    if (currentVal >= activeRule.comfortMin) {
      return {
        level: 'green' as const,
        badge: '🟢 舒適安全綠燈',
        message: activeRule.comfortNote,
        bg: IOS_THEME.colors.successBg,
        color: IOS_THEME.colors.success,
      };
    }
    if (currentVal >= activeRule.minLimit + 10) {
      return {
        level: 'yellow' as const,
        badge: '🟡 緊繃臨界黃燈',
        message: activeRule.cautionNote,
        bg: IOS_THEME.colors.warningBg,
        color: IOS_THEME.colors.warning,
      };
    }
    return {
      level: 'red' as const,
      badge: '🔴 生活悲劇紅燈（請拿此畫面勸退業主）',
      message: activeRule.tragedyWarning,
      bg: IOS_THEME.colors.dangerBg,
      color: IOS_THEME.colors.danger,
    };
  };

  const status = getSafetyStatus();

  const stageItems = INSPECTION_ITEMS.filter((i) => i.stage === activeStage);
  const completedCount = stageItems.filter((i) => checkedIds[i.id]).length;

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => ({ ...prev, [id]: !prev[id] }));
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.heroTag}>AGENT 02 ・ 隨身老工務長 ＆ 論文知識庫</Text>
        <Text style={styles.heroTitle}>📐 尺寸勸退・防呆・浴室泥作決策</Text>
        <Text style={styles.heroDesc}>
          整合現場人體工學底線、隱蔽工程防呆清單，以及碩士論文「住宅浴室地坪泥作現場決策知識與 BIM 承載」結構。
        </Text>
      </View>

      <View style={styles.segmentRow}>
        <Pressable
          style={[
            styles.segmentBtn,
            subMode === 'ergonomics' && styles.segmentBtnActive,
          ]}
          onPress={() => setSubMode('ergonomics')}
        >
          <Text
            style={[
              styles.segmentText,
              subMode === 'ergonomics' && styles.segmentTextActive,
            ]}
          >
            📏 尺寸勸退
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.segmentBtn,
            subMode === 'checklist' && styles.segmentBtnActive,
          ]}
          onPress={() => setSubMode('checklist')}
        >
          <Text
            style={[
              styles.segmentText,
              subMode === 'checklist' && styles.segmentTextActive,
            ]}
          >
            ☑️ 封板防呆
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.segmentBtn,
            subMode === 'thesis' && styles.segmentBtnActive,
          ]}
          onPress={() => setSubMode('thesis')}
        >
          <Text
            style={[
              styles.segmentText,
              subMode === 'thesis' && styles.segmentTextActive,
            ]}
          >
            🎓 浴室論文知識
          </Text>
        </Pressable>
      </View>

      {subMode === 'ergonomics' && (
        <View>
          <Text style={styles.sectionTitle}>1. 選擇現場爭執或丈量中的空間</Text>
          <View style={styles.ruleList}>
            {ERGONOMIC_RULES.map((rule) => {
              const selected = rule.id === activeRule.id;
              return (
                <Pressable
                  key={rule.id}
                  style={[styles.ruleTab, selected && styles.ruleTabSelected]}
                  onPress={() => setSelectedRuleId(rule.id)}
                >
                  <Text
                    style={[
                      styles.ruleSpace,
                      selected && styles.ruleSpaceSelected,
                    ]}
                  >
                    {rule.space}
                  </Text>
                  <Text
                    style={[
                      styles.ruleTitle,
                      selected && styles.ruleTitleSelected,
                    ]}
                  >
                    {rule.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.simulatorCard}>
            <Text style={styles.simLabel}>目前現場預留尺寸（點擊按鈕增減）</Text>
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
                onPress={() =>
                  setCustomValues((prev) => ({
                    ...prev,
                    [activeRule.id]: activeRule.minLimit,
                  }))
                }
              >
                <Text style={styles.jumpPillText}>
                  試看悲劇值 ({activeRule.minLimit}cm)
                </Text>
              </Pressable>
              <Pressable
                style={styles.jumpPill}
                onPress={() =>
                  setCustomValues((prev) => ({
                    ...prev,
                    [activeRule.id]: activeRule.standard,
                  }))
                }
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

          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>
              本階段防呆進度：{completedCount} / {stageItems.length} 項已確認
            </Text>
          </View>

          {stageItems.map((item) => {
            const checked = !!checkedIds[item.id];
            return (
              <Pressable
                key={item.id}
                style={[styles.checkCard, checked && styles.checkCardDone]}
                onPress={() => toggleCheck(item.id)}
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
                      {item.critical ? '【必檢】' : ''}
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

          <Pressable style={styles.exportBtn} onPress={handleExportChecklist}>
            <Text style={styles.exportBtnText}>
              📤 匯出本階段驗收紀錄至 iPhone 分享選單
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
  segmentBtnActive: {
    backgroundColor: IOS_THEME.colors.card,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: IOS_THEME.colors.textSecondary,
  },
  segmentTextActive: {
    color: IOS_THEME.colors.primary,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: IOS_THEME.colors.textMain,
    marginBottom: 8,
  },
  ruleList: {
    gap: 8,
    marginBottom: IOS_THEME.spacing.md,
  },
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
  ruleSpaceSelected: {
    color: IOS_THEME.colors.primary,
  },
  ruleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: IOS_THEME.colors.textMain,
  },
  ruleTitleSelected: {
    color: IOS_THEME.colors.primary,
  },
  simulatorCard: {
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.lg,
    padding: IOS_THEME.spacing.md,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
  },
  simLabel: {
    fontSize: 13,
    color: IOS_THEME.colors.textSecondary,
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 12,
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
  stepBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  valueDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  valueNumber: {
    fontSize: 42,
    fontWeight: '900',
  },
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
    marginBottom: 16,
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
  alertBox: {
    borderRadius: IOS_THEME.radius.md,
    padding: 14,
  },
  alertBadge: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6,
  },
  alertMessage: {
    fontSize: 14,
    lineHeight: 21,
    color: IOS_THEME.colors.textMain,
  },
  stageTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
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
  stageTabTextActive: {
    color: '#FFFFFF',
  },
  progressHeader: {
    marginBottom: 10,
  },
  progressTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: IOS_THEME.colors.accent,
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
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkboxIcon: {
    fontSize: 18,
    marginRight: 10,
    marginTop: 1,
  },
  checkTextWrap: {
    flex: 1,
  },
  checkTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: IOS_THEME.colors.textMain,
    marginBottom: 4,
  },
  checkTitleDone: {
    color: IOS_THEME.colors.success,
  },
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
    marginTop: 8,
  },
  exportBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
