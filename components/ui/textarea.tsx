import { TextareaHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={twMerge(
        "min-h-[360px] w-full resize-none rounded-md border border-border bg-white p-3 font-mono text-sm outline-none focus:border-ink",
        className,
      )}
      {...props}
    />
  );
}
