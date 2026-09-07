import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { AccountService } from "../services";
import { BackBar } from "../components/BackBar";
import { useShowError } from "../hooks/useShowError";

// Danger-zone-only for now -- matches the "Account" frame in
// design/Barter Nav Shell.dc.html, but only the section this pass builds.
// Password change already exists (Profile.tsx's modal, wired to
// AuthContext.updatePassword) and isn't touched here.
export const Account: React.FC = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const showError = useShowError();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await AccountService.deleteOwnAccount();

      if (error) {
        showError(error);
        return;
      }

      // The RPC already deleted the auth.users row server-side, but the
      // local session token is still cached client-side until we sign out.
      await signOut();
      navigate("/account-deleted");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-[oklch(99%_0.006_95)] pt-16">
      <BackBar title="Account" onBack={() => navigate("/profile")} />

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="text-[11px] font-bold text-[oklch(50%_0.15_30)] tracking-wide mb-2.5">DANGER ZONE</div>
        <div className="p-4 rounded-2xl bg-[oklch(97%_0.02_30)] border border-[oklch(90%_0.05_30)]">
          <div className="text-[13.5px] font-bold text-[oklch(22%_0.02_100)] mb-1">Delete account</div>
          <div className="text-[12.5px] text-[oklch(45%_0.02_95)] leading-relaxed mb-3">
            Permanently removes your account. Your past messages and trade history stay visible to others you traded with, but your profile is anonymized.
          </div>
          <button
            onClick={() => setConfirmOpen(true)}
            className="w-full py-2.5 rounded-xl bg-[oklch(50%_0.15_30)] text-white text-[13.5px] font-bold"
          >
            Delete account
          </button>
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-[oklch(20%_0.02_100_/_0.4)]"
            onClick={() => !deleting && setConfirmOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl p-5 pb-7">
            <div className="text-base font-extrabold text-[oklch(22%_0.02_100)] mb-1.5">Delete your account?</div>
            <div className="text-[13px] text-[oklch(45%_0.02_95)] leading-relaxed mb-3.5">
              This is permanent — your profile, listings, and messages will be removed. Some trade and dispute
              records may be retained as required by law.
            </div>
            <button
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
              className="w-full py-3.5 rounded-xl bg-barter-600 text-white text-sm font-bold mb-2 disabled:opacity-60"
            >
              Keep my account
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="w-full py-3.5 rounded-xl bg-transparent text-[oklch(50%_0.15_30)] text-sm font-bold disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete account"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
