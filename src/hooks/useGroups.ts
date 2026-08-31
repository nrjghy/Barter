import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { GroupService } from "../services/groupService";

export const useUserGroups = () => {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ["groups", user?.id],
    queryFn: () => GroupService.getUserGroups(user!.id),
    enabled: !!user,
  });

  return {
    groups: data?.data ?? [],
    loading: isLoading,
    error: error?.message,
  };
};

export const useGroup = (groupId?: string) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const groupQuery = useQuery({
    queryKey: ["group", groupId],
    queryFn: () => GroupService.getGroup(groupId!),
    enabled: !!groupId,
  });

  const membersQuery = useQuery({
    queryKey: ["groupMembers", groupId],
    queryFn: () => GroupService.getGroupMembers(groupId!),
    enabled: !!groupId,
  });

  const invalidateGroup = () => {
    queryClient.invalidateQueries({ queryKey: ["group", groupId] });
    queryClient.invalidateQueries({ queryKey: ["groupMembers", groupId] });
    queryClient.invalidateQueries({ queryKey: ["groups", user?.id] });
  };

  const inviteToGroup = useMutation({
    mutationFn: (identifier: string) => GroupService.inviteToGroup(groupId!, identifier),
  });

  const transferOwnership = useMutation({
    mutationFn: (newCreatorUsername: string) => GroupService.transferGroupOwnership(groupId!, newCreatorUsername),
    onSuccess: (result) => {
      if (!result.error) invalidateGroup();
    },
  });

  const leaveGroup = useMutation({
    mutationFn: () => GroupService.leaveGroup(groupId!),
    onSuccess: (result) => {
      if (!result.error) {
        queryClient.invalidateQueries({ queryKey: ["groups", user?.id] });
      }
    },
  });

  const deleteGroup = useMutation({
    mutationFn: () => GroupService.deleteGroup(groupId!),
    onSuccess: (result) => {
      if (!result.error) {
        queryClient.invalidateQueries({ queryKey: ["groups", user?.id] });
      }
    },
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) => GroupService.removeMember(groupId!, memberId),
    onSuccess: (result) => {
      if (!result.error) invalidateGroup();
    },
  });

  return {
    group: groupQuery.data?.data,
    groupLoading: groupQuery.isLoading,
    groupError: groupQuery.data?.error?.message,

    members: membersQuery.data?.data ?? [],
    membersLoading: membersQuery.isLoading,

    inviteToGroup: inviteToGroup.mutateAsync,
    inviteToGroupLoading: inviteToGroup.isPending,

    transferOwnership: transferOwnership.mutateAsync,
    transferOwnershipLoading: transferOwnership.isPending,

    leaveGroup: leaveGroup.mutateAsync,
    leaveGroupLoading: leaveGroup.isPending,

    deleteGroup: deleteGroup.mutateAsync,
    deleteGroupLoading: deleteGroup.isPending,

    removeMember: removeMember.mutateAsync,
    removingMemberId: removeMember.isPending ? (removeMember.variables as string | undefined) : undefined,
  };
};

/**
 * Group ids an existing item is already shared to, scoped to the caller's
 * own groups by RLS -- used to prefill AddEditItem's share checklist.
 */
export const useItemGroupIds = (itemId?: string) => {
  const query = useQuery({
    queryKey: ["itemGroups", itemId],
    queryFn: () => GroupService.getItemGroupIds(itemId!),
    enabled: !!itemId,
  });

  return {
    groupIds: query.data?.data ?? [],
    loading: query.isLoading,
  };
};

export const useCreateGroup = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const createGroup = useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string }) =>
      GroupService.createGroup(name, description),
    onSuccess: (result) => {
      if (!result.error) {
        queryClient.invalidateQueries({ queryKey: ["groups", user?.id] });
      }
    },
  });

  return {
    createGroup: createGroup.mutateAsync,
    createGroupLoading: createGroup.isPending,
  };
};

/**
 * Group-invite accept/decline actions, used from the notification list.
 * Kept separate from useGroup since notification cards act on a groupId
 * without a mounted group-detail query.
 */
export const useGroupInviteActions = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const invalidateAfterResponse = () => {
    queryClient.invalidateQueries({ queryKey: ["groups", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["unreadNotifications", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["notificationStats", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["unreadCount", user?.id] });
  };

  const acceptInvite = useMutation({
    mutationFn: (groupId: string) => GroupService.acceptGroupInvite(groupId),
    onSuccess: (result) => {
      if (!result.error) invalidateAfterResponse();
    },
  });

  const declineInvite = useMutation({
    mutationFn: (groupId: string) => GroupService.declineGroupInvite(groupId),
    onSuccess: (result) => {
      if (!result.error) invalidateAfterResponse();
    },
  });

  return {
    acceptInvite: acceptInvite.mutateAsync,
    acceptInviteLoading: acceptInvite.isPending,
    decliningGroupId: declineInvite.isPending ? (declineInvite.variables as string | undefined) : undefined,
    acceptingGroupId: acceptInvite.isPending ? (acceptInvite.variables as string | undefined) : undefined,
    declineInvite: declineInvite.mutateAsync,
    declineInviteLoading: declineInvite.isPending,
  };
};

/**
 * The current user's Discover browse scope (Public vs. My Groups). Backed
 * by a plain users-row read plus the update_browse_scope RPC, not a
 * dedicated table -- see users.browse_mode/browse_group_ids.
 */
export const useBrowseScope = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const scopeQuery = useQuery({
    queryKey: ["browseScope", user?.id],
    queryFn: () => GroupService.getBrowseScope(user!.id),
    enabled: !!user,
  });

  const updateScope = useMutation({
    mutationFn: ({ mode, groupIds }: { mode: "public" | "groups"; groupIds?: string[] }) =>
      GroupService.updateBrowseScope(mode, groupIds),
    onSuccess: (result) => {
      if (!result.error) {
        queryClient.invalidateQueries({ queryKey: ["browseScope", user?.id] });
      }
    },
  });

  return {
    scope: scopeQuery.data?.data,
    scopeLoading: scopeQuery.isLoading,
    updateScope: updateScope.mutateAsync,
    updateScopeLoading: updateScope.isPending,
  };
};
