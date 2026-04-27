import { ButtonHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={twMerge(
        "inline-flex h-9 items-center justify-center rounded-md bg-ink px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
