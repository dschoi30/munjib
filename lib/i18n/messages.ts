import type { Language } from "@/lib/i18n/language";

export const messages = {
  en: {
    "app.openSidebar": "Open sidebar",
    "app.openMetadataPanel": "Open metadata panel",
    "settings.title": "Settings",
    "settings.close": "Close settings",
    "settings.menu": "Settings menu",
    "settings.import.nav": "Import",
    "settings.ai.nav": "AI",
    "settings.retention.nav": "Retention",
    "settings.language.nav": "Language",
    "settings.language.title": "Language",
    "settings.language.eyebrow": "Workspace",
    "settings.language.description": "Choose the product display language for this browser.",
    "settings.language.currentBadge": "Current",
    "settings.language.currentStatus": "Current language: {language}",
    "settings.language.pending": "{language} will apply after you save.",
    "settings.language.save": "Save",
    "settings.language.cancel": "Cancel",
    "settings.language.saved": "Saved language: {language}",
    "settings.language.storageFailed": "Language changed for this session, but could not be saved in this browser.",
  },
  ko: {
    "app.openSidebar": "사이드바 열기",
    "app.openMetadataPanel": "메타데이터 패널 열기",
    "settings.title": "설정",
    "settings.close": "설정 닫기",
    "settings.menu": "설정 메뉴",
    "settings.import.nav": "가져오기",
    "settings.ai.nav": "AI",
    "settings.retention.nav": "보존",
    "settings.language.nav": "언어",
    "settings.language.title": "언어",
    "settings.language.eyebrow": "Workspace",
    "settings.language.description": "이 브라우저에서 사용할 제품 표시 언어를 선택합니다.",
    "settings.language.currentBadge": "현재 적용 중",
    "settings.language.currentStatus": "현재 언어: {language}",
    "settings.language.pending": "저장하면 {language}로 적용됩니다.",
    "settings.language.save": "저장",
    "settings.language.cancel": "취소",
    "settings.language.saved": "저장된 언어: {language}",
    "settings.language.storageFailed": "이번 세션에는 언어가 변경되었지만, 이 브라우저에 저장하지 못했습니다.",
  },
} as const;

export type MessageKey = keyof typeof messages.en;

type MessageParams = Record<string, string | number>;

export function getMessage(
  language: Language,
  key: MessageKey,
  params: MessageParams = {},
) {
  const template = messages[language][key] ?? messages.en[key];
  return interpolateMessage(template, params);
}

export function interpolateMessage(template: string, params: MessageParams) {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}
