"use client";

import { Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useState } from "react";

interface InfoTooltipProps {
  children: React.ReactNode;
  content?: React.ReactNode;
  image?: string;
  title?: string;
  closeLabel?: string;
  className?: string;
}

export function InfoTooltip({ children, content, image, title, closeLabel = "Fermer", className }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);

  if (!content && !image) {
    return <span className={cn("inline-flex items-center gap-1", className)}>{children}</span>;
  }

  return (
    <>
      <span className={cn("inline-flex items-center gap-1", className)}>
        {children}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-primary/60 hover:text-primary transition-colors focus:outline-none shrink-0 print:hidden"
          aria-label="Plus d'informations"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </span>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <DialogPrimitive.Title className="sr-only">
              {title ?? "Information"}
            </DialogPrimitive.Title>

            {image && (
              <img
                src={image}
                alt={title ?? ""}
                loading="lazy"
                className="w-full object-cover max-h-52"
              />
            )}

            <div className="px-5 py-4 space-y-3">
              {title && (
                <p className="font-semibold text-sm">{title}</p>
              )}
              <DialogPrimitive.Description asChild>
                <p className="text-sm text-muted-foreground font-normal normal-case tracking-normal leading-relaxed">
                  {content}
                </p>
              </DialogPrimitive.Description>
              <div className="flex justify-end pt-1">
                <DialogPrimitive.Close className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-3.5 w-3.5" />
                  {closeLabel}
                </DialogPrimitive.Close>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
