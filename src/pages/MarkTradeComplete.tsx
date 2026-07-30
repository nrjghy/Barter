import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// PLACEHOLDER: only the "···" menu entry point is in scope here. The
// actual flow (multi-select item picker for both sides, confirmation
// screen with the dispute deadline date, and the resulting system
// message in the thread) is its own separate, already-tracked task.
export const MarkTradeComplete: React.FC = () => {
  const { connectionId } = useParams<{ connectionId: string }>();
  const navigate = useNavigate();

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[oklch(88%_0.015_90)]">
        <button onClick={() => navigate(`/chat/${connectionId}`)} className="p-1 -ml-1">
          <ArrowLeft className="w-5 h-5 text-[oklch(22%_0.02_100)]" />
        </button>
        <div className="text-base font-semibold text-[oklch(22%_0.02_100)]">Mark trade complete</div>
      </div>
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center text-sm text-[oklch(45%_0.02_95)]">
          The full Mark Trade Complete flow is coming soon.
        </div>
      </div>
    </div>
  );
};
