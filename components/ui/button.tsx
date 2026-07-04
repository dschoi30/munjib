import { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { twMerge } from "tailwind-merge";

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-interactive font-medium",
    "transition-[background-color,border-color,box-shadow,color,transform] duration-fast",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-visible)]",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    "aria-busy:cursor-progress aria-busy:opacity-80",
  ],
  {
    variants: {
      variant: {
        primary:
          "border border-transparent bg-surface-inverse text-ink-inverse",
        secondary:
          "border border-border bg-surface text-ink shadow-subtle hover:bg-muted active:translate-y-px active:shadow-none",
        ghost:
          "border border-transparent bg-transparent text-ink hover:bg-muted active:translate-y-px",
        destructive:
          "border border-border-danger bg-surface-danger text-danger hover:border-danger active:translate-y-px",
      },
      size: {
        sm: "h-[var(--size-control-sm)] px-2 text-xs",
        md: "h-[var(--size-control-md)] px-3 text-sm",
        lg: "h-[var(--size-control-lg)] px-4 text-base",
        icon: "size-[var(--size-control-md)] px-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={twMerge(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
