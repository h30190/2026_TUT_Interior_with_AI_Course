import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { shareViaIOS } from '../services/lobsterBridge';
import { IOS_THEME } from '../theme/iosTheme';

const LIFESTYLE_TAGS = [
  '🐾 有養貓／狗毛孩',
  '🍳 常下廚需中島輕食',
  '🧹 依賴掃地機器人',
  '📦 需要海量隱藏收納',
  '💻 居家遠距辦公書房',
  '🍷 喜歡招待朋友小酌',
  '🧘 偏好留白與自然光',
  '👴 需兼顧長輩無障礙',
];

const STYLE_MOODS = [
  { id: 'warm_wood', name: '溫潤木質氣韻', desc: '橡木實木皮＋藝術塗料＋暖白光' },
  { id: 'wabi_sabi', name: '靜謐侘寂微水泥', desc: '特殊鏝刀塗料＋弧形收邊＋低彩度' },
  { id: 'modern_stone', name: '現代俐落石材感', desc: '薄板磁磚＋鐵件玻璃＋線性燈帶' },
];

export function ClientSandboxAgent() {
  const [selectedTags, setSelectedTags] = useState<string[]>([
    '🐾 有養貓／狗毛孩',
    '🍳 常下廚需中島輕食',
    '🧹 依賴掃地機器人',
  ]);
  const [selectedMood, setSelectedMood] = useState<string>('warm_wood');
  // 預算比重（硬裝 % vs 軟裝家電 %）
  const [hardDecorRatio, setHardDecorRatio] = useState<number>(65);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const currentMood =
    STYLE_MOODS.find((m) => m.id === selectedMood) ?? STYLE_MOODS[0];
  const softDecorRatio = 100 - hardDecorRatio;

  const buildDiagnosisReport = () => {
    const petNote = selectedTags.includes('🐾 有養貓／狗毛孩')
      ? '• 毛孩友善動線：建議採用超耐磨防滑地板、耐抓貓抓布沙發，並於玄關或陽台櫃體下方預留隱藏式貓砂盆與自動餵食器插座。'
      : '• 材質維護建議：可大膽採用天然木皮與特殊塗料，營造溫潤觸感。';

    const kitchenNote = selectedTags.includes('🍳 常下廚需中島輕食')
      ? '• 餐廚核心配置：建議配置 95cm 以上回字型中島動線，並於中島側邊整合 IH 爐與嵌入式電器櫃專迴。'
      : '• 餐廚配置：以俐落高機能收納為主，放大客廳視覺景深。';

    const robotNote = selectedTags.includes('🧹 依賴掃地機器人')
      ? '• 清潔機電整合：全室取消門檻高低差，衣櫃或玄關鞋櫃下方懸空 18cm 並預留上下水與充電座。'
      : '• 收納落地面積最大化：櫃體採落地踢腳板設計，減少灰塵死角。';

    return [
      `🌿【氣韻居所・空間氣質與需求診斷書】`,
      `偏好空間調性：${currentMood.name}（${currentMood.desc}）`,
      `理想預算配置：硬裝基礎工程 ${hardDecorRatio}% ／ 軟裝家具家電 ${softDecorRatio}%`,
      `已選生活重心：${selectedTags.join('、') || '尚未勾選'}`,
      `━━━━━━━━━━━━━━`,
      `✨ AI 設計師初步空間建議：`,
      petNote,
      kitchenNote,
      robotNote,
      `━━━━━━━━━━━━━━`,
      `（本診斷書由《氣韻居所》隨身顧問 Agent 生成，完全不含敏感報價，可直接分享留存）`,
    ].join('\n');
  };

  const report = buildDiagnosisReport();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.safeBanner}>
        <Text style={styles.safeBannerText}>
          🔒 零機密客戶展示模式：此頁面無任何內部成本與其他客戶資料，可放心將 iPhone 遞給客戶自己點選互動
        </Text>
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.heroTag}>AGENT 04 ・ 客戶初談互動沙盒</Text>
        <Text style={styles.heroTitle}>🎭 氣韻空間氣質診斷器</Text>
        <Text style={styles.heroDesc}>
          邀請屋主點選喜愛的生活場景與預算比重，Agent 即時生成專屬的《空間氣質診斷書》。
        </Text>
      </View>

      {/* 1. 空間美學基調 */}
      <Text style={styles.sectionTitle}>1. 您偏好的空間氣韻基調</Text>
      <View style={styles.moodList}>
        {STYLE_MOODS.map((m) => {
          const active = selectedMood === m.id;
          return (
            <Pressable
              key={m.id}
              style={[styles.moodCard, active && styles.moodCardActive]}
              onPress={() => setSelectedMood(m.id)}
            >
              <Text
                style={[styles.moodName, active && styles.moodNameActive]}
              >
                {m.name}
              </Text>
              <Text style={styles.moodDesc}>{m.desc}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* 2. 生活型態多選 */}
      <Text style={styles.sectionTitle}>2. 點選您家的日常場景（可複選）</Text>
      <View style={styles.tagWrap}>
        {LIFESTYLE_TAGS.map((tag) => {
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

      {/* 3. 硬裝 vs 軟裝預算天平 */}
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
            onPress={() =>
              setHardDecorRatio((r) => Math.max(40, r - 5))
            }
          >
            <Text style={styles.balanceBtnText}>◀ 強化軟裝家具</Text>
          </Pressable>
          <Pressable
            style={styles.balanceBtn}
            onPress={() =>
              setHardDecorRatio((r) => Math.min(80, r + 5))
            }
          >
            <Text style={styles.balanceBtnText}>強化硬裝木作 ▶</Text>
          </Pressable>
        </View>
      </View>

      {/* 4. 即時診斷書 */}
      <View style={styles.diagnosisCard}>
        <Text style={styles.diagnosisText} selectable>
          {report}
        </Text>
        <Pressable
          style={styles.shareBtn}
          onPress={() =>
            void shareViaIOS('氣韻居所・空間氣質診斷書', report)
          }
        >
          <Text style={styles.shareBtnText}>
            📤 將診斷書分享給屋主留存（LINE / AirDrop）
          </Text>
        </Pressable>
      </View>
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
  heroDesc: {
    color: '#FFF6EE',
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
  moodList: {
    gap: 8,
    marginBottom: IOS_THEME.spacing.md,
  },
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
  moodNameActive: {
    color: IOS_THEME.colors.primary,
  },
  moodDesc: {
    fontSize: 12,
    color: IOS_THEME.colors.textSecondary,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: IOS_THEME.spacing.md,
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
  tagTextActive: {
    color: '#FFFFFF',
  },
  balanceCard: {
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
    marginBottom: IOS_THEME.spacing.md,
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
  barFillHard: {
    height: '100%',
    backgroundColor: IOS_THEME.colors.primary,
  },
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
  diagnosisCard: {
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.lg,
    padding: IOS_THEME.spacing.md,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
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
