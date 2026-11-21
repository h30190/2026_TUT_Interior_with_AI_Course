import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChiefEngineerAgent } from '../agents/ChiefEngineerAgent';
import { PinpointAgent } from '../agents/PinpointAgent';
import { IOS_THEME } from '../theme/iosTheme';
import { LobsterBridgeConfig } from '../types/agent';

export interface PendingPhotoAttachment {
  uri: string;
  base64?: string | null;
}

interface Props {
  expanded: boolean;
  pendingPhoto: PendingPhotoAttachment | null;
  bridgeConfig: LobsterBridgeConfig;
  onSelectPhoto: (photo: PendingPhotoAttachment | null) => void;
  onQuickPrompt: (promptText: string) => void;
}

const QUICK_PROMPTS = [
  { label: '📸 看圖抓缺失', text: '請幫我檢視這張現場照片，列出可能的施工缺失與驗收重點：' },
  { label: '🗣️ 轉業主話術', text: '請幫我把以下現場狀況，轉成溫柔專業、讓業主安心接受追加的 LINE 訊息：' },
  { label: '🔨 轉師傅派工', text: '請幫我把以下待修項目，轉成直接清楚、給工班師傅的 LINE 派工指令：' },
  { label: '💧 浴室防水規範', text: '請列出住宅浴室地坪泥作的洩水坡度標準、防水塗刷高度與 48 小時試水驗收重點。' },
];

export function ChatAttachmentBar({
  expanded,
  pendingPhoto,
  bridgeConfig,
  onSelectPhoto,
  onQuickPrompt,
}: Props) {
  const [toolModal, setToolModal] = useState<'none' | 'pinpoint' | 'engineer'>(
    'none'
  );

  // 現場拍照上傳
  const handleTakeCameraPhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('需要相機權限', '請允許使用相機以拍攝案場照片。');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.6,
        base64: true,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        onSelectPhoto({ uri: asset.uri, base64: asset.base64 });
      }
    } catch {
      Alert.alert(
        '相機提示',
        '若電腦模擬器無相機鏡頭，請點選旁邊的「🖼️ 相簿傳圖」選取照片。'
      );
    }
  };

  // 從相簿選取照片傳送
  const handlePickLibraryPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('需要相簿權限', '請允許讀取相簿以傳送照片。');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.6,
        base64: true,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        onSelectPhoto({ uri: asset.uri, base64: asset.base64 });
      }
    } catch {
      Alert.alert('選圖失敗', '無法開啟手機相簿，請再試一次。');
    }
  };

  return (
    <View>
      {/* 待發送照片預覽列 */}
      {pendingPhoto && (
        <View style={styles.previewBar}>
          <Image
            source={{ uri: pendingPhoto.uri }}
            style={styles.previewThumb}
          />
          <View style={styles.previewInfo}>
            <Text style={styles.previewTitle}>
              📷 已附加現場照片（將隨訊息一併送出）
            </Text>
            <Text style={styles.previewSub}>
              可直接按「發送」，或輸入問題請 AI 針對照片分析
            </Text>
          </View>
          <Pressable
            style={styles.removePhotoBtn}
            onPress={() => onSelectPhoto(null)}
          >
            <Text style={styles.removePhotoText}>✕ 移除</Text>
          </Pressable>
        </View>
      )}

      {/* 點擊「＋」展開的多功能面板 */}
      {expanded && (
        <View style={styles.drawerBox}>
          <View style={styles.actionGrid}>
            <Pressable
              style={styles.actionTile}
              onPress={() => void handleTakeCameraPhoto()}
            >
              <Text style={styles.actionIcon}>📸</Text>
              <Text style={styles.actionLabel}>拍照上傳</Text>
            </Pressable>

            <Pressable
              style={styles.actionTile}
              onPress={() => void handlePickLibraryPhoto()}
            >
              <Text style={styles.actionIcon}>🖼️</Text>
              <Text style={styles.actionLabel}>相簿傳圖</Text>
            </Pressable>

            <Pressable
              style={styles.actionTile}
              onPress={() => setToolModal('pinpoint')}
            >
              <Text style={styles.actionIcon}>📍</Text>
              <Text style={styles.actionLabel}>照片釘紅點</Text>
            </Pressable>

            <Pressable
              style={styles.actionTile}
              onPress={() => setToolModal('engineer')}
            >
              <Text style={styles.actionIcon}>📐</Text>
              <Text style={styles.actionLabel}>工務／論文庫</Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickPromptRow}
          >
            {QUICK_PROMPTS.map((qp) => (
              <Pressable
                key={qp.label}
                style={styles.quickChip}
                onPress={() => onQuickPrompt(qp.text)}
              >
                <Text style={styles.quickChipText}>{qp.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 彈窗開啟「📍 照片釘紅點」或「📐 工務／論文庫」隨身工具 */}
      <Modal
        visible={toolModal !== 'none'}
        animationType="slide"
        onRequestClose={() => setToolModal('none')}
      >
        <View style={styles.toolModalRoot}>
          <View style={styles.toolModalHeader}>
            <Text style={styles.toolModalTitle}>
              {toolModal === 'pinpoint'
                ? '📍 現場照片紅點標記 ＆ 派工單'
                : '📐 老工務長尺寸・防呆・浴室論文庫'}
            </Text>
            <Pressable
              style={styles.toolCloseBtn}
              onPress={() => setToolModal('none')}
            >
              <Text style={styles.toolCloseText}>返回對話</Text>
            </Pressable>
          </View>
          <View style={styles.toolModalBody}>
            {toolModal === 'pinpoint' && (
              <PinpointAgent bridgeConfig={bridgeConfig} />
            )}
            {toolModal === 'engineer' && (
              <ChiefEngineerAgent bridgeConfig={bridgeConfig} />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  previewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: IOS_THEME.colors.accentSoft,
    paddingHorizontal: IOS_THEME.spacing.md,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: IOS_THEME.colors.accent,
  },
  previewThumb: {
    width: 48,
    height: 48,
    borderRadius: IOS_THEME.radius.sm,
    marginRight: 10,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.accent,
  },
  previewInfo: {
    flex: 1,
    marginRight: 8,
  },
  previewTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: IOS_THEME.colors.primary,
    marginBottom: 2,
  },
  previewSub: {
    fontSize: 11,
    color: IOS_THEME.colors.textSecondary,
  },
  removePhotoBtn: {
    backgroundColor: IOS_THEME.colors.dangerBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: IOS_THEME.radius.sm,
  },
  removePhotoText: {
    color: IOS_THEME.colors.danger,
    fontSize: 11,
    fontWeight: '800',
  },
  drawerBox: {
    backgroundColor: IOS_THEME.colors.cardAlt,
    borderTopWidth: 1,
    borderTopColor: IOS_THEME.colors.border,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: IOS_THEME.spacing.md,
  },
  actionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  actionTile: {
    flex: 1,
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
  },
  actionIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: IOS_THEME.colors.primary,
  },
  quickPromptRow: {
    gap: 8,
    paddingBottom: 2,
  },
  quickChip: {
    backgroundColor: IOS_THEME.colors.card,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: IOS_THEME.radius.pill,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: IOS_THEME.colors.accent,
  },
  toolModalRoot: {
    flex: 1,
    backgroundColor: IOS_THEME.colors.background,
  },
  toolModalHeader: {
    paddingTop: IOS_THEME.spacing.iosTopSafe,
    paddingBottom: 12,
    paddingHorizontal: IOS_THEME.spacing.md,
    backgroundColor: IOS_THEME.colors.card,
    borderBottomWidth: 1,
    borderBottomColor: IOS_THEME.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toolModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: IOS_THEME.colors.primary,
  },
  toolCloseBtn: {
    backgroundColor: IOS_THEME.colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: IOS_THEME.radius.pill,
  },
  toolCloseText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  toolModalBody: {
    flex: 1,
  },
});
