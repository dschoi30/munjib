import type { HTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={twMerge("munjib-skeleton rounded-md", className)}
    />
  );
}
