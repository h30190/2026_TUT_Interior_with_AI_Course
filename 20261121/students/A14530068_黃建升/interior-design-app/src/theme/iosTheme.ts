import { Platform } from 'react-native';

/**
 * 氣韻居所 (Qi-Yun Living) 品牌色系與 Apple iOS HIG 設計規範常數
 */
export const IOS_THEME = {
  colors: {
    background: '#F5F2EB',      // 宣紙暖米白背景
    card: '#FFFFFF',            // 純白卡片
    cardAlt: '#EFECE4',         // 次要淺暖灰底
    primary: '#2C3531',         // 墨韻深炭綠（主色）
    accent: '#9A6B48',          // 溫潤胡桃木棕（強調色）
    accentSoft: '#F3EAE2',      // 淺木質底色
    textMain: '#1E2220',        // 主文字深墨色
    textSecondary: '#636B66',   // 次要文字冷灰綠
    textMuted: '#959C97',       // 提示文字
    border: '#E2DDD3',          // 細緻邊框色
    success: '#2E7D5B',         // iOS 風格沉穩綠燈
    successBg: '#E7F4EE',
    warning: '#C87D20',         // iOS 風格琥珀黃燈
    warningBg: '#FDF3E4',
    danger: '#C93B3B',          // iOS 風格警示紅燈
    dangerBg: '#FDECEC',
    iosBlue: '#007AFF',         // iOS 原生系統互動藍
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 22,
    xl: 30,
    // 預留 iPhone 動態島 (Dynamic Island) 與底部 Home 橫條安全距離
    iosTopSafe: Platform.OS === 'ios' ? 54 : 36,
    iosBottomSafe: Platform.OS === 'ios' ? 28 : 16,
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 20,
    pill: 999,
  },
  // Apple HIG 建議最小觸控熱區 44pt
  minTouchTarget: 44,
};
