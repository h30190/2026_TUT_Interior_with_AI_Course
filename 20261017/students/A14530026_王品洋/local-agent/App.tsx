import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Config, Msg, listModels, runAgent } from './src/agent';
import { loadConfig, saveConfig } from './src/storage';

// OpenAI 相容端點（要含 /v1）。LM Studio 預設埠 1234、Ollama 11434。
// Android 模擬器用 10.0.2.2 連到電腦；實體手機請改成電腦的區網 IP。
const DEFAULT_URL = Platform.OS === 'android' ? 'http://10.0.2.2:1234/v1' : 'http://192.168.1.100:1234/v1';

const DEFAULT_CONFIG: Config = { baseUrl: DEFAULT_URL, model: '', apiKey: '', mock: true };

export default function App() {
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);

  // 啟動時讀取已儲存的設定；讀完之後，每次設定改變都自動儲存。
  useEffect(() => {
    loadConfig(DEFAULT_CONFIG).then((c) => {
      setCfg(c);
      setLoaded(true);
    });
  }, []);
  useEffect(() => {
    if (loaded) saveConfig(cfg);
  }, [cfg, loaded]);
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<FlatList<Msg>>(null);

  const [showKey, setShowKey] = useState(false);
  const key = cfg.apiKey.trim();
  const keyLooksWrong = cfg.baseUrl.includes('nvidia.com') && key.length > 0 && !(key.startsWith('nvapi-') && key.length >= 60);

  // 模型下拉選單
  const [models, setModels] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState('');

  const filteredModels = models.filter((m) => m.toLowerCase().includes(filter.trim().toLowerCase()));

  async function openPicker() {
    setPickerOpen(true);
    setFilter('');
    setModelError('');
    if (models.length) return;
    setLoadingModels(true);
    try {
      setModels(await listModels(cfg));
    } catch (e) {
      setModelError(`${e instanceof Error ? e.message : String(e)}\n仍可在上方直接輸入模型名稱。`);
    } finally {
      setLoadingModels(false);
    }
  }

  function pickModel(model: string) {
    setCfg({ ...cfg, model });
    setPickerOpen(false);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    if (!cfg.mock && !cfg.model) {
      setError('請先到「設定」選擇模型，或開啟示範模式。');
      return;
    }
    const history: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(history);
    setInput('');
    setError('');
    setBusy(true);
    try {
      const added = await runAgent(cfg, history);
      setMessages([...history, ...added]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const visible = messages.filter((m) => m.role !== 'assistant' || m.content || !m.tool_calls);

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <Text style={s.title}>地端 AI Agent</Text>
        <Pressable onPress={() => setShowSettings(!showSettings)}>
          <Text style={s.link}>{showSettings ? '完成' : '設定'}</Text>
        </Pressable>
      </View>

      {showSettings && (
        <View style={s.settings}>
          <View style={s.switchRow}>
            <Text style={s.label}>示範模式（不連 AI，用於測試）</Text>
            <Switch value={cfg.mock} onValueChange={(mock) => setCfg({ ...cfg, mock })} />
          </View>
          <Text style={s.label}>端點位址（OpenAI 相容，例如 https://…/v1）</Text>
          <TextInput
            style={s.field}
            value={cfg.baseUrl}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(baseUrl) => {
              setCfg({ ...cfg, baseUrl });
              setModels([]);
            }}
          />
          <Text style={s.label}>
            API Key（本地伺服器可留空）・{cfg.apiKey.trim().length} 字元
          </Text>
          <View style={[s.field, s.keyRow]}>
            <TextInput
              style={s.keyInput}
              value={cfg.apiKey}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showKey}
              onChangeText={(apiKey) => {
                setCfg({ ...cfg, apiKey });
                setModels([]);
              }}
            />
            <Pressable
              onPress={() => setShowKey(!showKey)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={showKey ? '隱藏 API Key' : '顯示 API Key'}
            >
              <Text style={s.eye}>{showKey ? '🙈' : '👁️'}</Text>
            </Pressable>
          </View>
          {keyLooksWrong && (
            <Text style={s.error}>這不像 NVIDIA 的金鑰：通常以 nvapi- 開頭，長度約 70 字元。</Text>
          )}
          <Text style={s.label}>模型</Text>
          <Pressable style={[s.field, s.dropdown]} onPress={openPicker}>
            <Text style={{ flex: 1, color: cfg.model ? '#111' : '#999' }} numberOfLines={1}>
              {cfg.model || '點此選擇模型'}
            </Text>
            <Text style={{ color: '#666' }}>▼</Text>
          </Pressable>
        </View>
      )}

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <SafeAreaView style={s.root}>
          <View style={s.header}>
            <Text style={s.title}>選擇模型</Text>
            <Pressable onPress={() => setPickerOpen(false)}>
              <Text style={s.link}>關閉</Text>
            </Pressable>
          </View>
          <View style={{ paddingHorizontal: 14, gap: 8 }}>
            <TextInput
              style={s.field}
              value={filter}
              onChangeText={setFilter}
              placeholder="搜尋，或直接輸入模型名稱"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {loadingModels && <ActivityIndicator />}
            {!!modelError && <Text style={s.error}>{modelError}</Text>}
          </View>
          <FlatList
            data={filteredModels}
            keyExtractor={(m) => m}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 14 }}
            ListHeaderComponent={
              filter.trim() && !models.includes(filter.trim()) ? (
                <Pressable style={s.option} onPress={() => pickModel(filter.trim())}>
                  <Text style={s.optionText}>使用「{filter.trim()}」</Text>
                </Pressable>
              ) : undefined
            }
            renderItem={({ item }) => (
              <Pressable style={[s.option, item === cfg.model && s.optionActive]} onPress={() => pickModel(item)}>
                <Text style={s.optionText}>{item}</Text>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={visible}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: 12 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={<Text style={s.empty}>試試問：「現在幾點？」或「(12+3)*4 等於多少？」</Text>}
          renderItem={({ item }) =>
            item.role === 'tool' ? (
              <Text style={s.tool}>🔧 {item.name}：{item.content}</Text>
            ) : item.role === 'assistant' && !item.content ? null : (
              <View style={[s.bubble, item.role === 'user' ? s.user : s.bot]}>
                <Text style={item.role === 'user' ? s.userText : s.botText}>{item.content}</Text>
              </View>
            )
          }
        />
        {busy && <ActivityIndicator style={{ margin: 8 }} />}
        {!!error && <Text style={s.error}>{error}</Text>}
        <View style={s.inputRow}>
          <TextInput
            style={[s.field, { flex: 1 }]}
            value={input}
            onChangeText={setInput}
            placeholder="輸入訊息…"
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <Pressable style={[s.sendBtn, busy && { opacity: 0.5 }]} onPress={send} disabled={busy}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>送出</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f6f6f8', paddingTop: Platform.OS === 'android' ? 28 : 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  title: { fontSize: 20, fontWeight: '700' },
  link: { color: '#2563eb', fontSize: 16 },
  settings: { paddingHorizontal: 14, paddingBottom: 10 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 12, color: '#666', marginTop: 6 },
  field: { backgroundColor: '#fff', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#ddd' },
  keyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 0, gap: 8 },
  keyInput: { flex: 1, paddingVertical: 10 },
  eye: { fontSize: 20 },
  dropdown: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  option: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#e5e5e5' },
  optionActive: { borderColor: '#2563eb', backgroundColor: '#eff4ff' },
  optionText: { fontSize: 15, color: '#111' },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
  bubble: { maxWidth: '85%', padding: 10, borderRadius: 14, marginVertical: 4 },
  user: { alignSelf: 'flex-end', backgroundColor: '#2563eb' },
  bot: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e5e5' },
  userText: { color: '#fff', fontSize: 16 },
  botText: { color: '#111', fontSize: 16 },
  tool: { alignSelf: 'flex-start', color: '#888', fontSize: 12, marginVertical: 2 },
  error: { color: '#b91c1c', paddingHorizontal: 14, paddingBottom: 6 },
  inputRow: { flexDirection: 'row', gap: 8, padding: 10 },
  sendBtn: { backgroundColor: '#2563eb', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
});
