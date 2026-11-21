import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { NEGOTIATOR_SCENARIOS } from '../data/presets';
import {
  buildLocalNegotiationScripts,
  generateNegotiationScripts,
  shareViaIOS,
} from '../services/lobsterBridge';
import { IOS_THEME } from '../theme/iosTheme';
import {
  LobsterBridgeConfig,
  NegotiatorOutputs,
  NegotiatorPersona,
} from '../types/agent';

interface Props {
  bridgeConfig: LobsterBridgeConfig;
}

const PERSONA_TABS: {
  id: NegotiatorPersona;
  title: string;
  badge: string;
  desc: string;
}[] = [
  {
    id: 'consultant',
    title: '🕊️ 溫柔顧問',
    badge: '對業主（白臉）',
    desc: '強調安全、美感與長期品質，讓業主安心接受建議或追加',
  },
  {
    id: 'contract',
    title: '🛡️ 合約護航',
    badge: '對奧客（黑臉）',
    desc: '不失禮貌但踩死合約條款、追加費用與工期免責界線',
  },
  {
    id: 'foreman',
    title: '🔨 工地阿兄',
    badge: '對工班師傅',
    desc: '直接講尺寸、收尾標準、完工期限與拉捲尺拍照驗收',
  },
  {
    id: 'neighbor',
    title: '🏢 管委會安撫',
    badge: '對鄰居／總幹事',
    desc: '合規時段聲明、減噪防塵承諾與敦親睦鄰致意',
  },
];

export function NegotiatorAgent({ bridgeConfig }: Props) {
  const [rawInput, setRawInput] = useState<string>(
    NEGOTIATOR_SCENARIOS[0].rawInput
  );
  const [activePersona, setActivePersona] =
    useState<NegotiatorPersona>('consultant');
  const [outputs, setOutputs] = useState<NegotiatorOutputs>(() =>
    buildLocalNegotiationScripts(NEGOTIATOR_SCENARIOS[0].rawInput)
  );
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const handleGenerate = async (customText?: string) => {
    const targetText = customText ?? rawInput;
    setIsGenerating(true);
    const result = await generateNegotiationScripts(targetText, bridgeConfig);
    setOutputs(result);
    setIsGenerating(false);
  };

  const currentScript = outputs[activePersona];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* 頂部 Agent 角色卡片 */}
      <View style={styles.heroCard}>
        <Text style={styles.heroTag}>AGENT 01 ・ 現場溝通與談判特助</Text>
        <Text style={styles.heroTitle}>🗣️ 黑白臉話術轉換器</Text>
        <Text style={styles.heroDesc}>
          在工地或車上不用絞盡腦汁想措辭。輸入一句大白話，一鍵轉換成給業主、奧客、師傅或管委會的得體 LINE 訊息。
        </Text>
      </View>

      {/* 快速情境膠囊 */}
      <Text style={styles.sectionTitle}>⚡ 點選常見棘手情境（或下方自行輸入）</Text>
      <View style={styles.chipWrap}>
        {NEGOTIATOR_SCENARIOS.map((item) => {
          const selected = rawInput === item.rawInput;
          return (
            <Pressable
              key={item.id}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => {
                setRawInput(item.rawInput);
                void handleGenerate(item.rawInput);
              }}
            >
              <Text
                style={[styles.chipText, selected && styles.chipTextSelected]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* 大白話輸入框 */}
      <View style={styles.inputCard}>
        <Text style={styles.inputLabel}>📝 你心裡想講的大白話／現場狀況：</Text>
        <TextInput
          style={styles.textInput}
          value={rawInput}
          onChangeText={setRawInput}
          multiline
          placeholder="例如：跟業主說這面牆不能打，管線移走要加三萬..."
          placeholderTextColor={IOS_THEME.colors.textMuted}
        />
        <Pressable
          style={styles.generateBtn}
          onPress={() => void handleGenerate()}
        >
          <Text style={styles.generateBtnText}>
            {isGenerating ? 'Agent 轉換話術中...' : '✨ 立即轉換 4 種角色話術'}
          </Text>
        </Pressable>
      </View>

      {/* 4 種角色切換頁籤 */}
      <Text style={styles.sectionTitle}>🎭 選擇發送對象角色</Text>
      <View style={styles.personaGrid}>
        {PERSONA_TABS.map((tab) => {
          const active = activePersona === tab.id;
          return (
            <Pressable
              key={tab.id}
              style={[styles.personaBtn, active && styles.personaBtnActive]}
              onPress={() => setActivePersona(tab.id)}
            >
              <Text
                style={[
                  styles.personaTitle,
                  active && styles.personaTitleActive,
                ]}
              >
                {tab.title}
              </Text>
              <Text
                style={[
                  styles.personaBadge,
                  active && styles.personaBadgeActive,
                ]}
              >
                {tab.badge}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* 轉換結果預覽與 iOS 原生分享 */}
      {outputs && (
        <View style={styles.outputCard}>
          <View style={styles.outputHeader}>
            <Text style={styles.outputHint}>
              {PERSONA_TABS.find((t) => t.id === activePersona)?.desc}
            </Text>
          </View>
          <View style={styles.scriptBox}>
            <Text style={styles.scriptText} selectable>
              {currentScript}
            </Text>
          </View>
          <Pressable
            style={styles.shareBtn}
            onPress={() =>
              void shareViaIOS('氣韻居所・溝通訊息', currentScript)
            }
          >
            <Text style={styles.shareBtnText}>
              📤 呼叫 iPhone 分享選單（直傳 LINE / 拷貝）
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: IOS_THEME.spacing.md, paddingBottom: 40 },
  heroCard: {
    backgroundColor: IOS_THEME.colors.primary,
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
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
  },
  heroDesc: {
    color: '#DCE2DF',
    fontSize: 13,
    lineHeight: 19,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: IOS_THEME.colors.textMain,
    marginBottom: 8,
    marginTop: 4,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: IOS_THEME.spacing.md,
  },
  chip: {
    backgroundColor: IOS_THEME.colors.card,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
    borderRadius: IOS_THEME.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: {
    backgroundColor: IOS_THEME.colors.accent,
    borderColor: IOS_THEME.colors.accent,
  },
  chipText: {
    fontSize: 12,
    color: IOS_THEME.colors.textMain,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  inputCard: {
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.md,
    padding: IOS_THEME.spacing.md,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
    marginBottom: IOS_THEME.spacing.md,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: IOS_THEME.colors.textSecondary,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: IOS_THEME.colors.background,
    borderRadius: IOS_THEME.radius.sm,
    padding: 12,
    fontSize: 14,
    color: IOS_THEME.colors.textMain,
    minHeight: 78,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  generateBtn: {
    backgroundColor: IOS_THEME.colors.primary,
    borderRadius: IOS_THEME.radius.sm,
    minHeight: IOS_THEME.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  personaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: IOS_THEME.spacing.md,
  },
  personaBtn: {
    width: '48.5%',
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.md,
    padding: 12,
    borderWidth: 1.5,
    borderColor: IOS_THEME.colors.border,
  },
  personaBtnActive: {
    borderColor: IOS_THEME.colors.accent,
    backgroundColor: IOS_THEME.colors.accentSoft,
  },
  personaTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: IOS_THEME.colors.textMain,
    marginBottom: 2,
  },
  personaTitleActive: {
    color: IOS_THEME.colors.primary,
  },
  personaBadge: {
    fontSize: 11,
    color: IOS_THEME.colors.textSecondary,
  },
  personaBadgeActive: {
    color: IOS_THEME.colors.accent,
    fontWeight: '700',
  },
  outputCard: {
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.lg,
    padding: IOS_THEME.spacing.md,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
  },
  outputHeader: {
    marginBottom: 10,
  },
  outputHint: {
    fontSize: 12,
    color: IOS_THEME.colors.accent,
    fontWeight: '600',
  },
  scriptBox: {
    backgroundColor: IOS_THEME.colors.background,
    borderRadius: IOS_THEME.radius.md,
    padding: 14,
    marginBottom: 14,
  },
  scriptText: {
    fontSize: 14,
    lineHeight: 22,
    color: IOS_THEME.colors.textMain,
  },
  shareBtn: {
    backgroundColor: IOS_THEME.colors.accent,
    borderRadius: IOS_THEME.radius.sm,
    minHeight: IOS_THEME.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
