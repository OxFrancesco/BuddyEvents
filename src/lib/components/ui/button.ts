import { cva, type VariantProps } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-bold uppercase tracking-wide border-2 border-foreground transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] shadow-[4px_4px_0px_var(--foreground)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_var(--foreground)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        destructive: "bg-destructive text-destructive-foreground",
        outline: "bg-background text-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        ghost:
          "border-transparent bg-transparent shadow-none hover:bg-muted hover:shadow-none hover:translate-x-0 hover:translate-y-0 active:translate-x-0 active:translate-y-0",
        link: "border-transparent bg-transparent text-primary shadow-none hover:underline hover:shadow-none hover:translate-x-0 hover:translate-y-0 active:translate-x-0 active:translate-y-0",
      },
      size: {
        default: "h-9 px-4 py-2",
        xs: "h-6 gap-1 px-2 text-xs",
        sm: "h-8 gap-1.5 px-3",
        lg: "h-10 px-6",
        icon: "size-9",
        "icon-xs": "size-6",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
export type ButtonSize = VariantProps<typeof buttonVariants>["size"];
