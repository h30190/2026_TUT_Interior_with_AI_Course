import {
  ChatConversationSummary,
  ChatMessageItem,
  ChatRole,
  ChatSearchResultItem,
} from '../../types/agent';
import { formatNowTimestamp, getDb } from './sqliteClient';

const WELCOME_ASSISTANT_GREETING =
  '黃設計師你好！我是氣韻居所的工務助理。你可以直接打字問我，或點左下角「＋／📷」拍照、上傳案場照片讓我幫你看圖分析！';

let fallbackConversations: ChatConversationSummary[] = [];
let fallbackMessages: ChatMessageItem[] = [];

export function loadConversationsFromSQLite(): ChatConversationSummary[] {
  const db = getDb();
  if (db) {
    try {
      const rows = db.getAllSync<{
        id: number;
        title: string;
        last_message: string;
        updated_at: string;
      }>(
        'SELECT id, title, last_message, updated_at FROM conversations ORDER BY id DESC'
      );
      if (rows.length === 0) {
        createNewConversationInSQLite();
        const freshRows = db.getAllSync<{
          id: number;
          title: string;
          last_message: string;
          updated_at: string;
        }>(
          'SELECT id, title, last_message, updated_at FROM conversations ORDER BY id DESC'
        );
        return freshRows.map((r) => ({
          id: r.id,
          title: r.title,
          lastMessage: r.last_message,
          updatedAt: r.updated_at,
        }));
      }
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        lastMessage: r.last_message,
        updatedAt: r.updated_at,
      }));
    } catch {
      // fallback below
    }
  }

  if (fallbackConversations.length === 0) {
    createNewConversationInSQLite();
  }
  return fallbackConversations;
}

export function createNewConversationInSQLite(): ChatConversationSummary {
  const nowStr = formatNowTimestamp();
  const initialTitle = '新對話';
  const db = getDb();

  if (db) {
    try {
      const res = db.runSync(
        'INSERT INTO conversations (title, last_message, updated_at) VALUES (?, ?, ?)',
        [initialTitle, WELCOME_ASSISTANT_GREETING, nowStr]
      );
      const convId = Number(res.lastInsertRowId);
      db.runSync(
        'INSERT INTO messages (conversation_id, role, content, image_uri, created_at) VALUES (?, ?, ?, ?, ?)',
        [convId, 'assistant', WELCOME_ASSISTANT_GREETING, null, nowStr]
      );
      return {
        id: convId,
        title: initialTitle,
        lastMessage: WELCOME_ASSISTANT_GREETING,
        updatedAt: nowStr,
      };
    } catch {
      // fallback below
    }
  }

  const nextId =
    fallbackConversations.length > 0 ? fallbackConversations[0].id + 1 : 1;
  const summary: ChatConversationSummary = {
    id: nextId,
    title: initialTitle,
    lastMessage: WELCOME_ASSISTANT_GREETING,
    updatedAt: nowStr,
  };
  fallbackConversations = [summary, ...fallbackConversations];
  fallbackMessages = [
    ...fallbackMessages,
    {
      id: fallbackMessages.length + 1,
      conversationId: nextId,
      role: 'assistant',
      content: WELCOME_ASSISTANT_GREETING,
      imageUri: null,
      createdAt: nowStr,
    },
  ];
  return summary;
}

export function loadMessagesForConversationFromSQLite(
  conversationId: number
): ChatMessageItem[] {
  const db = getDb();
  if (db) {
    try {
      const rows = db.getAllSync<{
        id: number;
        conversation_id: number;
        role: string;
        content: string;
        image_uri: string | null;
        created_at: string;
      }>(
        'SELECT id, conversation_id, role, content, image_uri, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC',
        [conversationId]
      );
      return rows.map((r) => ({
        id: r.id,
        conversationId: r.conversation_id,
        role: (r.role as ChatRole) || 'assistant',
        content: r.content,
        imageUri: r.image_uri,
        createdAt: r.created_at,
      }));
    } catch {
      // fallback below
    }
  }
  return fallbackMessages.filter((m) => m.conversationId === conversationId);
}

export function appendMessageToConversationInSQLite(
  conversationId: number,
  role: ChatRole,
  content: string,
  imageUri?: string | null
): {
  messages: ChatMessageItem[];
  conversations: ChatConversationSummary[];
} {
  const nowStr = formatNowTimestamp();
  const trimmedContent =
    content.trim() || (imageUri ? '📷 [已傳送現場照片]' : '');
  const cleanImageUri = imageUri ?? null;
  const db = getDb();

  if (db) {
    try {
      const existingUserMsg = db.getFirstSync<{ id: number }>(
        "SELECT id FROM messages WHERE conversation_id = ? AND role = 'user' LIMIT 1",
        [conversationId]
      );

      db.runSync(
        'INSERT INTO messages (conversation_id, role, content, image_uri, created_at) VALUES (?, ?, ?, ?, ?)',
        [conversationId, role, trimmedContent, cleanImageUri, nowStr]
      );

      if (role === 'user' && !existingUserMsg) {
        const autoTitle =
          trimmedContent.length > 24
            ? `${trimmedContent.slice(0, 24)}…`
            : trimmedContent;
        db.runSync(
          'UPDATE conversations SET title = ?, last_message = ?, updated_at = ? WHERE id = ?',
          [autoTitle, trimmedContent, nowStr, conversationId]
        );
      } else {
        db.runSync(
          'UPDATE conversations SET last_message = ?, updated_at = ? WHERE id = ?',
          [trimmedContent, nowStr, conversationId]
        );
      }

      return {
        messages: loadMessagesForConversationFromSQLite(conversationId),
        conversations: loadConversationsFromSQLite(),
      };
    } catch {
      // fallback below
    }
  }

  const hadUserMsg = fallbackMessages.some(
    (m) => m.conversationId === conversationId && m.role === 'user'
  );
  const newMsg: ChatMessageItem = {
    id: fallbackMessages.length + 1,
    conversationId,
    role,
    content: trimmedContent,
    imageUri: cleanImageUri,
    createdAt: nowStr,
  };
  fallbackMessages = [...fallbackMessages, newMsg];
  fallbackConversations = fallbackConversations.map((c) => {
    if (c.id !== conversationId) {
      return c;
    }
    const nextTitle =
      role === 'user' && !hadUserMsg ? trimmedContent.slice(0, 24) : c.title;
    return {
      ...c,
      title: nextTitle,
      lastMessage: trimmedContent,
      updatedAt: nowStr,
    };
  });

  return {
    messages: loadMessagesForConversationFromSQLite(conversationId),
    conversations: fallbackConversations,
  };
}

export function deleteSingleConversationFromSQLite(
  conversationId: number
): ChatConversationSummary[] {
  const db = getDb();
  if (db) {
    try {
      db.runSync('DELETE FROM messages WHERE conversation_id = ?', [
        conversationId,
      ]);
      db.runSync('DELETE FROM conversations WHERE id = ?', [conversationId]);
      return loadConversationsFromSQLite();
    } catch {
      // fallback below
    }
  }
  fallbackMessages = fallbackMessages.filter(
    (m) => m.conversationId !== conversationId
  );
  fallbackConversations = fallbackConversations.filter(
    (c) => c.id !== conversationId
  );
  if (fallbackConversations.length === 0) {
    createNewConversationInSQLite();
  }
  return fallbackConversations;
}

export function searchAllChatMessagesInSQLite(
  keyword: string
): ChatSearchResultItem[] {
  const cleaned = keyword.trim();
  if (!cleaned) {
    return [];
  }

  const db = getDb();
  if (db) {
    try {
      const pattern = `%${cleaned}%`;
      const rows = db.getAllSync<{
        message_id: number;
        conversation_id: number;
        conversation_title: string;
        role: string;
        content: string;
        created_at: string;
      }>(
        `SELECT m.id AS message_id, m.conversation_id, c.title AS conversation_title, m.role, m.content, m.created_at
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE m.content LIKE ? OR c.title LIKE ?
         ORDER BY m.id DESC
         LIMIT 40`,
        [pattern, pattern]
      );
      return rows.map((r) => ({
        messageId: r.message_id,
        conversationId: r.conversation_id,
        conversationTitle: r.conversation_title,
        role: (r.role as ChatRole) || 'assistant',
        content: r.content,
        createdAt: r.created_at,
      }));
    } catch {
      // fallback below
    }
  }

  const lower = cleaned.toLowerCase();
  return fallbackMessages
    .filter((m) => m.content.toLowerCase().includes(lower))
    .map((m) => {
      const conv = fallbackConversations.find(
        (c) => c.id === m.conversationId
      );
      return {
        messageId: m.id,
        conversationId: m.conversationId,
        conversationTitle: conv?.title || '對話',
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      };
    });
}
