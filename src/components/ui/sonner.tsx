"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-18)",
        } as React.CSSProperties
      }
      // Sonner's own CSS is unlayered and beats Tailwind utilities, hence the `!` overrides
      toastOptions={{
        classNames: {
          toast: "cn-toast font-sans text-15! shadow-card!",
          title: "font-bold!",
          actionButton: "h-8! rounded-10! px-3! text-sm! font-bold! text-pistachio!",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
