import React, { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useConnection, useConnections } from "../hooks/useConnections";
import { LoadingSpinner } from "../components/LoadingSpinner";

// PLACEHOLDER: this is intentionally minimal. It exists only so that
// clicking a connection in the Chat list (step 2) goes somewhere real
// instead of a dead link. The actual thread view -- message history,
// text/photo/location composer, "···" menu with Mark Trade Complete /
// Block / Report -- is step 3, not built yet.
export const ChatThread: React.FC = () => {
  const { connectionId } = useParams<{ connectionId: string }>();
  const navigate = useNavigate();
  const { connection, loading } = useConnection(connectionId);
  const { markConnectionOpened } = useConnections();

  useEffect(() => {
    if (connectionId) {
      markConnectionOpened(connectionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[oklch(88%_0.015_90)]">
        <button onClick={() => navigate("/chat")} className="p-1 -ml-1">
          <ArrowLeft className="w-5 h-5 text-[oklch(22%_0.02_100)]" />
        </button>
        <div className="text-base font-semibold text-[oklch(22%_0.02_100)]">
          {connection?.otherUser.username ?? "Chat"}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6">
        {loading ? (
          <LoadingSpinner color="barter" />
        ) : (
          <div className="text-center text-sm text-[oklch(45%_0.02_95)]">
            The full chat thread is coming soon. This connection has been marked as opened.
          </div>
        )}
      </div>
    </div>
  );
};
