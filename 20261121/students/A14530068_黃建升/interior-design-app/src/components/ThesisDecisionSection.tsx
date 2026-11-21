import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BATHROOM_FLOOR_DECISION_EVENTS } from '../data/presets';
import { IOS_THEME } from '../theme/iosTheme';

export function ThesisDecisionSection() {
  return (
    <View>
      <View style={styles.thesisBanner}>
        <Text style={styles.thesisBannerTitle}>
          🎓 碩士論文：〈住宅浴室地坪泥作之現場決策知識與 BIM 承載可行性〉
        </Text>
        <Text style={styles.thesisBannerDesc}>
          ⚠️ 目前於 presets.ts 放置「浴室地坪決策事件」之【範例結構】（情境、判斷依據、處理方式、BIM 承載欄位），供架構驗證；真正的論文資料由 Jason 之後自行補入。
        </Text>
      </View>

      {BATHROOM_FLOOR_DECISION_EVENTS.map((ev) => (
        <View key={ev.id} style={styles.thesisCard}>
          <View style={styles.thesisCardHeader}>
            <Text style={styles.thesisPhase}>{ev.phase}</Text>
            {ev.isPlaceholder && (
              <View style={styles.placeholderBadge}>
                <Text style={styles.placeholderBadgeText}>範例結構</Text>
              </View>
            )}
          </View>

          <Text style={styles.thesisFieldLabel}>
            📍 1. 現場情境 (Scenario)
          </Text>
          <Text style={styles.thesisFieldValue}>{ev.scenario}</Text>

          <Text style={styles.thesisFieldLabel}>
            🔍 2. 判斷依據 (Criteria)
          </Text>
          <Text style={styles.thesisFieldValue}>{ev.criteria}</Text>

          <Text style={styles.thesisFieldLabel}>🛠️ 3. 處理方式 (Action)</Text>
          <Text style={styles.thesisFieldValue}>{ev.action}</Text>

          <View style={styles.bimBox}>
            <Text style={styles.bimLabel}>🧊 BIM 承載可行性映射欄位：</Text>
            <Text style={styles.bimValue}>{ev.bimParameter}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  thesisBanner: {
    backgroundColor: IOS_THEME.colors.warningBg,
    borderRadius: IOS_THEME.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.warning,
    marginBottom: 12,
  },
  thesisBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: IOS_THEME.colors.primary,
    marginBottom: 6,
  },
  thesisBannerDesc: {
    fontSize: 12,
    lineHeight: 18,
    color: IOS_THEME.colors.textMain,
  },
  thesisCard: {
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.lg,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
  },
  thesisCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  thesisPhase: {
    fontSize: 14,
    fontWeight: '800',
    color: IOS_THEME.colors.primary,
    flex: 1,
  },
  placeholderBadge: {
    backgroundColor: IOS_THEME.colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: IOS_THEME.radius.pill,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.accent,
  },
  placeholderBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: IOS_THEME.colors.accent,
  },
  thesisFieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: IOS_THEME.colors.accent,
    marginTop: 6,
    marginBottom: 2,
  },
  thesisFieldValue: {
    fontSize: 13,
    lineHeight: 19,
    color: IOS_THEME.colors.textMain,
    marginBottom: 4,
  },
  bimBox: {
    backgroundColor: IOS_THEME.colors.background,
    borderRadius: IOS_THEME.radius.sm,
    padding: 10,
    marginTop: 8,
  },
  bimLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: IOS_THEME.colors.textSecondary,
    marginBottom: 2,
  },
  bimValue: {
    fontSize: 12,
    color: IOS_THEME.colors.primary,
    fontWeight: '600',
    lineHeight: 17,
  },
});
