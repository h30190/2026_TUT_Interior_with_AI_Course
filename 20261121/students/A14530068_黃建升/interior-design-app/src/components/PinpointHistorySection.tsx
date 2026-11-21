import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { shareViaIOS } from '../services/lobsterBridge';
import { IOS_THEME } from '../theme/iosTheme';
import { DispatchHistoryRecord } from '../types/agent';

interface Props {
  reportText: string;
  historyRecords: DispatchHistoryRecord[];
  onSaveToHistory: () => void;
  onRestoreHistory: (record: DispatchHistoryRecord) => void;
  onDeleteHistory: (id: number) => void;
}

export function PinpointHistorySection({
  reportText,
  historyRecords,
  onSaveToHistory,
  onRestoreHistory,
  onDeleteHistory,
}: Props) {
  return (
    <View>
      <View style={styles.reportCard}>
        <Text style={styles.reportLabel}>
          📋 Agent 自動彙整 LINE 圖文對照派工卡：
        </Text>
        <Text style={styles.reportContent} selectable>
          {reportText}
        </Text>
        <View style={styles.reportActionRow}>
          <Pressable style={styles.saveDbBtn} onPress={onSaveToHistory}>
            <Text style={styles.saveDbBtnText}>💾 存入歷史派工單</Text>
          </Pressable>
          <Pressable
            style={styles.shareBtn}
            onPress={() => void shareViaIOS('氣韻居所・看圖指派單', reportText)}
          >
            <Text style={styles.shareBtnText}>📤 分享至 LINE</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.sectionTitle}>
        🗂️ 歷史派工單紀錄（SQLite 本機保存・共 {historyRecords.length} 筆）
      </Text>
      {historyRecords.length === 0 ? (
        <View style={styles.emptyHistoryBox}>
          <Text style={styles.emptyHistoryText}>
            尚無歷史派工單。點選上方「💾 存入歷史派工單」即可歸檔保存，重開 App 也不會消失。
          </Text>
        </View>
      ) : (
        historyRecords.map((rec) => (
          <View key={rec.id} style={styles.historyCard}>
            <View style={styles.historyHeader}>
              <View style={styles.historyTitleWrap}>
                <Text style={styles.historyTitle}>
                  #{rec.id} {rec.projectName}（{rec.pinCount} 處紅點）
                </Text>
                <Text style={styles.historyDate}>建立時間：{rec.createdAt}</Text>
              </View>
              {rec.photoUri && (
                <Image
                  source={{ uri: rec.photoUri }}
                  style={styles.historyThumb}
                />
              )}
            </View>
            <Text style={styles.historyPreview} numberOfLines={3}>
              {rec.reportText}
            </Text>
            <View style={styles.historyBtnRow}>
              <Pressable
                style={styles.historyActionBtn}
                onPress={() => onRestoreHistory(rec)}
              >
                <Text style={styles.historyActionText}>📂 載回畫布</Text>
              </Pressable>
              <Pressable
                style={styles.historyActionBtn}
                onPress={() =>
                  void shareViaIOS(
                    `${rec.projectName}・歷史派工單`,
                    rec.reportText
                  )
                }
              >
                <Text style={styles.historyActionText}>📤 分享 LINE</Text>
              </Pressable>
              <Pressable
                style={[styles.historyActionBtn, styles.historyDeleteBtn]}
                onPress={() => onDeleteHistory(rec.id)}
              >
                <Text style={styles.historyDeleteText}>🗑️ 刪除</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: IOS_THEME.colors.textMain,
    marginBottom: 8,
    marginTop: 4,
  },
  reportCard: {
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.lg,
    padding: IOS_THEME.spacing.md,
    marginTop: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
  },
  reportLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: IOS_THEME.colors.accent,
    marginBottom: 8,
  },
  reportContent: {
    fontSize: 13,
    lineHeight: 20,
    color: IOS_THEME.colors.textMain,
    backgroundColor: IOS_THEME.colors.background,
    padding: 12,
    borderRadius: IOS_THEME.radius.sm,
    marginBottom: 12,
  },
  reportActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  saveDbBtn: {
    flex: 1,
    backgroundColor: IOS_THEME.colors.accent,
    borderRadius: IOS_THEME.radius.sm,
    minHeight: IOS_THEME.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveDbBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  shareBtn: {
    flex: 1,
    backgroundColor: IOS_THEME.colors.primary,
    borderRadius: IOS_THEME.radius.sm,
    minHeight: IOS_THEME.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyHistoryBox: {
    backgroundColor: IOS_THEME.colors.cardAlt,
    borderRadius: IOS_THEME.radius.md,
    padding: 14,
  },
  emptyHistoryText: {
    fontSize: 12,
    color: IOS_THEME.colors.textSecondary,
    lineHeight: 18,
  },
  historyCard: {
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyTitleWrap: {
    flex: 1,
    marginRight: 8,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: IOS_THEME.colors.primary,
    marginBottom: 2,
  },
  historyDate: {
    fontSize: 11,
    color: IOS_THEME.colors.textSecondary,
  },
  historyThumb: {
    width: 48,
    height: 48,
    borderRadius: IOS_THEME.radius.sm,
  },
  historyPreview: {
    fontSize: 12,
    color: IOS_THEME.colors.textSecondary,
    backgroundColor: IOS_THEME.colors.background,
    padding: 10,
    borderRadius: IOS_THEME.radius.sm,
    marginBottom: 10,
    lineHeight: 17,
  },
  historyBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  historyActionBtn: {
    flex: 1,
    backgroundColor: IOS_THEME.colors.cardAlt,
    paddingVertical: 8,
    borderRadius: IOS_THEME.radius.sm,
    alignItems: 'center',
  },
  historyActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: IOS_THEME.colors.primary,
  },
  historyDeleteBtn: {
    backgroundColor: IOS_THEME.colors.dangerBg,
  },
  historyDeleteText: {
    fontSize: 12,
    fontWeight: '700',
    color: IOS_THEME.colors.danger,
  },
});
