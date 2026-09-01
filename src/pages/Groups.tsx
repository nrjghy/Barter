import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Users, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { BackBar } from "../components/BackBar";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { CreateGroupModal } from "../components/CreateGroupModal";
import { useUserGroups, useGroupInviteActions } from "../hooks/useGroups";
import { useNotifications } from "../hooks/useNotifications";

export const Groups: React.FC = () => {
  const navigate = useNavigate();
  const { groups, loading } = useUserGroups();
  const { unreadNotifications } = useNotifications();
  const { acceptInvite, declineInvite, acceptingGroupId, decliningGroupId } = useGroupInviteActions();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [dismissedGroupIds, setDismissedGroupIds] = useState<Set<string>>(new Set());

  const pendingInvites = unreadNotifications.filter(
    (n) => n.type === "group_invite" && (n.data as { groupId?: string } | undefined)?.groupId && !dismissedGroupIds.has((n.data as { groupId: string }).groupId)
  );

  const handleAcceptInvite = async (groupId: string) => {
    const result = await acceptInvite(groupId);
    if (result.error) {
      toast.error(result.error.message);
    } else {
      toast.success("You've joined the group!");
      navigate(`/groups/${groupId}`);
    }
  };

  const handleDeclineInvite = async (groupId: string) => {
    const result = await declineInvite(groupId);
    if (result.error) {
      toast.error(result.error.message);
    } else {
      setDismissedGroupIds((prev) => new Set(prev).add(groupId));
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-[oklch(99%_0.006_95)] pt-16">
      <BackBar title="Groups" onBack={() => navigate("/profile")} />

      <div className="flex-1 px-5 py-5">
        {pendingInvites.length > 0 && (
          <div className="mb-5">
            <h2 className="text-xs font-bold uppercase tracking-wide text-[oklch(50%_0.02_95)] mb-2">
              Pending invites
            </h2>
            <div className="space-y-2">
              {pendingInvites.map((notification) => {
                const groupId = (notification.data as { groupId: string }).groupId;
                const accepting = acceptingGroupId === groupId;
                const declining = decliningGroupId === groupId;
                return (
                  <div
                    key={notification.id}
                    className="bg-white rounded-2xl border border-[oklch(92%_0.01_95)] px-4 py-3.5"
                  >
                    <p className="text-sm text-[oklch(22%_0.02_100)]">{notification.content}</p>
                    <div className="flex items-center space-x-2 mt-2">
                      <button
                        onClick={() => handleAcceptInvite(groupId)}
                        disabled={accepting || declining}
                        className="px-3 py-1.5 text-xs font-semibold bg-barter-600 text-white rounded-lg hover:bg-barter-700 transition-colors disabled:opacity-50"
                      >
                        {accepting ? "Accepting…" : "Accept"}
                      </button>
                      <button
                        onClick={() => handleDeclineInvite(groupId)}
                        disabled={accepting || declining}
                        className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        {declining ? "Declining…" : "Decline"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full mb-5 px-4 py-3 bg-barter-600 text-white font-semibold rounded-xl hover:bg-barter-700 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create group
        </button>

        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-14 h-14 bg-barter-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-barter-600" />
            </div>
            <h3 className="text-base font-bold text-[oklch(22%_0.02_100)] mb-1.5">No groups yet</h3>
            <p className="text-sm text-gray-600">
              <button
                onClick={() => setShowCreateModal(true)}
                className="text-barter-600 font-semibold hover:underline"
              >
                Create a group
              </button>{" "}
              or ask a friend to send you an invite link to join one.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[oklch(92%_0.01_95)] divide-y divide-[oklch(92%_0.01_95)]">
            {groups.map((group) => (
              <button
                key={group.id}
                onClick={() => navigate(`/groups/${group.id}`)}
                className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-bold text-[oklch(22%_0.02_100)]">{group.name}</span>
                    {group.role === "creator" && (
                      <span className="px-1.5 py-0.5 rounded-full bg-barter-100 text-barter-700 text-[10px] font-bold">
                        Owner
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-[oklch(50%_0.02_95)] mt-0.5">
                    {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <CreateGroupModal
            onClose={() => setShowCreateModal(false)}
            onCreated={(groupId) => {
              setShowCreateModal(false);
              navigate(`/groups/${groupId}`);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
