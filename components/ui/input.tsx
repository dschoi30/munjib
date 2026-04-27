import { InputHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={twMerge(
        "h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-ink",
        className,
      )}
      {...props}
    />
  );
}
