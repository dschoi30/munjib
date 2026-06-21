import type { WikiLinkCompletionOption } from "@/lib/wiki-links/autocomplete";
import { useI18n } from "@/components/i18n-provider";

export function WikiLinkSuggestions({
  canWrite,
  suggestions,
  onSelect,
}: {
  canWrite: boolean;
  suggestions: WikiLinkCompletionOption[];
  onSelect: (option: WikiLinkCompletionOption) => void;
}) {
  const { t } = useI18n();

  if (!canWrite || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="absolute left-4 top-12 z-10 w-72 overflow-hidden rounded-md border border-border bg-white shadow-lg">
      <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        {t("editor.wikiLinks")}
      </div>
      {suggestions.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onSelect(option)}
          className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-muted"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
