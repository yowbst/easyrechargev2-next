"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { PostHogProvider } from "./PostHogProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <PostHogProvider>{children}</PostHogProvider>
    </NextThemesProvider>
  );
}
