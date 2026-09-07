import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import html2canvas from "html2canvas-pro";
import { IssueReportDialog, IssueReportPrefill } from "../components/IssueReportDialog";
import { trackEvent } from "../lib/analytics";

export type ReportErrorPrefill = IssueReportPrefill;

interface ReportErrorContextType {
  openReport: (prefill: ReportErrorPrefill) => void;
}

const ReportErrorContext = createContext<ReportErrorContextType | undefined>(undefined);

// Non-component call sites (services like storageService.ts, plain utils)
// can't use the useReportError hook, so the provider also registers itself
// here on mount. Same "module-level singleton, no persistence" shape as
// src/lib/errorTracker.ts.
let controller: ReportErrorContextType | undefined;

export function getReportErrorController(): ReportErrorContextType | undefined {
  return controller;
}

const SCREENSHOT_TIMEOUT_MS = 4000;

async function captureScreenshot(): Promise<File | null> {
  try {
    const canvas = await Promise.race([
      html2canvas(document.body),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("screenshot timed out")), SCREENSHOT_TIMEOUT_MS)),
    ]);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return null;

    return new File([blob], `error-report-${Date.now()}.png`, { type: "image/png" });
  } catch (error) {
    // Best-effort only -- a report submitted without a screenshot is still
    // useful, so a slow/failing capture must never block opening the dialog.
    console.error("Screenshot capture failed:", error);
    return null;
  }
}

export const ReportErrorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [prefill, setPrefill] = useState<ReportErrorPrefill | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);

  const openReport = useCallback((newPrefill: ReportErrorPrefill) => {
    trackEvent("error_report_opened", { code: newPrefill.code });

    setPrefill(newPrefill);
    setScreenshotFile(null);
    setIsOpen(true);

    // Fire-and-forget: the dialog is already open with the technical
    // details filled in by the time the screenshot (if any) lands.
    captureScreenshot().then((file) => {
      if (file) setScreenshotFile(file);
    });
  }, []);

  const contextValue: ReportErrorContextType = { openReport };

  useEffect(() => {
    controller = contextValue;
    return () => {
      if (controller === contextValue) controller = undefined;
    };
  }, [openReport]);

  const handleClose = () => {
    setIsOpen(false);
    setPrefill(null);
    setScreenshotFile(null);
  };

  return (
    <ReportErrorContext.Provider value={contextValue}>
      {children}
      <IssueReportDialog isOpen={isOpen} onClose={handleClose} prefill={prefill} initialFile={screenshotFile} />
    </ReportErrorContext.Provider>
  );
};

export const useReportError = (): ReportErrorContextType => {
  const context = useContext(ReportErrorContext);
  if (!context) {
    throw new Error("useReportError must be used within a ReportErrorProvider");
  }
  return context;
};
