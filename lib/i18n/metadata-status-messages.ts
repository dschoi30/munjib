import type { Language } from "@/lib/i18n/language";

export const metadataStatusMessages: Record<Language, { loading: string; retry: string }> = {
  en: { loading: "Loading…", retry: "Retry" },
  ko: { loading: "불러오는 중…", retry: "다시 시도" },
};
