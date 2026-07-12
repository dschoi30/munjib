import type { Metadata } from "next";
import { I18nProvider } from "@/components/i18n-provider";
import { SpeculativeLinkGuard } from "@/components/speculative-link-guard";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Munjib",
  description: "Markdown-first enterprise wiki foundation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <I18nProvider>
          <SpeculativeLinkGuard />
          {children}
          <Toaster />
        </I18nProvider>
      </body>
    </html>
  );
}
