import { createElement } from "react";
import toast from "react-hot-toast";
import { Info } from "lucide-react";
import { ERROR_MESSAGES } from "../services/config";
import type { ServiceError } from "../services/types";

/**
 * A neutral, informational toast -- distinct from toast.success (green
 * checkmark) and toast.error (red alert) so it doesn't read as either a
 * win or a failure. For messages that are neither, e.g. "this listing is
 * handled off-app" style notices.
 */
export function toastInfo(message: string): string {
  return toast(message, {
    duration: 3500,
    icon: createElement(Info, {
      className: "w-4 h-4",
      style: { color: "oklch(55% 0.04 250)" },
    }),
    style: {
      background: "#FFFFFF",
      color: "oklch(22% 0.02 100)",
      border: "1px solid oklch(92% 0.01 95)",
      borderRadius: "12px",
      padding: "12px 16px",
      boxShadow: "0 10px 15px -3px oklch(20% 0.02 100 / 0.1), 0 4px 6px -4px oklch(20% 0.02 100 / 0.1)",
      borderLeft: "3px solid oklch(55% 0.04 250)",
    },
  });
}

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again, or let us know what happened.";

/**
 * Friendly-error toast with a "Report" action -- the replacement for
 * `toast.error(error.message)` across the app. Never shows the raw
 * error.message: looks up a known-friendly copy for error.code in
 * ERROR_MESSAGES, falling back to one generic, well-written message.
 */
export function showErrorToast(
  error: ServiceError | { message: string; code?: string },
  onReport: () => void,
  toastOptions?: Parameters<typeof toast.error>[1]
): string {
  const friendlyMessage = (error.code && (ERROR_MESSAGES as Record<string, string>)[error.code]) || GENERIC_ERROR_MESSAGE;

  return toast.error(
    (t) =>
      createElement(
        "span",
        { className: "flex items-center gap-3" },
        createElement("span", null, friendlyMessage),
        createElement(
          "button",
          {
            onClick: () => {
              toast.dismiss(t.id);
              onReport();
            },
            className: "flex-shrink-0 text-[13px] font-bold underline underline-offset-2",
            style: { color: "oklch(50% 0.15 30)" },
          },
          "Report"
        )
      ),
    { duration: 5000, ...toastOptions }
  );
}
