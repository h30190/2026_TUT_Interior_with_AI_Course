import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  loadThesisEventsFromSQLite,
  removeThesisEventFromSQLite,
  upsertThesisEventInSQLite,
} from '../services/storage';
import { IOS_THEME } from '../theme/iosTheme';
import { BathroomFloorDecisionEvent } from '../types/agent';

export function ThesisDecisionSection() {
  const [events, setEvents] = useState<BathroomFloorDecisionEvent[]>(() =>
    loadThesisEventsFromSQLite()
  );
  const [showForm, setShowForm] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [phase, setPhase] = useState<string>('');
  const [scenario, setScenario] = useState<string>('');
  const [criteria, setCriteria] = useState<string>('');
  const [action, setAction] = useState<string>('');
  const [bimParameter, setBimParameter] = useState<string>('');

  const handleOpenCreate = () => {
    setEditingId(undefined);
    setPhase('');
    setScenario('');
    setCriteria('');
    setAction('');
    setBimParameter('');
    setShowForm(true);
  };

  const handleOpenEdit = (ev: BathroomFloorDecisionEvent) => {
    setEditingId(ev.id);
    setPhase(ev.phase);
    setScenario(ev.scenario);
    setCriteria(ev.criteria);
    setAction(ev.action);
    setBimParameter(ev.bimParameter);
    setShowForm(true);
  };

  const handleSaveEvent = () => {
    if (!scenario.trim() || !action.trim()) {
      Alert.alert('欄位提示', '請至少填寫「現場情境」與「處理方式」。');
      return;
    }
    const next = upsertThesisEventInSQLite({
      id: editingId,
      phase: phase || '浴室地坪泥作決策',
      scenario,
      criteria: criteria || '依現場高程與排水條件判斷',
      action,
      bimParameter: bimParameter || 'IfcSlab / Pset_BathroomFloor_Decision',
      isPlaceholder: false,
    });
    setEvents(next);
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    const next = removeThesisEventFromSQLite(id);
    setEvents(next);
  };

  return (
    <View>
      <View style={styles.thesisBanner}>
        <Text style={styles.thesisBannerTitle}>
          🎓 碩士論文：〈住宅浴室地坪泥作之現場決策知識與 BIM 承載可行性〉
        </Text>
        <Text style={styles.thesisBannerDesc}>
          支援直接在手機上新增、編輯與刪除論文現場決策事件（自動寫入 SQLite 永久保存，重開不消失）。
        </Text>
        <Pressable
          style={styles.addBtn}
          onPress={() => (showForm ? setShowForm(false) : handleOpenCreate())}
        >
          <Text style={styles.addBtnText}>
            {showForm ? '✕ 收起編輯表單' : '➕ 新增浴室地坪論文決策事件'}
          </Text>
        </Pressable>
      </View>

      {showForm && (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>
            {editingId ? '✏️ 編輯論文決策事件' : '➕ 新增論文決策事件'}
          </Text>
          <TextInput
            style={styles.input}
            value={phase}
            onChangeText={setPhase}
            placeholder="工序階段（如：地坪打底高程／洩水坡度放樣）"
            placeholderTextColor={IOS_THEME.colors.textMuted}
          />
          <TextInput
            style={styles.input}
            value={scenario}
            onChangeText={setScenario}
            multiline
            placeholder="1. 現場情境 (Scenario)..."
            placeholderTextColor={IOS_THEME.colors.textMuted}
          />
          <TextInput
            style={styles.input}
            value={criteria}
            onChangeText={setCriteria}
            multiline
            placeholder="2. 判斷依據 (Criteria)..."
            placeholderTextColor={IOS_THEME.colors.textMuted}
          />
          <TextInput
            style={styles.input}
            value={action}
            onChangeText={setAction}
            multiline
            placeholder="3. 處理方式 (Action)..."
            placeholderTextColor={IOS_THEME.colors.textMuted}
          />
          <TextInput
            style={styles.input}
            value={bimParameter}
            onChangeText={setBimParameter}
            placeholder="4. BIM 承載參數／Ifc 屬性欄位..."
            placeholderTextColor={IOS_THEME.colors.textMuted}
          />
          <Pressable style={styles.saveBtn} onPress={handleSaveEvent}>
            <Text style={styles.saveBtnText}>💾 儲存至本機 SQLite 資料庫</Text>
          </Pressable>
        </View>
      )}

      {events.map((ev) => (
        <View key={ev.id} style={styles.thesisCard}>
          <View style={styles.thesisCardHeader}>
            <Text style={styles.thesisPhase}>{ev.phase}</Text>
            <View style={styles.headerRightRow}>
              <View style={styles.placeholderBadge}>
                <Text style={styles.placeholderBadgeText}>
                  {ev.isPlaceholder ? '範例結構' : '已錄入論文資料'}
                </Text>
              </View>
              <Pressable
                style={styles.editPill}
                onPress={() => handleOpenEdit(ev)}
              >
                <Text style={styles.editPillText}>編輯</Text>
              </Pressable>
              <Pressable
                style={styles.delPill}
                onPress={() => handleDelete(ev.id)}
              >
                <Text style={styles.delPillText}>刪除</Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.thesisFieldLabel}>📍 1. 現場情境 (Scenario)</Text>
          <Text style={styles.thesisFieldValue}>{ev.scenario}</Text>

          <Text style={styles.thesisFieldLabel}>🔍 2. 判斷依據 (Criteria)</Text>
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
    marginBottom: 4,
  },
  thesisBannerDesc: {
    fontSize: 12,
    lineHeight: 18,
    color: IOS_THEME.colors.textMain,
    marginBottom: 10,
  },
  addBtn: {
    backgroundColor: IOS_THEME.colors.primary,
    borderRadius: IOS_THEME.radius.sm,
    paddingVertical: 9,
    alignItems: 'center',
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  formCard: {
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.md,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: IOS_THEME.colors.accent,
  },
  formTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: IOS_THEME.colors.primary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: IOS_THEME.colors.background,
    borderRadius: IOS_THEME.radius.sm,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: IOS_THEME.colors.textMain,
    marginBottom: 8,
  },
  saveBtn: {
    backgroundColor: IOS_THEME.colors.accent,
    borderRadius: IOS_THEME.radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
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
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  thesisPhase: {
    fontSize: 14,
    fontWeight: '800',
    color: IOS_THEME.colors.primary,
    flex: 1,
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  placeholderBadge: {
    backgroundColor: IOS_THEME.colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: IOS_THEME.radius.pill,
  },
  placeholderBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: IOS_THEME.colors.accent,
  },
  editPill: {
    backgroundColor: IOS_THEME.colors.cardAlt,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: IOS_THEME.radius.sm,
  },
  editPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: IOS_THEME.colors.primary,
  },
  delPill: {
    backgroundColor: IOS_THEME.colors.dangerBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: IOS_THEME.radius.sm,
  },
  delPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: IOS_THEME.colors.danger,
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
