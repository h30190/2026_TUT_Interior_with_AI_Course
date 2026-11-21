import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { searchAllChatMessagesInSQLite } from '../services/storage';
import { IOS_THEME } from '../theme/iosTheme';
import {
  ChatConversationSummary,
  ChatSearchResultItem,
} from '../types/agent';

interface Props {
  conversations: ChatConversationSummary[];
  activeConvId: number;
  onSelectConversation: (convId: number, targetMessageId?: number) => void;
  onDeleteSingleConv: (conv: ChatConversationSummary) => void;
}

export function ChatConversationList({
  conversations,
  activeConvId,
  onSelectConversation,
  onDeleteSingleConv,
}: Props) {
  const [searchQuery, setSearchQuery] = useState<string>('');

  const searchResults = useMemo<ChatSearchResultItem[]>(
    () => searchAllChatMessagesInSQLite(searchQuery),
    [searchQuery]
  );

  return (
    <View style={styles.listLayer}>
      <View style={styles.searchBoxWrap}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="🔍 全文搜尋所有對話內容（點擊結果直接跳到該訊息）..."
          placeholderTextColor={IOS_THEME.colors.textMuted}
        />
        {searchQuery.length > 0 && (
          <Pressable
            style={styles.clearSearchBtn}
            onPress={() => setSearchQuery('')}
          >
            <Text style={styles.clearSearchText}>清除</Text>
          </Pressable>
        )}
      </View>

      {searchQuery.trim().length > 0 ? (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => `search-${item.messageId}`}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <Text style={styles.listSectionLabel}>
              🔍 全文搜尋結果（共 {searchResults.length} 則匹配，點擊直接跳到該訊息位置）
            </Text>
          }
          ListEmptyComponent={
            <Text style={styles.emptyHint}>
              找不到包含「{searchQuery}」的對話訊息。
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.searchResultCard}
              onPress={() =>
                onSelectConversation(item.conversationId, item.messageId)
              }
            >
              <View style={styles.searchResultHeader}>
                <Text style={styles.searchConvTitle} numberOfLines={1}>
                  📁 {item.conversationTitle}
                </Text>
                <Text style={styles.searchRoleBadge}>
                  {item.role === 'user' ? '設計師提問' : '助理回覆'} ・{' '}
                  {item.createdAt}
                </Text>
              </View>
              <Text style={styles.searchSnippet} numberOfLines={2}>
                {item.content}
              </Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => `conv-${item.id}`}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <Text style={styles.listSectionLabel}>
              💬 所有歷史對話（點選續聊・長按或點右側按鈕可刪除單場）
            </Text>
          }
          renderItem={({ item }) => {
            const isCurrent = item.id === activeConvId;
            return (
              <Pressable
                style={[styles.convCard, isCurrent && styles.convCardActive]}
                onPress={() => onSelectConversation(item.id)}
                onLongPress={() => onDeleteSingleConv(item)}
              >
                <View style={styles.convInfo}>
                  <View style={styles.convTitleRow}>
                    <Text
                      style={[
                        styles.convTitle,
                        isCurrent && styles.convTitleActive,
                      ]}
                      numberOfLines={1}
                    >
                      {isCurrent ? '🟢 ' : ''}
                      {item.title}
                    </Text>
                    <Text style={styles.convTime}>{item.updatedAt}</Text>
                  </View>
                  <Text style={styles.convLastMsg} numberOfLines={1}>
                    {item.lastMessage}
                  </Text>
                </View>
                <Pressable
                  style={styles.convDelBtn}
                  onPress={() => onDeleteSingleConv(item)}
                >
                  <Text style={styles.convDelText}>刪除</Text>
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  listLayer: {
    flex: 1,
  },
  searchBoxWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: IOS_THEME.spacing.md,
    paddingTop: 12,
    paddingBottom: 6,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.sm,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: IOS_THEME.colors.textMain,
  },
  clearSearchBtn: {
    backgroundColor: IOS_THEME.colors.cardAlt,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: IOS_THEME.radius.sm,
  },
  clearSearchText: {
    fontSize: 12,
    fontWeight: '700',
    color: IOS_THEME.colors.textSecondary,
  },
  listContent: {
    padding: IOS_THEME.spacing.md,
    paddingBottom: 32,
  },
  listSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: IOS_THEME.colors.textSecondary,
    marginBottom: 10,
  },
  emptyHint: {
    fontSize: 13,
    color: IOS_THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: 24,
  },
  searchResultCard: {
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.md,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: IOS_THEME.colors.accent,
  },
  searchResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  searchConvTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: IOS_THEME.colors.primary,
    flex: 1,
    marginRight: 8,
  },
  searchRoleBadge: {
    fontSize: 11,
    color: IOS_THEME.colors.accent,
    fontWeight: '600',
  },
  searchSnippet: {
    fontSize: 13,
    color: IOS_THEME.colors.textMain,
    lineHeight: 19,
  },
  convCard: {
    backgroundColor: IOS_THEME.colors.card,
    borderRadius: IOS_THEME.radius.md,
    padding: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: IOS_THEME.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  convCardActive: {
    borderColor: IOS_THEME.colors.accent,
    backgroundColor: IOS_THEME.colors.accentSoft,
  },
  convInfo: {
    flex: 1,
    marginRight: 10,
  },
  convTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  convTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: IOS_THEME.colors.textMain,
    flex: 1,
    marginRight: 8,
  },
  convTitleActive: {
    color: IOS_THEME.colors.primary,
  },
  convTime: {
    fontSize: 11,
    color: IOS_THEME.colors.textSecondary,
  },
  convLastMsg: {
    fontSize: 12,
    color: IOS_THEME.colors.textSecondary,
  },
  convDelBtn: {
    backgroundColor: IOS_THEME.colors.dangerBg,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: IOS_THEME.radius.sm,
  },
  convDelText: {
    color: IOS_THEME.colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
});
