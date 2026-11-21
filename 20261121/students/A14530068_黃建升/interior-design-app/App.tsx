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
import { ChiefEngineerAgent } from './src/agents/ChiefEngineerAgent';
import { ClientSandboxAgent } from './src/agents/ClientSandboxAgent';
import { NegotiatorAgent } from './src/agents/NegotiatorAgent';
import { PinpointAgent } from './src/agents/PinpointAgent';
import { BridgeSettingsModal } from './src/components/BridgeSettingsModal';
import { DEFAULT_LOBSTER_CONFIG } from './src/services/lobsterBridge';
import {
  loadBridgeConfigFromSQLite,
  saveBridgeConfigToSQLite,
} from './src/services/storage';
import { IOS_THEME } from './src/theme/iosTheme';
import { AgentTabId, LobsterBridgeConfig } from './src/types/agent';

const AGENT_TABS: {
  id: AgentTabId;
  icon: string;
  label: string;
}[] = [
  { id: 'negotiator', icon: '🗣️', label: '溝通談判' },
  { id: 'engineer', icon: '📐', label: '老工務長' },
  { id: 'pinpoint', icon: '📸', label: '看圖指派' },
  { id: 'sandbox', icon: '🎭', label: '客戶沙盒' },
  { id: 'chat', icon: '💬', label: '問助理' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<AgentTabId>('negotiator');
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

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.brandSub}>QI-YUN LIVING ・ AI POCKET AGENTS</Text>
          <Text style={styles.brandTitle}>氣韻居所・隨身智囊團</Text>
        </View>
        <Pressable
          style={styles.lobsterBadge}
          onPress={() => setShowBridgeModal(true)}
        >
          <Text style={styles.lobsterBadgeText} numberOfLines={1}>
            🦞{' '}
            {bridgeConfig.mode === 'local_engine'
              ? '本地語料'
              : bridgeConfig.modelId || 'Strata'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        {activeTab === 'negotiator' && (
          <NegotiatorAgent bridgeConfig={bridgeConfig} />
        )}
        {activeTab === 'engineer' && <ChiefEngineerAgent />}
        {activeTab === 'pinpoint' && <PinpointAgent />}
        {activeTab === 'sandbox' && <ClientSandboxAgent />}
        {activeTab === 'chat' && <ChatAgent bridgeConfig={bridgeConfig} />}
      </View>

      <View style={styles.tabBar}>
        {AGENT_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              style={[styles.tabItem, active && styles.tabItemActive]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={styles.tabIcon}>{tab.icon}</Text>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

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
    paddingBottom: 12,
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
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: IOS_THEME.radius.pill,
    maxWidth: 155,
  },
  lobsterBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: IOS_THEME.colors.primary,
  },
  body: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: IOS_THEME.colors.card,
    borderTopWidth: 1,
    borderTopColor: IOS_THEME.colors.border,
    paddingTop: 8,
    paddingBottom: IOS_THEME.spacing.iosBottomSafe,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: IOS_THEME.radius.sm,
    minHeight: IOS_THEME.minTouchTarget,
  },
  tabItemActive: {
    backgroundColor: IOS_THEME.colors.accentSoft,
  },
  tabIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: IOS_THEME.colors.textSecondary,
  },
  tabLabelActive: {
    color: IOS_THEME.colors.primary,
    fontWeight: '800',
  },
});
