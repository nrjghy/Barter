import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { useAuth } from "../hooks/useAuth";
import { NotificationService } from "../services";
import { BackBar } from "../components/BackBar";

type Category = "match" | "message" | "product_update" | "review_reminder" | "onboarding";

// Only these five are toggleable -- everything else (trade updates, offers,
// disputes, etc.) always sends regardless, since those need a response, not
// just attention. See update_notification_preference (rejects any other
// category) and README's Email section for the full list.
const TOGGLES: { category: Category; label: string; description: string }[] = [
  { category: "match", label: "New matches", description: "When you match with someone or get a reciprocity nudge" },
  { category: "message", label: "Messages", description: "When you get a new chat message and haven't opened the app in a while" },
  { category: "product_update", label: "Product updates", description: "Occasional announcements about new Barter features" },
  { category: "review_reminder", label: "Review reminders", description: "Reminders to leave a review after a trade" },
  { category: "onboarding", label: "Listing reminders", description: "Nudges to list your first item, if you haven't yet" },
];

export const NotificationSettings: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<Record<string, Record<string, boolean>>>(
    user?.notificationPreferences ?? {}
  );
  const [savingCategory, setSavingCategory] = useState<Category | null>(null);

  // Missing key defaults to true, matching the DB column's own default and
  // the always-on-unless-toggled-off behavior everywhere else in this feature.
  const isEnabled = (category: Category) => preferences?.[category]?.email !== false;

  const handleToggle = async (category: Category, enabled: boolean) => {
    setSavingCategory(category);
    const previous = preferences;
    setPreferences((prev) => ({ ...prev, [category]: { ...prev?.[category], email: enabled } }));

    const { data, error } = await NotificationService.updateNotificationPreference(category, "email", enabled);

    if (error) {
      setPreferences(previous);
      toast.error(error.message || "Couldn't update that preference. Please try again.");
    } else if (data) {
      setPreferences(data);
    }
    setSavingCategory(null);
  };

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-[oklch(99%_0.006_95)] pt-16">
      <BackBar title="Notifications" onBack={() => navigate("/profile")} />

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="text-[11px] font-bold text-[oklch(50%_0.02_95)] tracking-wide mb-2.5">EMAIL</div>
        <div className="bg-white rounded-2xl border border-[oklch(92%_0.01_95)] divide-y divide-[oklch(92%_0.01_95)]">
          {TOGGLES.map(({ category, label, description }) => (
            <div key={category} className="flex items-center justify-between px-4 py-3.5">
              <div className="pr-4">
                <div className="text-[13.5px] font-bold text-[oklch(22%_0.02_100)]">{label}</div>
                <div className="text-[12px] text-[oklch(50%_0.02_95)] mt-0.5">{description}</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={isEnabled(category)}
                  disabled={savingCategory === category}
                  onChange={(e) => handleToggle(category, e.target.checked)}
                />
                <div className="w-11 h-6 bg-[oklch(90%_0.01_95)] rounded-full peer peer-checked:bg-barter-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
              </label>
            </div>
          ))}
        </div>
        <div className="text-[12px] text-[oklch(50%_0.02_95)] mt-3 px-1">
          Other notifications, like trade updates and offers, always send since they need your attention.
        </div>
      </div>
    </div>
  );
};
