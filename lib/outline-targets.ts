export function getOutlineHeadingTarget(id: string, root?: ParentNode | null) {
  if (typeof window === "undefined") {
    return null;
  }

  return (root === undefined ? window.document : root)?.querySelector<HTMLElement>(
    `[data-outline-heading-id="${escapeAttributeSelectorValue(id)}"]`,
  ) ?? null;
}

export function scrollToOutlineHeading(id: string) {
  getOutlineHeadingTarget(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
}

function escapeAttributeSelectorValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
