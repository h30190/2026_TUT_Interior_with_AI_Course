import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  Alert,
  GestureResponderEvent,
  Image,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { PinpointHistorySection } from '../components/PinpointHistorySection';
import { TRADE_CATEGORIES } from '../data/presets';
import {
  buildPinpointDispatchReport,
  generateAiEnhancedPinpointReport,
} from '../services/lobsterBridge';
import {
  addIssueTagToSQLite,
  insertDispatchHistoryRecord,
  loadActivePinpointWorkspace,
  loadDispatchHistoryList,
  loadIssueTagsMapFromSQLite,
  removeDispatchHistoryRecord,
  saveActivePinpointWorkspace,
} from '../services/storage';
import { IOS_THEME } from '../theme/iosTheme';
import {
  DispatchHistoryRecord,
  LobsterBridgeConfig,
  PinMarker,
  TradeCategory,
} from '../types/agent';

interface Props {
  bridgeConfig: LobsterBridgeConfig;
}

export function PinpointAgent({ bridgeConfig }: Props) {
  const [initialWorkspace] = useState(() => loadActivePinpointWorkspace());
  const [projectName, setProjectName] = useState<string>(
    initialWorkspace.projectName
  );
  const [photoUri, setPhotoUri] = useState<string | null>(
    initialWorkspace.photoUri
  );
  const [pins, setPins] = useState<PinMarker[]>(initialWorkspace.pins);
  const [pinSeq, setPinSeq] = useState<number>(
    initialWorkspace.pins.length + 10
  );
  const [historyRecords, setHistoryRecords] = useState<DispatchHistoryRecord[]>(
    () => loadDispatchHistoryList()
  );
  const [issueTagsMap, setIssueTagsMap] = useState<
    Record<TradeCategory, string[]>
  >(() => loadIssueTagsMapFromSQLite());

  const [selectedTrade, setSelectedTrade] = useState<TradeCategory>('泥作');
  const [selectedIssue, setSelectedIssue] = useState<string>(
    () => issueTagsMap['泥作']?.[0] || '洩水坡度不足'
  );
  const [newTagInput, setNewTagInput] = useState<string>('');
  const [customNote, setCustomNote] = useState<string>('');
  const [aiPolishedReport, setAiPolishedReport] = useState<string>('');
  const [isPolishing, setIsPolishing] = useState<boolean>(false);

  const [canvasSize, setCanvasSize] = useState<{
    width: number;
    height: number;
  }>({
    width: 320,
    height: 240,
  });

  const syncWorkspaceToSQLite = (
    nextProject: string,
    nextPhoto: string | null,
    nextPins: PinMarker[]
  ) => {
    saveActivePinpointWorkspace({
      projectName: nextProject,
      photoUri: nextPhoto,
      pins: nextPins,
    });
    setAiPolishedReport('');
  };

  const handleTradeSelect = (trade: TradeCategory) => {
    setSelectedTrade(trade);
    setSelectedIssue(issueTagsMap[trade]?.[0] || '');
  };

  const handleAddCustomIssueTag = () => {
    const trimmed = newTagInput.trim();
    if (!trimmed) {
      return;
    }
    const nextMap = addIssueTagToSQLite(selectedTrade, trimmed);
    setIssueTagsMap(nextMap);
    setSelectedIssue(trimmed);
    setNewTagInput('');
  };

  const handleTakePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('需要相機權限', '請允許使用相機以拍攝案場照片。');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        setPhotoUri(uri);
        syncWorkspaceToSQLite(projectName, uri, pins);
      }
    } catch {
      Alert.alert('相機提示', '模擬器若無相機鏡頭，請改點選「從相簿選照片」。');
    }
  };

  const handlePickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('需要相簿權限', '請允許讀取相簿以選取案場照片。');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        setPhotoUri(uri);
        syncWorkspaceToSQLite(projectName, uri, pins);
      }
    } catch {
      Alert.alert('選圖失敗', '無法開啟相簿，請再試一次。');
    }
  };

  const handleCanvasLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setCanvasSize({ width, height });
    }
  };

  const handleTapPhotoCanvas = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    const xPercent = Math.max(
      4,
      Math.min(92, Math.round((locationX / canvasSize.width) * 100))
    );
    const yPercent = Math.max(
      5,
      Math.min(90, Math.round((locationY / canvasSize.height) * 100))
    );

    const nextNum = pins.length + 1;
    const newPin: PinMarker = {
      id: `pin-${pinSeq}`,
      number: nextNum,
      zoneId: photoUri ? 'site-photo' : 'canvas-preview',
      zoneName: `照片標註點 #${nextNum}`,
      xPercent,
      yPercent,
      trade: selectedTrade,
      issueTag: selectedIssue,
      note:
        customNote.trim() ||
        `請於照片標註 #${nextNum} 位置確認【${selectedIssue}】`,
      deadline: '3 日內完成',
    };

    const nextPins = [...pins, newPin];
    setPinSeq((s) => s + 1);
    setPins(nextPins);
    setCustomNote('');
    syncWorkspaceToSQLite(projectName, photoUri, nextPins);
  };

  const handleRemovePin = (id: string) => {
    const nextPins = pins
      .filter((p) => p.id !== id)
      .map((p, idx) => ({
        ...p,
        number: idx + 1,
        zoneName: `照片標註點 #${idx + 1}`,
      }));
    setPins(nextPins);
    syncWorkspaceToSQLite(projectName, photoUri, nextPins);
  };

  const handleClearAllPins = () => {
    setPins([]);
    syncWorkspaceToSQLite(projectName, photoUri, []);
  };

  const baseReportText = buildPinpointDispatchReport(projectName, pins);
  const activeReportText = aiPolishedReport || baseReportText;

  const handleAiPolishReport = async () => {
    setIsPolishing(true);
    const enhanced = await generateAiEnhancedPinpointReport(
      projectName,
      pins,
      bridgeConfig
    );
    setAiPolishedReport(enhanced);
    setIsPolishing(false);
  };

  const handleSaveToHistory = () => {
    if (pins.length === 0) {
      Alert.alert('尚無紅點', '請先在照片上點擊標註至少 1 個紅點再儲存派工單。');
      return;
    }
    const updatedList = insertDispatchHistoryRecord(
      projectName,
      photoUri,
      pins,
      activeReportText
    );
    setHistoryRecords(updatedList);
    Alert.alert('已存入本機資料庫', '派工單已寫入 SQLite，重開 App 亦可隨時查閱。');
  };

  const handleDeleteHistory = (id: number) => {
    const updatedList = removeDispatchHistoryRecord(id);
    setHistoryRecords(updatedList);
  };

  const handleRestoreHistory = (record: DispatchHistoryRecord) => {
    try {
      const restoredPins = JSON.parse(record.pinsJson) as PinMarker[];
      setProjectName(record.projectName);
      setPhotoUri(record.photoUri);
      setPins(Array.isArray(restoredPins) ? restoredPins : []);
      syncWorkspaceToSQLite(
        record.projectName,
        record.photoUri,
        Array.isArray(restoredPins) ? restoredPins : []
      );
    } catch {
      Alert.alert('載入提示', '無法還原此筆紅點資料。');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.heroCard}>
        <Text style={styles.heroTag}>
          AGENT 03 ・ 真實照片紅點 ＆ SQLite 自訂標籤 ＆ Strata AI 派工潤飾
        </Text>
        <Text style={styles.heroTitle}>📸 看圖指派紅點 Agent</Text>
        <Text style={styles.heroDesc}>
          現場拍照或選圖（僅存本機），可自行新增各工種常用缺失標籤，點擊照片釘上紅點並由 Strata AI 補充驗收規範。
        </Text>
      </View>

      <View style={styles.projectBar}>
        <Text style={styles.projectLabel}>案場名稱：</Text>
        <TextInput
          style={styles.projectInput}
          value={projectName}
          onChangeText={(text) => {
            setProjectName(text);
            syncWorkspaceToSQLite(text, photoUri, pins);
          }}
          placeholder="輸入案場名稱..."
          placeholderTextColor={IOS_THEME.colors.textMuted}
        />
      </View>

      <View style={styles.photoActionRow}>
        <Pressable
          style={styles.cameraBtn}
          onPress={() => void handleTakePhoto()}
        >
          <Text style={styles.cameraBtnText}>📸 現場拍案場照片</Text>
        </Pressable>
        <Pressable
          style={styles.albumBtn}
          onPress={() => void handlePickPhoto()}
        >
          <Text style={styles.albumBtnText}>🖼️ 從相簿選照片</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>1. 選擇工種與缺失標籤（可自行新增）</Text>
      <View style={styles.tradeRow}>
        {TRADE_CATEGORIES.map((trade) => {
          const active = selectedTrade === trade;
          return (
            <Pressable
              key={trade}
              style={[styles.tradePill, active && styles.tradePillActive]}
              onPress={() => handleTradeSelect(trade)}
            >
              <Text
                style={[
                  styles.tradePillText,
                  active && styles.tradePillTextActive,
                ]}
              >
                {trade}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.issueRow}>
        {(issueTagsMap[selectedTrade] ?? []).map((tag) => {
          const active = selectedIssue === tag;
          return (
            <Pressable
              key={tag}
              style={[styles.issueChip, active && styles.issueChipActive]}
              onPress={() => setSelectedIssue(tag)}
            >
              <Text
                style={[
                  styles.issueChipText,
                  active && styles.issueChipTextActive,
                ]}
              >
                {tag}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.addTagRow}>
        <TextInput
          style={styles.addTagInput}
          value={newTagInput}
          onChangeText={setNewTagInput}
          placeholder={`新增【${selectedTrade}】常用缺失標籤（自動存 SQLite）...`}
          placeholderTextColor={IOS_THEME.colors.textMuted}
        />
        <Pressable
          style={styles.addTagBtn}
          onPress={handleAddCustomIssueTag}
        >
          <Text style={styles.addTagBtnText}>➕ 新增標籤</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.noteInput}
        value={customNote}
        onChangeText={setCustomNote}
        placeholder="選填補充說明（例如：落水頭周邊坡度重抓、移高 15cm）..."
        placeholderTextColor={IOS_THEME.colors.textMuted}
      />

      <View style={styles.canvasHeaderRow}>
        <Text style={styles.sectionTitle}>
          2. 直接點擊照片任意位置釘上紅點 #{pins.length + 1}
        </Text>
        {pins.length > 0 && (
          <Pressable onPress={handleClearAllPins}>
            <Text style={styles.clearLink}>清空紅點</Text>
          </Pressable>
        )}
      </View>

      <Pressable
        style={styles.photoCanvas}
        onLayout={handleCanvasLayout}
        onPress={handleTapPhotoCanvas}
      >
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={styles.photoImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.emptyPhotoFallback}>
            <Text style={styles.emptyPhotoIcon}>📷</Text>
            <Text style={styles.emptyPhotoTitle}>
              尚未選取照片（目前為案場示意底圖）
            </Text>
            <Text style={styles.emptyPhotoSub}>
              可點上方「現場拍照／從相簿選照片」，或直接點擊此處測試釘紅點！
            </Text>
          </View>
        )}

        {pins.map((pin) => (
          <View
            key={pin.id}
            pointerEvents="none"
            style={[
              styles.floatingPin,
              {
                left: `${pin.xPercent}%`,
                top: `${pin.yPercent}%`,
              },
            ]}
          >
            <Text style={styles.floatingPinText}>📍{pin.number}</Text>
          </View>
        ))}
      </Pressable>
      <Text style={styles.privacyHint}>
        🔒 隱私保護：案場照片僅儲存於您的手機本機，絕不外傳至任何雲端伺服器。
      </Text>

      <Text style={styles.sectionTitle}>
        3. 本張照片已標註紅點（共 {pins.length} 處・已自動存檔）
      </Text>
      {pins.map((pin) => (
        <View key={pin.id} style={styles.pinItemCard}>
          <View style={styles.pinItemLeft}>
            <View style={styles.pinNumberCircle}>
              <Text style={styles.pinNumberText}>{pin.number}</Text>
            </View>
            <View style={styles.pinDetailWrap}>
              <Text style={styles.pinItemTitle}>
                【{pin.trade}】{pin.issueTag}（座標 {pin.xPercent}%,{' '}
                {pin.yPercent}%）
              </Text>
              <Text style={styles.pinItemNote}>{pin.note}</Text>
            </View>
          </View>
          <Pressable
            style={styles.deleteBtn}
            onPress={() => handleRemovePin(pin.id)}
          >
            <Text style={styles.deleteBtnText}>刪除</Text>
          </Pressable>
        </View>
      ))}

      <Pressable
        style={styles.aiPolishBtn}
        onPress={() => void handleAiPolishReport()}
      >
        <Text style={styles.aiPolishBtnText}>
          {isPolishing
            ? '⏳ Strata AI 正在潤飾派工單並補充驗收規範...'
            : '🤖 請 Strata AI 潤飾下方派工單並補充各工種驗收提醒'}
        </Text>
      </Pressable>

      <PinpointHistorySection
        reportText={activeReportText}
        historyRecords={historyRecords}
        onSaveToHistory={handleSaveToHistory}
        onRestoreHistory={handleRestoreHistory}
        onDeleteHistory={handleDeleteHistory}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: IOS_THEME.spacing.md, paddingBottom: 40 },
  heroCard: {
    backgroundColor: '#4A3B32',
    borderRadius: IOS_THEME.radius.lg,
    padding: IOS_THEME.spacing.md,
    marginBottom: IOS_THEME.spacing.md,
  },
  heroTag: {
    color: '#E6CCB8',
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
    color: '#EFE5DC',
    fontSize: 13,
    lineHeight: 19,
  },
  projectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.sm,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 10,
  },
  projectLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: IOS_THEME.colors.textSecondary,
    marginRight: 8,
  },
  projectInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: IOS_THEME.colors.primary,
    paddingVertical: 4,
  },
  photoActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: IOS_THEME.spacing.md,
  },
  cameraBtn: {
    flex: 1,
    backgroundColor: IOS_THEME.colors.primary,
    borderRadius: IOS_THEME.radius.sm,
    minHeight: IOS_THEME.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  albumBtn: {
    flex: 1,
    backgroundColor: IOS_THEME.colors.accent,
    borderRadius: IOS_THEME.radius.sm,
    minHeight: IOS_THEME.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: IOS_THEME.colors.textMain,
    marginBottom: 8,
    marginTop: 4,
  },
  tradeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  tradePill: {
    backgroundColor: IOS_THEME.colors.card,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: IOS_THEME.radius.pill,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
  },
  tradePillActive: {
    backgroundColor: IOS_THEME.colors.primary,
    borderColor: IOS_THEME.colors.primary,
  },
  tradePillText: {
    fontSize: 13,
    fontWeight: '700',
    color: IOS_THEME.colors.textMain,
  },
  tradePillTextActive: { color: '#FFFFFF' },
  issueRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  issueChip: {
    backgroundColor: IOS_THEME.colors.cardAlt,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: IOS_THEME.radius.sm,
  },
  issueChipActive: { backgroundColor: IOS_THEME.colors.accent },
  issueChipText: {
    fontSize: 12,
    color: IOS_THEME.colors.textMain,
    fontWeight: '600',
  },
  issueChipTextActive: { color: '#FFFFFF' },
  addTagRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  addTagInput: {
    flex: 1,
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.sm,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12,
    color: IOS_THEME.colors.textMain,
  },
  addTagBtn: {
    backgroundColor: IOS_THEME.colors.primary,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: IOS_THEME.radius.sm,
  },
  addTagBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  noteInput: {
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.sm,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: IOS_THEME.colors.textMain,
    marginBottom: IOS_THEME.spacing.md,
  },
  canvasHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearLink: {
    fontSize: 12,
    fontWeight: '700',
    color: IOS_THEME.colors.danger,
  },
  photoCanvas: {
    width: '100%',
    height: 240,
    backgroundColor: '#24303C',
    borderRadius: IOS_THEME.radius.lg,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 2,
    borderColor: IOS_THEME.colors.accent,
  },
  photoImage: { width: '100%', height: '100%' },
  emptyPhotoFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyPhotoIcon: { fontSize: 34, marginBottom: 8 },
  emptyPhotoTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  emptyPhotoSub: {
    color: '#B5C7D8',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  floatingPin: {
    position: 'absolute',
    backgroundColor: IOS_THEME.colors.danger,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: IOS_THEME.radius.pill,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    transform: [{ translateX: -18 }, { translateY: -14 }],
  },
  floatingPinText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  privacyHint: {
    fontSize: 11,
    color: IOS_THEME.colors.textSecondary,
    marginTop: 6,
    marginBottom: 12,
  },
  pinItemCard: {
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.md,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
  },
  pinItemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  pinNumberCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: IOS_THEME.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  pinNumberText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  pinDetailWrap: { flex: 1 },
  pinItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: IOS_THEME.colors.textMain,
    marginBottom: 2,
  },
  pinItemNote: { fontSize: 12, color: IOS_THEME.colors.textSecondary },
  deleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: IOS_THEME.colors.dangerBg,
    borderRadius: IOS_THEME.radius.sm,
    marginLeft: 8,
  },
  deleteBtnText: {
    color: IOS_THEME.colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  aiPolishBtn: {
    backgroundColor: IOS_THEME.colors.primary,
    borderRadius: IOS_THEME.radius.sm,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 6,
  },
  aiPolishBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
