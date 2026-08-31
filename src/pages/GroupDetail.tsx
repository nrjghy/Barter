import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { UserPlus, ArrowLeftRight } from "lucide-react";
import toast from "react-hot-toast";
import { BackBar } from "../components/BackBar";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { InviteToGroupModal } from "../components/InviteToGroupModal";
import { TransferOwnershipModal } from "../components/TransferOwnershipModal";
import { useAuth } from "../hooks/useAuth";
import { useGroup } from "../hooks/useGroups";
import { pickAvatarPalette } from "../utils/avatar";

export const GroupDetail: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    group,
    groupLoading,
    groupError,
    members,
    membersLoading,
    inviteToGroup,
    transferOwnership,
    leaveGroup,
    leaveGroupLoading,
  } = useGroup(groupId);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferIsForLeaving, setTransferIsForLeaving] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const myMembership = members.find((m) => m.userId === user?.id);
  const isCreator = myMembership?.role === "creator";

  const handleConfirmLeave = async () => {
    const result = await leaveGroup();
    setConfirmingLeave(false);
    if (result.error) {
      toast.error(result.error.message);
    } else {
      toast.success("You left the group");
      navigate("/groups");
    }
  };

  if (groupLoading) {
    return (
      <div className="max-w-md mx-auto pt-16">
        <BackBar title="Group" onBack={() => navigate("/groups")} />
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (groupError || !group) {
    return (
      <div className="max-w-md mx-auto pt-16">
        <BackBar title="Group" onBack={() => navigate("/groups")} />
        <div className="px-5 py-12 text-center text-gray-600">Couldn't load this group.</div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-[oklch(99%_0.006_95)] pt-16">
      <BackBar title={group.name} subtitle={`${members.length} ${members.length === 1 ? "member" : "members"}`} onBack={() => navigate("/groups")} />

      <div className="flex-1 px-5 py-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-bold text-[oklch(50%_0.02_95)] tracking-wide">MEMBERS</div>
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-1.5 text-sm font-semibold text-barter-600 hover:text-barter-700"
          >
            <UserPlus className="w-4 h-4" />
            Invite
          </button>
        </div>

        {membersLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[oklch(92%_0.01_95)] divide-y divide-[oklch(92%_0.01_95)] mb-6">
            {members.map((member) => {
              const palette = pickAvatarPalette(member.userId);
              return (
                <div key={member.membershipId} className="flex items-center gap-3 px-4 py-3.5">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ background: palette.bg, color: palette.color }}
                  >
                    {member.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-bold text-[oklch(22%_0.02_100)] truncate">{member.username}</div>
                    <div className="text-[12px] text-[oklch(50%_0.02_95)]">
                      {member.role === "creator" ? "Creator" : "Member"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isCreator ? (
          <div className="space-y-2">
            <button
              onClick={() => {
                setTransferIsForLeaving(false);
                setShowTransferModal(true);
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium"
            >
              <ArrowLeftRight className="w-4 h-4" />
              Transfer ownership
            </button>
            <button
              onClick={() => {
                setTransferIsForLeaving(true);
                setShowTransferModal(true);
              }}
              className="w-full px-4 py-3 text-sm font-bold text-[oklch(50%_0.15_30)]"
            >
              Leave group
            </button>
            <p className="text-xs text-gray-500 text-center">Transfer ownership to leave a group you created.</p>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingLeave(true)}
            className="w-full px-4 py-3 text-sm font-bold text-[oklch(50%_0.15_30)]"
          >
            Leave group
          </button>
        )}
      </div>

      <AnimatePresence>
        {showInviteModal && (
          <InviteToGroupModal
            groupName={group.name}
            onClose={() => setShowInviteModal(false)}
            onInvite={async (identifier) => {
              const result = await inviteToGroup(identifier);
              if (!result.error) toast.success("Invite sent!");
              return result;
            }}
          />
        )}
        {showTransferModal && (
          <TransferOwnershipModal
            groupName={group.name}
            leavingAfterTransfer={transferIsForLeaving}
            onClose={() => setShowTransferModal(false)}
            onTransfer={async (newCreatorUsername) => {
              const result = await transferOwnership(newCreatorUsername);
              if (!result.error) {
                toast.success(`Ownership transferred to ${newCreatorUsername}`);
                if (transferIsForLeaving) {
                  const leaveResult = await leaveGroup();
                  if (leaveResult.error) {
                    toast.error(leaveResult.error.message);
                  } else {
                    toast.success("You left the group");
                    navigate("/groups");
                  }
                }
              }
              return result;
            }}
          />
        )}
      </AnimatePresence>

      {confirmingLeave && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-[oklch(20%_0.02_100_/_0.45)]" onClick={() => setConfirmingLeave(false)} />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl p-5 pb-7">
            <div className="text-base font-extrabold text-[oklch(22%_0.02_100)] mb-1.5">Leave {group.name}?</div>
            <div className="text-[13px] text-[oklch(45%_0.02_95)] leading-relaxed mb-4">
              You'll stop seeing this group's private listings, and members won't see items you've shared with it.
            </div>
            <button
              onClick={() => setConfirmingLeave(false)}
              className="w-full py-3.5 rounded-xl bg-barter-600 text-white text-sm font-bold mb-2"
            >
              Stay in group
            </button>
            <button
              onClick={handleConfirmLeave}
              disabled={leaveGroupLoading}
              className="w-full py-3.5 rounded-xl bg-transparent text-[oklch(50%_0.15_30)] text-sm font-bold disabled:opacity-50"
            >
              {leaveGroupLoading ? "Leaving…" : "Leave group"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
