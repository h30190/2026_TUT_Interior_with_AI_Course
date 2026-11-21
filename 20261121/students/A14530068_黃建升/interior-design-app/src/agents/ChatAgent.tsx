import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ChatConversationList } from '../components/ChatConversationList';
import { sendChatConverseMessages } from '../services/lobsterBridge';
import {
  appendMessageToConversationInSQLite,
  createNewConversationInSQLite,
  deleteSingleConversationFromSQLite,
  loadConversationsFromSQLite,
  loadMessagesForConversationFromSQLite,
} from '../services/storage';
import { IOS_THEME } from '../theme/iosTheme';
import {
  ChatConversationSummary,
  ChatMessageItem,
  LobsterBridgeConfig,
} from '../types/agent';

interface Props {
  bridgeConfig: LobsterBridgeConfig;
}

export function ChatAgent({ bridgeConfig }: Props) {
  const [conversations, setConversations] = useState<ChatConversationSummary[]>(
    () => loadConversationsFromSQLite()
  );
  const [activeConvId, setActiveConvId] = useState<number>(
    () => conversations[0]?.id ?? 1
  );
  const [messages, setMessages] = useState<ChatMessageItem[]>(() =>
    loadMessagesForConversationFromSQLite(conversations[0]?.id ?? 1)
  );

  const [layer, setLayer] = useState<'chat' | 'list'>('chat');
  const [inputText, setInputText] = useState<string>('');
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState<number | null>(null);

  const flatListRef = useRef<FlatList<ChatMessageItem>>(null);

  const invertedMessages = useMemo(
    () => [...messages].reverse(),
    [messages]
  );

  const currentConv =
    conversations.find((c) => c.id === activeConvId) ?? conversations[0];

  const handleSelectConversation = (
    convId: number,
    targetMessageId?: number
  ) => {
    const loadedMsgs = loadMessagesForConversationFromSQLite(convId);
    setActiveConvId(convId);
    setMessages(loadedMsgs);
    setHighlightedMsgId(targetMessageId ?? null);
    setLayer('chat');

    if (targetMessageId) {
      const rev = [...loadedMsgs].reverse();
      const targetIdx = rev.findIndex((m) => m.id === targetMessageId);
      if (targetIdx >= 0) {
        setTimeout(() => {
          try {
            flatListRef.current?.scrollToIndex({
              index: targetIdx,
              animated: true,
              viewPosition: 0.5,
            });
          } catch {
            // ignore scroll index boundary
          }
        }, 180);
      }
    }
  };

  const handleNewConversation = () => {
    const created = createNewConversationInSQLite();
    const updatedConvs = loadConversationsFromSQLite();
    const loadedMsgs = loadMessagesForConversationFromSQLite(created.id);
    setConversations(updatedConvs);
    setActiveConvId(created.id);
    setMessages(loadedMsgs);
    setHighlightedMsgId(null);
    setLayer('chat');
  };

  const handleConfirmDeleteSingleConv = (conv: ChatConversationSummary) => {
    Alert.alert('刪除此場對話', `確定要刪除「${conv.title}」嗎？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除此場',
        style: 'destructive',
        onPress: () => {
          const nextConvs = deleteSingleConversationFromSQLite(conv.id);
          setConversations(nextConvs);
          if (conv.id === activeConvId && nextConvs.length > 0) {
            const fallbackId = nextConvs[0].id;
            setActiveConvId(fallbackId);
            setMessages(loadMessagesForConversationFromSQLite(fallbackId));
          }
        },
      },
    ]);
  };

  const handleSendMessage = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || isThinking) {
      return;
    }

    setInputText('');
    setHighlightedMsgId(null);

    const afterUser = appendMessageToConversationInSQLite(
      activeConvId,
      'user',
      trimmed
    );
    setMessages(afterUser.messages);
    setConversations(afterUser.conversations);

    setIsThinking(true);
    const replyText = await sendChatConverseMessages(
      afterUser.messages,
      bridgeConfig
    );

    const afterAi = appendMessageToConversationInSQLite(
      activeConvId,
      'assistant',
      replyText
    );
    setMessages(afterAi.messages);
    setConversations(afterAi.conversations);
    setIsThinking(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable
          style={[
            styles.listToggleBtn,
            layer === 'list' && styles.listToggleBtnActive,
          ]}
          onPress={() =>
            setLayer((prev) => (prev === 'chat' ? 'list' : 'chat'))
          }
        >
          <Text
            style={[
              styles.listToggleText,
              layer === 'list' && styles.listToggleTextActive,
            ]}
          >
            {layer === 'chat'
              ? `🗂️ 對話列表 (${conversations.length})`
              : '◀ 返回對話'}
          </Text>
        </Pressable>

        <Text style={styles.convHeaderTitle} numberOfLines={1}>
          {currentConv?.title || '新對話'}
        </Text>

        <Pressable style={styles.newConvBtn} onPress={handleNewConversation}>
          <Text style={styles.newConvBtnText}>＋新對話</Text>
        </Pressable>
      </View>

      {layer === 'list' ? (
        <ChatConversationList
          conversations={conversations}
          activeConvId={activeConvId}
          onSelectConversation={handleSelectConversation}
          onDeleteSingleConv={handleConfirmDeleteSingleConv}
        />
      ) : (
        <View style={styles.chatLayer}>
          <FlatList
            ref={flatListRef}
            data={invertedMessages}
            inverted
            keyExtractor={(item) => `msg-${item.id}`}
            contentContainerStyle={styles.chatListContent}
            keyboardShouldPersistTaps="handled"
            onScrollToIndexFailed={() => {
              // ignore
            }}
            ListHeaderComponent={
              isThinking ? (
                <View style={[styles.bubbleRow, styles.bubbleRowLeft]}>
                  <View style={[styles.bubble, styles.aiBubble]}>
                    <Text style={styles.thinkingText}>⋯ 思考中</Text>
                  </View>
                </View>
              ) : undefined
            }
            renderItem={({ item }) => {
              const isUser = item.role === 'user';
              const isHighlighted = item.id === highlightedMsgId;
              return (
                <View
                  style={[
                    styles.bubbleRow,
                    isUser ? styles.bubbleRowRight : styles.bubbleRowLeft,
                  ]}
                >
                  <View
                    style={[
                      styles.bubble,
                      isUser ? styles.userBubble : styles.aiBubble,
                      isHighlighted && styles.highlightedBubble,
                    ]}
                  >
                    {isHighlighted && (
                      <Text style={styles.highlightTag}>🔍 搜尋定位訊息</Text>
                    )}
                    <Text
                      style={[
                        styles.bubbleText,
                        isUser ? styles.userBubbleText : styles.aiBubbleText,
                      ]}
                      selectable
                    >
                      {item.content}
                    </Text>
                    <Text
                      style={[
                        styles.bubbleTime,
                        isUser ? styles.userBubbleTime : styles.aiBubbleTime,
                      ]}
                    >
                      {isUser ? '黃設計師' : '工務助理'} ・ {item.createdAt}
                    </Text>
                  </View>
                </View>
              );
            }}
          />

          <View style={styles.inputBar}>
            <TextInput
              style={styles.chatInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="問問工務助理（施工、材料、尺寸、預算）..."
              placeholderTextColor={IOS_THEME.colors.textMuted}
              multiline
              maxLength={800}
            />
            <Pressable
              style={[
                styles.sendBtn,
                (!inputText.trim() || isThinking) && styles.sendBtnDisabled,
              ]}
              onPress={() => void handleSendMessage()}
              disabled={!inputText.trim() || isThinking}
            >
              <Text style={styles.sendBtnText}>發送</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: IOS_THEME.colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: IOS_THEME.spacing.md,
    paddingVertical: 10,
    backgroundColor: IOS_THEME.colors.cardAlt,
    borderBottomWidth: 1,
    borderBottomColor: IOS_THEME.colors.border,
  },
  listToggleBtn: {
    backgroundColor: IOS_THEME.colors.card,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: IOS_THEME.radius.sm,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
  },
  listToggleBtnActive: {
    backgroundColor: IOS_THEME.colors.primary,
    borderColor: IOS_THEME.colors.primary,
  },
  listToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: IOS_THEME.colors.primary,
  },
  listToggleTextActive: {
    color: '#FFFFFF',
  },
  convHeaderTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: IOS_THEME.colors.textMain,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  newConvBtn: {
    backgroundColor: IOS_THEME.colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: IOS_THEME.radius.sm,
  },
  newConvBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  chatLayer: {
    flex: 1,
  },
  chatListContent: {
    paddingHorizontal: IOS_THEME.spacing.md,
    paddingVertical: 14,
  },
  bubbleRow: {
    marginVertical: 5,
    flexDirection: 'row',
  },
  bubbleRowRight: {
    justifyContent: 'flex-end',
  },
  bubbleRowLeft: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: IOS_THEME.colors.primary,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: IOS_THEME.colors.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
  },
  highlightedBubble: {
    borderWidth: 2,
    borderColor: IOS_THEME.colors.warning,
    backgroundColor: IOS_THEME.colors.warningBg,
  },
  highlightTag: {
    fontSize: 11,
    fontWeight: '800',
    color: IOS_THEME.colors.warning,
    marginBottom: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 21,
  },
  userBubbleText: {
    color: '#FFFFFF',
  },
  aiBubbleText: {
    color: IOS_THEME.colors.textMain,
  },
  bubbleTime: {
    fontSize: 10,
    marginTop: 5,
  },
  userBubbleTime: {
    color: '#C5D1CC',
    textAlign: 'right',
  },
  aiBubbleTime: {
    color: IOS_THEME.colors.textMuted,
  },
  thinkingText: {
    fontSize: 14,
    fontWeight: '700',
    color: IOS_THEME.colors.accent,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: IOS_THEME.spacing.md,
    paddingVertical: 10,
    backgroundColor: IOS_THEME.colors.card,
    borderTopWidth: 1,
    borderTopColor: IOS_THEME.colors.border,
    gap: 8,
  },
  chatInput: {
    flex: 1,
    backgroundColor: IOS_THEME.colors.background,
    borderRadius: IOS_THEME.radius.md,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: IOS_THEME.colors.textMain,
    maxHeight: 96,
  },
  sendBtn: {
    backgroundColor: IOS_THEME.colors.primary,
    borderRadius: IOS_THEME.radius.md,
    paddingHorizontal: 16,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: IOS_THEME.colors.textMuted,
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
