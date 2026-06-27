export type ActionMenuPlacement = "down" | "up";

const estimatedActionMenuHeight = 192;

export function chooseActionMenuPlacement(
  trigger: HTMLElement | null | undefined,
): ActionMenuPlacement {
  if (!trigger || typeof window === "undefined") {
    return "down";
  }

  const triggerRect = trigger.getBoundingClientRect();
  const boundaryBottom = findScrollBoundaryBottom(trigger);
  const spaceBelowTrigger = boundaryBottom - triggerRect.bottom;

  return spaceBelowTrigger < estimatedActionMenuHeight ? "up" : "down";
}

export function actionMenuPositionClassName(placement: ActionMenuPlacement) {
  return placement === "up" ? "bottom-8" : "top-8";
}

function findScrollBoundaryBottom(element: HTMLElement) {
  let current = element.parentElement;

  while (current) {
    const style = window.getComputedStyle(current);
    const overflow = `${style.overflowY} ${style.overflow}`;
    if (/(auto|scroll|hidden)/.test(overflow)) {
      return current.getBoundingClientRect().bottom;
    }
    current = current.parentElement;
  }

  return window.innerHeight;
}
