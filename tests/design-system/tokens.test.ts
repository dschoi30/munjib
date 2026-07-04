import { describe, expect, it } from "vitest";

import { honenDesignTokens, honenSemanticTokens } from "@/lib/design-system/tokens";

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const channels = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

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

  it("keeps invalid field borders visible on Honen control surfaces", () => {
    expect(contrastRatio(honenDesignTokens.color.border.danger, honenDesignTokens.color.surface.control)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(honenDesignTokens.color.border.danger, honenDesignTokens.color.surface.editor)).toBeGreaterThanOrEqual(3);
  });
});
