import * as React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "outline" | "ghost" | "destructive", size?: "sm" | "md" | "lg", isLoading?: boolean }>(
  ({ className, variant = "default", size = "md", isLoading, children, ...props }, ref) => {
    const variants = {
      default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25",
      outline: "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
      ghost: "bg-transparent hover:bg-white/5",
      destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg shadow-destructive/25"
    };
    const sizes = {
      sm: "h-9 px-3 text-sm",
      md: "h-11 px-6 font-medium",
      lg: "h-14 px-8 text-lg font-semibold"
    };
    
    return (
      <button
        ref={ref}
        disabled={isLoading || props.disabled}
        className={cn(
          "inline-flex items-center justify-center rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none active:scale-95",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        className={cn(
          "flex h-11 w-full rounded-xl border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export const Card = ({ className, children }: { className?: string, children: React.ReactNode }) => (
  <div className={cn("glass-panel rounded-2xl overflow-hidden", className)}>
    {children}
  </div>
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-xl border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 transition-all appearance-none",
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = "Select";
