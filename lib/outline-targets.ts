export function getOutlineHeadingTarget(id: string) {
  if (typeof window === "undefined") {
    return null;
  }

  return window.document.querySelector<HTMLElement>(
    `[data-outline-heading-id="${escapeAttributeSelectorValue(id)}"]`,
  );
}

export function scrollToOutlineHeading(id: string) {
  getOutlineHeadingTarget(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
}

function escapeAttributeSelectorValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
