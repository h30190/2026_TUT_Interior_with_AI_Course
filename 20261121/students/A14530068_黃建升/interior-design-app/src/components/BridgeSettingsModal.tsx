import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  fetchAvailableModelsFromServer,
  testStrataProxyConnection,
} from '../services/lobsterBridge';
import {
  insertConnectionProfileToSQLite,
  loadConnectionProfilesFromSQLite,
  removeConnectionProfileFromSQLite,
} from '../services/storage';
import { IOS_THEME } from '../theme/iosTheme';
import {
  LobsterBridgeConfig,
  SavedConnectionProfile,
} from '../types/agent';

interface Props {
  visible: boolean;
  bridgeConfig: LobsterBridgeConfig;
  onClose: () => void;
  onUpdateConfig: (
    updater: (prev: LobsterBridgeConfig) => LobsterBridgeConfig
  ) => void;
}

export function BridgeSettingsModal({
  visible,
  bridgeConfig,
  onClose,
  onUpdateConfig,
}: Props) {
  const [savedProfiles, setSavedProfiles] = useState<SavedConnectionProfile[]>(
    () => loadConnectionProfilesFromSQLite()
  );
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [customModelInput, setCustomModelInput] = useState<string>('');
  const [profileNameInput, setProfileNameInput] = useState<string>('');
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false);
  const [modelFetchStatus, setModelFetchStatus] = useState<string>('');
  const [isTestingConn, setIsTestingConn] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    reply: string;
  } | null>(null);

  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    setModelFetchStatus('');
    const res = await fetchAvailableModelsFromServer(bridgeConfig);
    setModelFetchStatus(res.message);
    if (res.ok && res.models.length > 0) {
      onUpdateConfig((prev) => ({
        ...prev,
        availableModels: Array.from(
          new Set([...res.models, ...prev.availableModels])
        ),
        modelId: res.models[0] || prev.modelId,
      }));
    }
    setIsFetchingModels(false);
  };

  const handleAddCustomModel = () => {
    const trimmed = customModelInput.trim();
    if (!trimmed) {
      return;
    }
    onUpdateConfig((prev) => ({
      ...prev,
      modelId: trimmed,
      availableModels: Array.from(new Set([trimmed, ...prev.availableModels])),
    }));
    setCustomModelInput('');
  };

  const handleTestConnection = async () => {
    setIsTestingConn(true);
    setTestResult(null);
    const res = await testStrataProxyConnection(bridgeConfig);
    setTestResult({ ok: res.ok, reply: res.reply });
    if (res.ok && res.detectedModel) {
      const detected = res.detectedModel;
      onUpdateConfig((prev) => ({
        ...prev,
        modelId: detected,
        availableModels: Array.from(
          new Set([detected, ...prev.availableModels])
        ),
      }));
    }
    setIsTestingConn(false);
  };

  const handleSaveProfile = () => {
    const nextList = insertConnectionProfileToSQLite(
      profileNameInput,
      bridgeConfig
    );
    setSavedProfiles(nextList);
    setProfileNameInput('');
    Alert.alert('已儲存紀錄', '此組 API Key、模型與網址已存入本機連線紀錄。');
  };

  const handleApplyProfile = (prof: SavedConnectionProfile) => {
    onUpdateConfig((prev) => ({
      ...prev,
      mode: 'remote_api',
      endpointUrl: prof.endpointUrl,
      apiKey: prof.apiKey,
      modelId: prof.modelId,
      availableModels: Array.from(
        new Set([prof.modelId, ...prev.availableModels])
      ),
    }));
    setTestResult({
      ok: true,
      reply: `已套用紀錄「${prof.profileName}」（模型：${prof.modelId}）`,
    });
  };

  const handleDeleteProfile = (id: number) => {
    const nextList = removeConnectionProfileFromSQLite(id);
    setSavedProfiles(nextList);
  };

  const maskKeyPreview = (key: string) => {
    if (!key) {
      return '未填（由電腦 Proxy 代填）';
    }
    if (key.length <= 6) {
      return '••••••';
    }
    return `${key.slice(0, 3)}••••${key.slice(-3)}`;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalTopBar}>
            <Text style={styles.modalTitle}>
              🦞 模型切換・API Key・連線紀錄
            </Text>
            <Pressable style={styles.topClosePill} onPress={onClose}>
              <Text style={styles.topClosePillText}>完成</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionHeader}>1. 選擇運算引擎模式</Text>
            <View style={styles.modeSwitchRow}>
              <Pressable
                style={[
                  styles.modeBtn,
                  bridgeConfig.mode === 'local_engine' && styles.modeBtnActive,
                ]}
                onPress={() =>
                  onUpdateConfig((prev) => ({ ...prev, mode: 'local_engine' }))
                }
              >
                <Text
                  style={[
                    styles.modeBtnText,
                    bridgeConfig.mode === 'local_engine' &&
                      styles.modeBtnTextActive,
                  ]}
                >
                  ⚡ 離線本地語料
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modeBtn,
                  bridgeConfig.mode === 'remote_api' && styles.modeBtnActive,
                ]}
                onPress={() =>
                  onUpdateConfig((prev) => ({ ...prev, mode: 'remote_api' }))
                }
              >
                <Text
                  style={[
                    styles.modeBtnText,
                    bridgeConfig.mode === 'remote_api' &&
                      styles.modeBtnTextActive,
                  ]}
                >
                  🦞 遠端 Strata / API
                </Text>
              </Pressable>
            </View>

            <Text style={styles.sectionHeader}>
              2. 伺服器端點網址 ＆ API Key（自動記憶於手機本機）
            </Text>
            <Text style={styles.fieldLabel}>
              OpenAI 相容端點網址 (/v1/chat/completions)：
            </Text>
            <TextInput
              style={styles.fieldInput}
              value={bridgeConfig.endpointUrl}
              onChangeText={(text) =>
                onUpdateConfig((prev) => ({ ...prev, endpointUrl: text }))
              }
              autoCapitalize="none"
              placeholder="http://192.168.0.101:8787/v1/chat/completions"
            />
            <Text style={styles.demoEndpointNote}>
              ⚠️ 註：192.168.0.101:8787 為電腦 Proxy 示範位址；未連線時自動降級走本地語料。
            </Text>

            <View style={styles.keyLabelRow}>
              <Text style={styles.fieldLabel}>
                🔑 API Key（儲存在手機 SQLite，不進 Git Repo）：
              </Text>
              <Pressable onPress={() => setShowApiKey((v) => !v)}>
                <Text style={styles.toggleKeyLink}>
                  {showApiKey ? '🙈 隱藏金鑰' : '👁️ 顯示金鑰'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.keyInputRow}>
              <TextInput
                style={[styles.fieldInput, styles.flexInput]}
                value={bridgeConfig.apiKey}
                onChangeText={(text) =>
                  onUpdateConfig((prev) => ({ ...prev, apiKey: text }))
                }
                secureTextEntry={!showApiKey}
                autoCapitalize="none"
                placeholder="可輸入 Strata / OpenAI / 龍蝦 API Key（留空則用電腦 .env）"
                placeholderTextColor={IOS_THEME.colors.textMuted}
              />
              {bridgeConfig.apiKey.length > 0 && (
                <Pressable
                  style={styles.clearKeyBtn}
                  onPress={() =>
                    onUpdateConfig((prev) => ({ ...prev, apiKey: '' }))
                  }
                >
                  <Text style={styles.clearKeyText}>清除</Text>
                </Pressable>
              )}
            </View>

            <Text style={styles.sectionHeader}>
              3. 目前使用模型顯示 ＆ 更換模型
            </Text>
            <View style={styles.currentModelBanner}>
              <Text style={styles.currentModelLabel}>🤖 目前選用模型：</Text>
              <Text style={styles.currentModelValue}>
                {bridgeConfig.modelId || 'auto'}
              </Text>
            </View>

            <Pressable
              style={styles.fetchModelsBtn}
              onPress={() => void handleFetchModels()}
            >
              <Text style={styles.fetchModelsBtnText}>
                {isFetchingModels
                  ? '⏳ 正在向伺服器查詢可用模型...'
                  : '🔄 從伺服器讀取可用模型清單 (/v1/models)'}
              </Text>
            </Pressable>

            {modelFetchStatus.length > 0 && (
              <Text style={styles.modelFetchHint}>{modelFetchStatus}</Text>
            )}

            <Text style={styles.fieldLabel}>
              點選下方模型標籤即可立即更換模型：
            </Text>
            <View style={styles.modelChipsWrap}>
              {bridgeConfig.availableModels.map((m) => {
                const selected = bridgeConfig.modelId === m;
                return (
                  <Pressable
                    key={m}
                    style={[
                      styles.modelChip,
                      selected && styles.modelChipSelected,
                    ]}
                    onPress={() =>
                      onUpdateConfig((prev) => ({ ...prev, modelId: m }))
                    }
                  >
                    <Text
                      style={[
                        styles.modelChipText,
                        selected && styles.modelChipTextSelected,
                      ]}
                    >
                      {selected ? `✅ ${m}` : m}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.inlineRow}>
              <TextInput
                style={[styles.fieldInput, styles.flexInput]}
                value={customModelInput}
                onChangeText={setCustomModelInput}
                autoCapitalize="none"
                placeholder="手動輸入新模型 ID（如 qwen3.8-q3_s）..."
                placeholderTextColor={IOS_THEME.colors.textMuted}
              />
              <Pressable
                style={styles.addModelBtn}
                onPress={handleAddCustomModel}
              >
                <Text style={styles.addModelBtnText}>＋新增並切換</Text>
              </Pressable>
            </View>

            <Pressable
              style={styles.testConnBtn}
              onPress={() => void handleTestConnection()}
            >
              <Text style={styles.testConnBtnText}>
                {isTestingConn
                  ? '⏳ 正在呼叫模型測試連線...'
                  : `🧪 測試連線（使用 ${bridgeConfig.modelId} 打招呼）`}
              </Text>
            </Pressable>

            {testResult && (
              <View
                style={[
                  styles.testResultBox,
                  testResult.ok ? styles.testResultOk : styles.testResultFail,
                ]}
              >
                <Text
                  style={[
                    styles.testResultTitle,
                    {
                      color: testResult.ok
                        ? IOS_THEME.colors.success
                        : IOS_THEME.colors.danger,
                    },
                  ]}
                >
                  {testResult.ok
                    ? '✅ 模型連線成功：'
                    : '⚠️ 連線未通過（自動降級本地語料）：'}
                </Text>
                <Text style={styles.testResultReply}>{testResult.reply}</Text>
              </View>
            )}

            <Text style={styles.sectionHeader}>
              4. 常用連線／模型／金鑰紀錄（共 {savedProfiles.length} 組）
            </Text>
            <View style={styles.inlineRow}>
              <TextInput
                style={[styles.fieldInput, styles.flexInput]}
                value={profileNameInput}
                onChangeText={setProfileNameInput}
                placeholder="輸入紀錄名稱（例如：筆電 Strata / 家裡龍蝦）"
                placeholderTextColor={IOS_THEME.colors.textMuted}
              />
              <Pressable
                style={styles.saveProfileBtn}
                onPress={handleSaveProfile}
              >
                <Text style={styles.saveProfileBtnText}>💾 儲存紀錄</Text>
              </Pressable>
            </View>

            {savedProfiles.map((prof) => (
              <View key={prof.id} style={styles.profileCard}>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileTitle}>{prof.profileName}</Text>
                  <Text style={styles.profileMeta}>
                    🤖 模型：{prof.modelId} ｜ 🔑 金鑰：
                    {maskKeyPreview(prof.apiKey)}
                  </Text>
                  <Text style={styles.profileMeta} numberOfLines={1}>
                    🌐 {prof.endpointUrl}
                  </Text>
                </View>
                <View style={styles.profileActions}>
                  <Pressable
                    style={styles.applyProfBtn}
                    onPress={() => handleApplyProfile(prof)}
                  >
                    <Text style={styles.applyProfText}>套用</Text>
                  </Pressable>
                  <Pressable
                    style={styles.delProfBtn}
                    onPress={() => handleDeleteProfile(prof.id)}
                  >
                    <Text style={styles.delProfText}>刪除</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.48)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: IOS_THEME.colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingTop: 16,
  },
  modalTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: IOS_THEME.colors.border,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: IOS_THEME.colors.primary,
  },
  topClosePill: {
    backgroundColor: IOS_THEME.colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: IOS_THEME.radius.pill,
  },
  topClosePillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  modalScroll: {
    paddingHorizontal: 18,
  },
  modalScrollContent: {
    paddingTop: 12,
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: IOS_THEME.colors.primary,
    marginTop: 8,
    marginBottom: 8,
  },
  modeSwitchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: IOS_THEME.radius.sm,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: IOS_THEME.colors.primary,
    borderColor: IOS_THEME.colors.primary,
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: IOS_THEME.colors.textMain,
  },
  modeBtnTextActive: {
    color: '#FFFFFF',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: IOS_THEME.colors.textSecondary,
    marginBottom: 5,
  },
  fieldInput: {
    backgroundColor: IOS_THEME.colors.background,
    borderRadius: IOS_THEME.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: IOS_THEME.colors.textMain,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
  },
  demoEndpointNote: {
    fontSize: 11,
    color: IOS_THEME.colors.warning,
    fontWeight: '600',
    marginBottom: 10,
    lineHeight: 16,
  },
  keyLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleKeyLink: {
    fontSize: 12,
    fontWeight: '700',
    color: IOS_THEME.colors.accent,
    marginBottom: 5,
  },
  keyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  flexInput: {
    flex: 1,
    marginBottom: 0,
  },
  clearKeyBtn: {
    backgroundColor: IOS_THEME.colors.dangerBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: IOS_THEME.radius.sm,
  },
  clearKeyText: {
    color: IOS_THEME.colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  currentModelBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: IOS_THEME.colors.accentSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: IOS_THEME.radius.sm,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.accent,
    marginBottom: 8,
  },
  currentModelLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: IOS_THEME.colors.textSecondary,
    marginRight: 6,
  },
  currentModelValue: {
    fontSize: 14,
    fontWeight: '900',
    color: IOS_THEME.colors.primary,
  },
  fetchModelsBtn: {
    backgroundColor: IOS_THEME.colors.cardAlt,
    borderRadius: IOS_THEME.radius.sm,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
    marginBottom: 8,
  },
  fetchModelsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: IOS_THEME.colors.primary,
  },
  modelFetchHint: {
    fontSize: 11,
    color: IOS_THEME.colors.textSecondary,
    marginBottom: 8,
    lineHeight: 16,
  },
  modelChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  modelChip: {
    backgroundColor: IOS_THEME.colors.background,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
    borderRadius: IOS_THEME.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  modelChipSelected: {
    backgroundColor: IOS_THEME.colors.primary,
    borderColor: IOS_THEME.colors.primary,
  },
  modelChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: IOS_THEME.colors.textMain,
  },
  modelChipTextSelected: {
    color: '#FFFFFF',
  },
  addModelBtn: {
    backgroundColor: IOS_THEME.colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: IOS_THEME.radius.sm,
  },
  addModelBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  testConnBtn: {
    backgroundColor: IOS_THEME.colors.primary,
    borderRadius: IOS_THEME.radius.sm,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  testConnBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  testResultBox: {
    borderRadius: IOS_THEME.radius.sm,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
  },
  testResultOk: {
    backgroundColor: IOS_THEME.colors.successBg,
    borderColor: IOS_THEME.colors.success,
  },
  testResultFail: {
    backgroundColor: IOS_THEME.colors.dangerBg,
    borderColor: IOS_THEME.colors.danger,
  },
  testResultTitle: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 3,
  },
  testResultReply: {
    fontSize: 12,
    color: IOS_THEME.colors.textMain,
    lineHeight: 18,
  },
  saveProfileBtn: {
    backgroundColor: IOS_THEME.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: IOS_THEME.radius.sm,
  },
  saveProfileBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  profileCard: {
    backgroundColor: IOS_THEME.colors.background,
    borderRadius: IOS_THEME.radius.sm,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileInfo: {
    flex: 1,
    marginRight: 8,
  },
  profileTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: IOS_THEME.colors.primary,
    marginBottom: 2,
  },
  profileMeta: {
    fontSize: 11,
    color: IOS_THEME.colors.textSecondary,
    lineHeight: 16,
  },
  profileActions: {
    flexDirection: 'row',
    gap: 6,
  },
  applyProfBtn: {
    backgroundColor: IOS_THEME.colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: IOS_THEME.radius.sm,
  },
  applyProfText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  delProfBtn: {
    backgroundColor: IOS_THEME.colors.dangerBg,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: IOS_THEME.radius.sm,
  },
  delProfText: {
    color: IOS_THEME.colors.danger,
    fontSize: 11,
    fontWeight: '700',
  },
});
