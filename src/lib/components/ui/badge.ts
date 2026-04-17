import { cva, type VariantProps } from "class-variance-authority";

export const badgeVariants = cva(
  "inline-flex items-center justify-center border-2 border-foreground px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider w-fit whitespace-nowrap shrink-0 gap-1 overflow-hidden shadow-[2px_2px_0px_var(--foreground)]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive text-destructive-foreground",
        outline: "bg-transparent text-foreground",
        ghost: "border-transparent bg-transparent shadow-none",
        link: "border-transparent bg-transparent text-primary shadow-none underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];
