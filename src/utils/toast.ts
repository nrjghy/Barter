import { createElement } from "react";
import toast from "react-hot-toast";
import { Info } from "lucide-react";

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
