import { supabase } from "../lib/supabase";
import { ServiceResult } from "./types";
import { ERROR_CODES, ERROR_MESSAGES, TABLES } from "./config";

export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  creatorId: string;
  memberCount: number;
  role: "creator" | "member";
  createdAt: string;
}

export interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  creatorId: string;
  createdAt: string;
}

export interface GroupMember {
  membershipId: string;
  userId: string;
  username: string;
  role: "creator" | "member";
  joinedAt: string;
}

export interface BrowseScope {
  mode: "public" | "groups";
  groupIds: string[];
}

export interface GroupInviteLink {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  maxUses: number | null;
  useCount: number;
  revokedAt: string | null;
}

export type GroupInvitePreview =
  | { valid: true; groupId: string; groupName: string; groupDescription: string | null }
  | { valid: false; reason?: string };

export class GroupService {
  /**
   * Groups the current user belongs to, with member counts. RLS on `groups`
   * already scopes SELECT to the caller's own groups, so this is a plain
   * client query rather than an RPC.
   */
  static async getUserGroups(userId: string): Promise<ServiceResult<GroupSummary[]>> {
    try {
      const { data: memberships, error: membershipError } = await supabase
        .from(TABLES.GROUP_MEMBERSHIPS)
        .select("group_id, role")
        .eq("user_id", userId);

      if (membershipError) {
        return {
          error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to fetch groups", details: membershipError },
        };
      }

      if (!memberships || memberships.length === 0) {
        return { data: [] };
      }

      const roleByGroupId = new Map(memberships.map((m) => [m.group_id, m.role]));
      const groupIds = memberships.map((m) => m.group_id);

      const { data: groups, error } = await supabase
        .from(TABLES.GROUPS)
        .select("*, group_memberships(count)")
        .in("id", groupIds)
        .order("created_at", { ascending: false });

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to fetch groups", details: error } };
      }

      const transformed: GroupSummary[] = (groups || []).map((group: any) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        creatorId: group.creator_id,
        memberCount: group.group_memberships?.[0]?.count ?? 0,
        role: (roleByGroupId.get(group.id) as "creator" | "member") ?? "member",
        createdAt: group.created_at,
      }));

      return { data: transformed };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }

  static async getGroup(groupId: string): Promise<ServiceResult<GroupDetail>> {
    try {
      const { data, error } = await supabase.from(TABLES.GROUPS).select("*").eq("id", groupId).single();

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to fetch group", details: error } };
      }

      return {
        data: {
          id: data.id,
          name: data.name,
          description: data.description,
          creatorId: data.creator_id,
          createdAt: data.created_at,
        },
      };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }

  static async getGroupMembers(groupId: string): Promise<ServiceResult<GroupMember[]>> {
    try {
      const { data, error } = await supabase
        .from(TABLES.GROUP_MEMBERSHIPS)
        .select("id, user_id, role, joined_at, users(username)")
        .eq("group_id", groupId)
        .order("joined_at", { ascending: true });

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to fetch members", details: error } };
      }

      const transformed: GroupMember[] = (data || []).map((row: any) => ({
        membershipId: row.id,
        userId: row.user_id,
        username: row.users?.username ?? "",
        role: row.role,
        joinedAt: row.joined_at,
      }));

      return { data: transformed };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }

  /**
   * Group ids (within the caller's own groups) a given item is already
   * shared to -- used to prefill the share checklist when editing an item.
   */
  static async getItemGroupIds(itemId: string): Promise<ServiceResult<string[]>> {
    try {
      const { data, error } = await supabase.from(TABLES.ITEM_GROUPS).select("group_id").eq("item_id", itemId);

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to fetch item groups", details: error } };
      }

      return { data: (data || []).map((row) => row.group_id) };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }

  /**
   * The group ids checked on the caller's last create-mode listing publish --
   * used to pre-check AddEditItem's share checklist for a new listing.
   */
  static async getLastSelectedGroupIds(userId: string): Promise<ServiceResult<string[]>> {
    try {
      const { data, error } = await supabase
        .from(TABLES.USERS)
        .select("last_selected_group_ids")
        .eq("id", userId)
        .single();

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to fetch last selected groups", details: error } };
      }

      return { data: data.last_selected_group_ids ?? [] };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }

  /**
   * Remembers the group ids checked at create-mode publish time, so the next
   * new listing's share checklist starts pre-checked instead of blank.
   */
  static async updateLastSelectedGroups(groupIds: string[]): Promise<ServiceResult<null>> {
    try {
      const { error } = await supabase.rpc("update_last_selected_groups", { p_group_ids: groupIds });

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to save last selected groups", details: error } };
      }

      return { data: null };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }

  static async getBrowseScope(userId: string): Promise<ServiceResult<BrowseScope>> {
    try {
      const { data, error } = await supabase
        .from(TABLES.USERS)
        .select("browse_mode, browse_group_ids")
        .eq("id", userId)
        .single();

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to fetch browse scope", details: error } };
      }

      return { data: { mode: data.browse_mode ?? "public", groupIds: data.browse_group_ids ?? [] } };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }

  static async createGroup(name: string, description?: string): Promise<ServiceResult<{ groupId: string }>> {
    try {
      const { data, error } = await supabase.rpc("create_group", {
        p_name: name,
        p_description: description ?? null,
      });

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to create group", details: error } };
      }
      if (data?.error) {
        return { error: { code: ERROR_CODES.VALIDATION_ERROR, message: data.error } };
      }

      return { data: { groupId: data.groupId } };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }

  static async inviteToGroup(
    groupId: string,
    identifier: string
  ): Promise<ServiceResult<{ groupId: string; invitedUserId: string }>> {
    try {
      const { data, error } = await supabase.rpc("invite_to_group", {
        p_group_id: groupId,
        p_identifier: identifier,
      });

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to send invite", details: error } };
      }
      if (data?.error) {
        return { error: { code: ERROR_CODES.VALIDATION_ERROR, message: data.error } };
      }

      return { data: { groupId: data.groupId, invitedUserId: data.invitedUserId } };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }

  static async acceptGroupInvite(groupId: string): Promise<ServiceResult<{ groupId: string }>> {
    try {
      const { data, error } = await supabase.rpc("accept_group_invite", { p_group_id: groupId });

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to accept invite", details: error } };
      }
      if (data?.error) {
        return { error: { code: ERROR_CODES.VALIDATION_ERROR, message: data.error } };
      }

      return { data: { groupId: data.groupId } };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }

  static async declineGroupInvite(groupId: string): Promise<ServiceResult<{ groupId: string }>> {
    try {
      const { data, error } = await supabase.rpc("decline_group_invite", { p_group_id: groupId });

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to decline invite", details: error } };
      }
      if (data?.error) {
        return { error: { code: ERROR_CODES.VALIDATION_ERROR, message: data.error } };
      }

      return { data: { groupId: data.groupId } };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }

  static async transferGroupOwnership(
    groupId: string,
    newCreatorUsername: string
  ): Promise<ServiceResult<{ groupId: string; newCreatorId: string }>> {
    try {
      const { data, error } = await supabase.rpc("transfer_group_ownership", {
        p_group_id: groupId,
        p_new_creator_username: newCreatorUsername,
      });

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to transfer ownership", details: error } };
      }
      if (data?.error) {
        return { error: { code: ERROR_CODES.VALIDATION_ERROR, message: data.error } };
      }

      return { data: { groupId: data.groupId, newCreatorId: data.newCreatorId } };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }

  static async leaveGroup(groupId: string): Promise<ServiceResult<{ groupId: string }>> {
    try {
      const { data, error } = await supabase.rpc("leave_group", { p_group_id: groupId });

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to leave group", details: error } };
      }
      if (data?.error) {
        return { error: { code: ERROR_CODES.VALIDATION_ERROR, message: data.error } };
      }

      return { data: { groupId: data.groupId } };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }

  static async removeMember(groupId: string, memberId: string): Promise<ServiceResult<{ removedUserId: string }>> {
    try {
      const { data, error } = await supabase.rpc("remove_group_member", {
        p_group_id: groupId,
        p_member_id: memberId,
      });

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to remove member", details: error } };
      }
      if (data?.error) {
        return { error: { code: ERROR_CODES.VALIDATION_ERROR, message: data.error } };
      }

      return { data: { removedUserId: data.removedUserId } };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }

  static async deleteGroup(groupId: string): Promise<ServiceResult<{ groupName: string }>> {
    try {
      const { data, error } = await supabase.rpc("delete_group", { p_group_id: groupId });

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to delete group", details: error } };
      }
      if (data?.error) {
        return { error: { code: ERROR_CODES.VALIDATION_ERROR, message: data.error } };
      }

      return { data: { groupName: data.groupName } };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }

  /**
   * Full replace, not incremental -- always pass the item's complete desired
   * set of group ids.
   */
  static async setItemGroups(itemId: string, groupIds: string[]): Promise<ServiceResult<{ itemId: string; groupCount: number }>> {
    try {
      const { data, error } = await supabase.rpc("set_item_groups", {
        p_item_id: itemId,
        p_group_ids: groupIds,
      });

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to update item visibility", details: error } };
      }
      if (data?.error) {
        return { error: { code: ERROR_CODES.VALIDATION_ERROR, message: data.error } };
      }

      return { data: { itemId: data.itemId, groupCount: data.groupCount } };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }

  static async updateBrowseScope(mode: "public" | "groups", groupIds?: string[]): Promise<ServiceResult<BrowseScope>> {
    try {
      const { data, error } = await supabase.rpc("update_browse_scope", {
        p_mode: mode,
        p_group_ids: groupIds ?? null,
      });

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to update browse scope", details: error } };
      }
      if (data?.error) {
        return { error: { code: ERROR_CODES.VALIDATION_ERROR, message: data.error } };
      }

      return { data: { mode: data.mode, groupIds: data.groupIds ?? [] } };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }

  /**
   * Creator-only. Creates a new shareable invite link for the group,
   * expiring 7 days from creation (server-side default).
   */
  static async createGroupInviteLink(
    groupId: string
  ): Promise<ServiceResult<{ linkId: string; token: string; expiresAt: string }>> {
    try {
      const { data, error } = await supabase.rpc("create_group_invite_link", { p_group_id: groupId });

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to create invite link", details: error } };
      }
      if (data?.error) {
        return { error: { code: ERROR_CODES.VALIDATION_ERROR, message: data.error } };
      }

      return { data: { linkId: data.linkId, token: data.token, expiresAt: data.expiresAt } };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }

  /**
   * Creator-only -- the RPC itself rejects non-creator callers, this just
   * surfaces that as a normal ServiceResult error.
   */
  static async listGroupInviteLinks(groupId: string): Promise<ServiceResult<GroupInviteLink[]>> {
    try {
      const { data, error } = await supabase.rpc("list_group_invite_links", { p_group_id: groupId });

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to fetch invite links", details: error } };
      }
      if (data?.error) {
        return { error: { code: ERROR_CODES.VALIDATION_ERROR, message: data.error } };
      }

      const links: GroupInviteLink[] = (data.links ?? []).map((link: any) => ({
        id: link.id,
        token: link.token,
        createdAt: link.createdAt,
        expiresAt: link.expiresAt,
        maxUses: link.maxUses ?? null,
        useCount: link.useCount,
        revokedAt: link.revokedAt ?? null,
      }));

      return { data: links };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }

  static async revokeGroupInviteLink(linkId: string): Promise<ServiceResult<null>> {
    try {
      const { data, error } = await supabase.rpc("revoke_group_invite_link", { p_link_id: linkId });

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to revoke invite link", details: error } };
      }
      if (data?.error) {
        return { error: { code: ERROR_CODES.VALIDATION_ERROR, message: data.error } };
      }

      return { data: null };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }

  /**
   * Public, unauthenticated lookup for the /join/:token landing page -- no
   * group details beyond name/description are ever returned, and an
   * invalid/expired/revoked token comes back as { valid: false } rather
   * than an error, so the page can render a plain not-valid state.
   */
  static async getGroupInvitePreview(token: string): Promise<ServiceResult<GroupInvitePreview>> {
    try {
      const { data, error } = await supabase.rpc("get_group_invite_preview", { p_token: token });

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to load invite", details: error } };
      }

      if (!data.valid) {
        return { data: { valid: false, reason: data.reason } };
      }

      return {
        data: {
          valid: true,
          groupId: data.groupId,
          groupName: data.groupName,
          groupDescription: data.groupDescription ?? null,
        },
      };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }

  static async joinGroupViaLink(token: string): Promise<ServiceResult<{ groupId: string; alreadyMember: boolean }>> {
    try {
      const { data, error } = await supabase.rpc("join_group_via_link", { p_token: token });

      if (error) {
        return { error: { code: ERROR_CODES.NETWORK_ERROR, message: "Failed to join group", details: error } };
      }
      if (data?.error) {
        return { error: { code: ERROR_CODES.VALIDATION_ERROR, message: data.error } };
      }

      return { data: { groupId: data.groupId, alreadyMember: data.alreadyMember } };
    } catch (error) {
      return {
        error: { code: ERROR_CODES.UNKNOWN_ERROR, message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR], details: error },
      };
    }
  }
}
