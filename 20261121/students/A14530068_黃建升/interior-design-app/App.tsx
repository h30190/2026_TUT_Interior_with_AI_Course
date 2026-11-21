import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChatAgent } from './src/agents/ChatAgent';
import { BridgeSettingsModal } from './src/components/BridgeSettingsModal';
import { DEFAULT_LOBSTER_CONFIG } from './src/services/lobsterBridge';
import {
  loadBridgeConfigFromSQLite,
  saveBridgeConfigToSQLite,
} from './src/services/storage';
import { IOS_THEME } from './src/theme/iosTheme';
import { LobsterBridgeConfig } from './src/types/agent';

export default function App() {
  const [bridgeConfig, setBridgeConfig] = useState<LobsterBridgeConfig>(() =>
    loadBridgeConfigFromSQLite(DEFAULT_LOBSTER_CONFIG)
  );
  const [showBridgeModal, setShowBridgeModal] = useState<boolean>(false);

  const updateConfig = (
    updater: (prev: LobsterBridgeConfig) => LobsterBridgeConfig
  ) => {
    setBridgeConfig((prev) => {
      const next = updater(prev);
      saveBridgeConfigToSQLite(next);
      return next;
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="dark" />

      {/* 極簡頂部標題列：品牌名稱 ＋ 右上角模型/API Key 設定按鈕 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.brandSub}>QI-YUN LIVING ・ AI AGENT</Text>
          <Text style={styles.brandTitle}>氣韻居所・AI 助理</Text>
        </View>
        <Pressable
          style={styles.lobsterBadge}
          onPress={() => setShowBridgeModal(true)}
        >
          <Text style={styles.lobsterBadgeText} numberOfLines={1}>
            🦞{' '}
            {bridgeConfig.mode === 'local_engine'
              ? '離線模式'
              : bridgeConfig.modelId || 'Strata'}
          </Text>
        </Pressable>
      </View>

      {/* 主畫面：純粹的多會話 AI 對話視窗 */}
      <View style={styles.body}>
        <ChatAgent bridgeConfig={bridgeConfig} />
      </View>

      {/* 模型切換・API Key・連線紀錄設定彈窗 */}
      <BridgeSettingsModal
        visible={showBridgeModal}
        bridgeConfig={bridgeConfig}
        onClose={() => setShowBridgeModal(false)}
        onUpdateConfig={updateConfig}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: IOS_THEME.colors.background,
  },
  header: {
    paddingTop: IOS_THEME.spacing.iosTopSafe,
    paddingBottom: 10,
    paddingHorizontal: IOS_THEME.spacing.md,
    backgroundColor: IOS_THEME.colors.card,
    borderBottomWidth: 1,
    borderBottomColor: IOS_THEME.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flex: 1,
    marginRight: 8,
  },
  brandSub: {
    fontSize: 10,
    fontWeight: '700',
    color: IOS_THEME.colors.accent,
    letterSpacing: 0.8,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: IOS_THEME.colors.primary,
  },
  lobsterBadge: {
    backgroundColor: IOS_THEME.colors.accentSoft,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: IOS_THEME.radius.pill,
    maxWidth: 165,
  },
  lobsterBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: IOS_THEME.colors.primary,
  },
  body: {
    flex: 1,
  },
});
