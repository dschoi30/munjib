"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

const DEFAULT_TOAST_DURATION_MS = 3000;

const Toaster = ({
  duration = DEFAULT_TOAST_DURATION_MS,
  position = "bottom-center",
  ...props
}: ToasterProps) => {
  return (
    <Sonner
      duration={duration}
      position={position}
      theme="light"
      {...props}
    />
  );
};

export { Toaster };
