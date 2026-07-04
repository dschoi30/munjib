import { TextareaHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={twMerge(
        "min-h-[360px] w-full resize-none rounded-md border border-border bg-surface p-3 font-mono text-sm text-ink outline-none transition-colors duration-fast placeholder:text-ink-muted focus-visible:border-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-visible)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-border-danger",
        className,
      )}
      {...props}
    />
  );
}
