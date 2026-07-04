import { describe, expect, it } from "vitest";

import { honenDesignTokens, honenSemanticTokens } from "@/lib/design-system/tokens";

describe("Honen design tokens", () => {
  it("keeps the implementation-ready foundation values from the design brief", () => {
    expect(honenDesignTokens.font.family.primary).toBe("Inter");
    expect(honenDesignTokens.font.size.base).toBe("16px");
    expect(honenDesignTokens.color.text.body).toBe("#191818");
    expect(honenDesignTokens.color.brand.primary).toBe("#2f7d46");
    expect(honenDesignTokens.color.brand.primaryMuted).toBe("#edf4ee");
    expect(honenDesignTokens.color.surface.page).toBe("#f7f6f1");
    expect(honenDesignTokens.color.surface.editor).toBe("#fbfaf6");
    expect(honenDesignTokens.color.focus.ring).toBe("#2563eb");
    expect(honenDesignTokens.space[8]).toBe("13px");
    expect(honenDesignTokens.radius.step8).toBe("999px");
    expect(honenDesignTokens.motion.duration.step8).toBe("420ms");
  });

  it("exposes semantic CSS variable contracts for component guidance", () => {
    expect(honenSemanticTokens.color.text.body).toBe("var(--color-text-body)");
    expect(honenSemanticTokens.color.brand.primary).toBe("var(--color-brand-primary)");
    expect(honenSemanticTokens.color.surface.card).toBe("var(--color-surface-card)");
    expect(honenSemanticTokens.color.surface.editor).toBe("var(--color-surface-editor)");
    expect(honenSemanticTokens.color.focus.visible).toBe("var(--color-focus-visible)");
    expect(honenSemanticTokens.component.button.height).toBe("var(--size-control-md)");
  });
});
