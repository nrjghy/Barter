import React from "react";
import { useNavigate } from "react-router-dom";

// Standalone (not nested under Layout/ProtectedRoute): by the time this
// renders, signOut() has already cleared the session, so a protected route
// here would just bounce straight back to /login and the confirmation would
// never be seen.
export const AccountDeleted: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col items-center justify-center text-center gap-3.5 px-8 bg-[oklch(99%_0.006_95)]">
      <div className="w-[60px] h-[60px] rounded-full bg-barter-100 flex items-center justify-center text-barter-700">
        <div className="w-3.5 h-2.5 border-l-[3px] border-b-[3px] border-current -rotate-45 translate-x-0.5 -translate-y-0.5" />
      </div>
      <div className="text-[17px] font-extrabold text-[oklch(22%_0.02_100)]">Your account has been deleted</div>
      <div className="text-[13px] text-[oklch(45%_0.02_95)] leading-relaxed max-w-[260px]">
        You've been logged out. Some trade and dispute records may be retained as required by law.
      </div>
      <button
        onClick={() => navigate("/login")}
        className="mt-2 px-7 py-3 rounded-2xl bg-barter-600 text-white text-sm font-bold"
      >
        Return to login
      </button>
    </div>
  );
};
