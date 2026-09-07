import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../hooks/useAuth";
import { GroupService, GroupInvitePreview } from "../services/groupService";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useShowError } from "../hooks/useShowError";

// Set right before bouncing an unauthenticated visitor to /register, read
// back once they land here again with a session (post email-verification or
// OAuth round trip) -- distinguishes "just signed up specifically to join
// this group" (auto-join, no extra click) from an already-authenticated
// person opening this link directly (needs an explicit confirm).
const PENDING_JOIN_KEY = "barter_pending_group_join";

// Standalone (not nested under Layout/ProtectedRoute): this is one of the
// app's few intentionally unauthenticated surfaces, same exception class as
// /listing/:id and /invite.html -- a logged-out visitor must be able to see
// the group name and a "Sign up to join" button before ever authenticating.
export const GroupJoin: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const showError = useShowError();

  const [preview, setPreview] = useState<GroupInvitePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [autoJoining, setAutoJoining] = useState(
    () => !!token && sessionStorage.getItem(PENDING_JOIN_KEY) === token
  );
  const autoJoinStarted = useRef(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    GroupService.getGroupInvitePreview(token).then((result) => {
      if (cancelled) return;
      setPreview(result.data ?? { valid: false });
      setPreviewLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const performJoin = async () => {
    if (!token) return;
    setJoining(true);
    const result = await GroupService.joinGroupViaLink(token);
    setJoining(false);

    if (result.error || !result.data) {
      showError(result.error ?? { message: "Couldn't join the group." });
      setAutoJoining(false);
      return;
    }

    if (!result.data.alreadyMember) {
      toast.success("You joined the group!");
    }
    navigate(`/groups/${result.data.groupId}`, { replace: true });
  };

  useEffect(() => {
    if (authLoading || previewLoading || !preview?.valid || !user || !autoJoining) return;
    if (autoJoinStarted.current) return;
    autoJoinStarted.current = true;
    sessionStorage.removeItem(PENDING_JOIN_KEY);
    performJoin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, previewLoading, preview, user, autoJoining]);

  const handleSignUpToJoin = () => {
    if (!token) return;
    sessionStorage.setItem("barter_redirect_after_login", `/join/${token}`);
    sessionStorage.setItem(PENDING_JOIN_KEY, token);
    navigate("/register");
  };

  // Same redirect-preservation as handleSignUpToJoin, for a visitor who
  // already has an account. Without this there was no way back to the
  // group post-login except detouring through Register's "already
  // registered" error and its Sign In link -- which happened to work only
  // because it left these same two keys in place, not because this screen
  // offered a real log-in path.
  const handleLogInToJoin = () => {
    if (!token) return;
    sessionStorage.setItem("barter_redirect_after_login", `/join/${token}`);
    sessionStorage.setItem(PENDING_JOIN_KEY, token);
    navigate("/login");
  };

  if (authLoading || previewLoading) {
    return (
      <div className="max-w-md mx-auto min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!preview || !preview.valid) {
    return (
      <div className="max-w-md mx-auto min-h-screen flex flex-col items-center justify-center text-center gap-3.5 px-8 bg-[oklch(99%_0.006_95)]">
        <div className="text-[17px] font-extrabold text-[oklch(22%_0.02_100)]">This invite link is no longer valid</div>
        <div className="text-[13px] text-[oklch(45%_0.02_95)] leading-relaxed max-w-[260px]">
          Ask the person who shared it with you for a new link.
        </div>
        <button
          onClick={() => navigate("/")}
          className="mt-2 px-7 py-3 rounded-2xl bg-barter-600 text-white text-sm font-bold"
        >
          Go to Barter
        </button>
      </div>
    );
  }

  const joiningInProgress = joining || (autoJoining && !!user);

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col items-center justify-center text-center gap-3.5 px-8 bg-[oklch(99%_0.006_95)]">
      <div className="w-[60px] h-[60px] rounded-full bg-barter-100 flex items-center justify-center text-barter-700 text-2xl font-bold">
        {preview.groupName.charAt(0).toUpperCase()}
      </div>
      <div className="text-[17px] font-extrabold text-[oklch(22%_0.02_100)]">You're invited to join {preview.groupName}</div>
      {preview.groupDescription && (
        <div className="text-[13px] text-[oklch(45%_0.02_95)] leading-relaxed max-w-[280px]">
          {preview.groupDescription}
        </div>
      )}

      {joiningInProgress ? (
        <div className="mt-2">
          <LoadingSpinner />
        </div>
      ) : user ? (
        <button
          onClick={performJoin}
          disabled={joining}
          className="mt-2 px-7 py-3 rounded-2xl bg-barter-600 text-white text-sm font-bold disabled:opacity-50"
        >
          Join group
        </button>
      ) : (
        <div className="mt-2 flex flex-col items-center gap-2">
          <button
            onClick={handleSignUpToJoin}
            className="px-7 py-3 rounded-2xl bg-barter-600 text-white text-sm font-bold"
          >
            Sign up to join
          </button>
          <button
            onClick={handleLogInToJoin}
            className="text-sm text-barter-600 hover:text-barter-700 font-medium transition-colors hover:underline"
          >
            Already have an account? Log in
          </button>
        </div>
      )}
    </div>
  );
};
