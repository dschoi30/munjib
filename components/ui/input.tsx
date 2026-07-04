import { InputHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={twMerge(
        "h-[var(--size-control-md)] w-full rounded-interactive border border-border bg-surface px-3 text-sm text-ink outline-none transition-colors duration-fast motion-reduce:transition-none placeholder:text-ink-muted focus-visible:border-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-visible)] disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-border-danger",
        className,
      )}
      {...props}
    />
  );
}
