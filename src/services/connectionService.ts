import { supabase } from "../lib/supabase";
import { ServiceResult } from "./types";
import { ERROR_CODES, ERROR_MESSAGES, TABLES } from "./config";
import { ValidationService } from "./validation";

// -----------------------------------------------------------------------------
// Replaces MatchService for the connection-model rewrite (PRD §3). A
// "connection" is user-to-user, not item-to-item -- see connections /
// connection_item_interests in the 20260725000000_connection_model.sql
// migration.
//
// NOTE on connection_item_interests ownership: item_id_1 / item_id_2 on that
// table do NOT correspond to connections.user_id_1 / user_id_2. They're
// whichever item belonged to whoever performed the response that created that
// specific interest row (see check_and_create_match). So "which item is
// mine" has to be worked out per-row by comparing each item's owner to the
// viewing user, not by position. That's what toItemInterestPair below does.
// -----------------------------------------------------------------------------

export interface ConnectionUserSummary {
  id: string;
  username: string;
  avatarUrl?: string;
  isCurator?: boolean;
}

export interface ConnectionItemSummary {
  id: string;
  title: string;
  imageUrl?: string;
  listingType?: "trade" | "giveaway";
}

export interface ConnectionItemInterestPair {
  id: string;
  myItem: ConnectionItemSummary | null;
  theirItem: ConnectionItemSummary | null;
}

export interface ConnectionLastMessage {
  content: string;
  messageType: "text" | "photo" | "location" | "system";
  senderId: string;
  createdAt: string;
}

export interface ConnectionSummary {
  id: string;
  otherUser: ConnectionUserSummary;
  itemInterests: ConnectionItemInterestPair[];
  lastMessage: ConnectionLastMessage | null;
  isNew: boolean;
  createdAt: string;
  updatedAt: string;
}

// How many recent messages to pull across all of a user's connections when
// working out each connection's "last message" preview. Fine as a flat
// limit-then-reduce-client-side at pilot scale (10-15 people); would need a
// real "distinct on"-style query or a view if this ever needs to scale past
// a small pilot.
const LAST_MESSAGE_SCAN_LIMIT = 500;

export class ConnectionService {
  /**
   * Get all active connections for a user, for the Chat list.
   */
  static async getUserConnections(userId: string): Promise<ServiceResult<ConnectionSummary[]>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) return { error: uuidError };

      const { data: connectionRows, error: connectionsError } = await supabase
        .from(TABLES.CONNECTIONS)
        .select(
          `
          id,
          user_id_1,
          user_id_2,
          created_at,
          updated_at,
          user1:users!user_id_1 ( id, username, avatar_url, is_curator ),
          user2:users!user_id_2 ( id, username, avatar_url, is_curator )
        `
        )
        .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
        .eq("status", "active")
        .order("updated_at", { ascending: false });

      if (connectionsError) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch connections",
            details: connectionsError,
          },
        };
      }

      if (!connectionRows || connectionRows.length === 0) {
        return { data: [] };
      }

      const connectionIds = connectionRows.map((c: any) => c.id);

      const [interestsResult, lastMessagesResult, readsResult] = await Promise.all([
        this.fetchItemInterests(connectionIds),
        this.fetchLastMessages(connectionIds),
        this.fetchReadState(connectionIds, userId),
      ]);

      if (interestsResult.error) return { error: interestsResult.error };
      if (lastMessagesResult.error) return { error: lastMessagesResult.error };
      if (readsResult.error) return { error: readsResult.error };

      const interestsByConnection = interestsResult.data!;
      const lastMessageByConnection = lastMessagesResult.data!;
      const openedConnectionIds = readsResult.data!;

      const summaries: ConnectionSummary[] = connectionRows.map((row: any) =>
        this.toConnectionSummary(row, userId, interestsByConnection.get(row.id) || [], lastMessageByConnection.get(row.id) || null, openedConnectionIds.has(row.id))
      );

      return { data: summaries };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Get a single connection's detail, for opening a thread. Does NOT mark
   * it as opened -- call markConnectionOpened separately (a read fetching
   * data shouldn't silently have a write side effect).
   */
  static async getConnection(connectionId: string, userId: string): Promise<ServiceResult<ConnectionSummary>> {
    try {
      const connectionIdError = ValidationService.validateUUID(connectionId);
      const userIdError = ValidationService.validateUUID(userId);
      if (connectionIdError) return { error: connectionIdError };
      if (userIdError) return { error: userIdError };

      const { data: row, error: connectionError } = await supabase
        .from(TABLES.CONNECTIONS)
        .select(
          `
          id,
          user_id_1,
          user_id_2,
          created_at,
          updated_at,
          user1:users!user_id_1 ( id, username, avatar_url, is_curator ),
          user2:users!user_id_2 ( id, username, avatar_url, is_curator )
        `
        )
        .eq("id", connectionId)
        .single();

      if (connectionError) {
        if (connectionError.code === "PGRST116") {
          return {
            error: {
              code: ERROR_CODES.ITEM_NOT_FOUND,
              message: "Connection not found",
            },
          };
        }
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch connection",
            details: connectionError,
          },
        };
      }

      if (row.user_id_1 !== userId && row.user_id_2 !== userId) {
        return {
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: ERROR_MESSAGES[ERROR_CODES.UNAUTHORIZED],
          },
        };
      }

      const [interestsResult, lastMessagesResult, readsResult] = await Promise.all([
        this.fetchItemInterests([connectionId]),
        this.fetchLastMessages([connectionId]),
        this.fetchReadState([connectionId], userId),
      ]);

      if (interestsResult.error) return { error: interestsResult.error };
      if (lastMessagesResult.error) return { error: lastMessagesResult.error };
      if (readsResult.error) return { error: readsResult.error };

      const summary = this.toConnectionSummary(
        row,
        userId,
        interestsResult.data!.get(connectionId) || [],
        lastMessagesResult.data!.get(connectionId) || null,
        readsResult.data!.has(connectionId)
      );

      return { data: summary };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Marks a connection as opened by this user, clearing the "New" state.
   * Call this when a thread view mounts, not as part of fetching it.
   */
  static async markConnectionOpened(connectionId: string, userId: string): Promise<ServiceResult<boolean>> {
    try {
      const connectionIdError = ValidationService.validateUUID(connectionId);
      const userIdError = ValidationService.validateUUID(userId);
      if (connectionIdError) return { error: connectionIdError };
      if (userIdError) return { error: userIdError };

      const { error } = await supabase.from(TABLES.CONNECTION_READS).upsert(
        {
          connection_id: connectionId,
          user_id: userId,
          last_opened_at: new Date().toISOString(),
        },
        { onConflict: "connection_id,user_id" }
      );

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to mark connection as opened",
            details: error,
          },
        };
      }

      return { data: true };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Ends a connection (sets status='ended'). Used by Block, since the
   * approved design has a blocked connection disappear from the Chat
   * list entirely -- getUserConnections only returns status='active'
   * connections, so ending it here is what makes that happen.
   */
  static async endConnection(connectionId: string, userId: string): Promise<ServiceResult<boolean>> {
    try {
      const connectionIdError = ValidationService.validateUUID(connectionId);
      const userIdError = ValidationService.validateUUID(userId);
      if (connectionIdError) return { error: connectionIdError };
      if (userIdError) return { error: userIdError };

      const { data: connection, error: fetchError } = await supabase
        .from(TABLES.CONNECTIONS)
        .select("user_id_1, user_id_2")
        .eq("id", connectionId)
        .single();

      if (fetchError || !connection) {
        return {
          error: {
            code: ERROR_CODES.ITEM_NOT_FOUND,
            message: "Connection not found",
          },
        };
      }

      if (connection.user_id_1 !== userId && connection.user_id_2 !== userId) {
        return {
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: ERROR_MESSAGES[ERROR_CODES.UNAUTHORIZED],
          },
        };
      }

      const { error } = await supabase
        .from(TABLES.CONNECTIONS)
        .update({ status: "ended", ended_at: new Date().toISOString(), ended_by: userId })
        .eq("id", connectionId);

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to end connection",
            details: error,
          },
        };
      }

      return { data: true };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Private helpers
   */

  private static async fetchItemInterests(
    connectionIds: string[]
  ): Promise<ServiceResult<Map<string, any[]>>> {
    const { data, error } = await supabase
      .from(TABLES.CONNECTION_ITEM_INTERESTS)
      .select(
        `
        id,
        connection_id,
        item1:items!item_id_1 ( id, title, image_urls, user_id, listing_type ),
        item2:items!item_id_2 ( id, title, image_urls, user_id, listing_type )
      `
      )
      .in("connection_id", connectionIds);

    if (error) {
      return {
        error: {
          code: ERROR_CODES.NETWORK_ERROR,
          message: "Failed to fetch connection item interests",
          details: error,
        },
      };
    }

    const byConnection = new Map<string, any[]>();
    for (const row of data || []) {
      const list = byConnection.get(row.connection_id) || [];
      list.push(row);
      byConnection.set(row.connection_id, list);
    }
    return { data: byConnection };
  }

  private static async fetchLastMessages(
    connectionIds: string[]
  ): Promise<ServiceResult<Map<string, ConnectionLastMessage>>> {
    const { data, error } = await supabase
      .from(TABLES.MESSAGES)
      .select("connection_id, content, message_type, sender_id, created_at")
      .in("connection_id", connectionIds)
      .order("created_at", { ascending: false })
      .limit(LAST_MESSAGE_SCAN_LIMIT);

    if (error) {
      return {
        error: {
          code: ERROR_CODES.NETWORK_ERROR,
          message: "Failed to fetch recent messages",
          details: error,
        },
      };
    }

    // Rows arrive newest-first, so the first row seen per connection_id is
    // that connection's most recent message.
    const byConnection = new Map<string, ConnectionLastMessage>();
    for (const row of (data || []) as any[]) {
      if (!byConnection.has(row.connection_id)) {
        byConnection.set(row.connection_id, {
          content: row.content,
          messageType: row.message_type,
          senderId: row.sender_id,
          createdAt: row.created_at,
        });
      }
    }
    return { data: byConnection };
  }

  private static async fetchReadState(connectionIds: string[], userId: string): Promise<ServiceResult<Set<string>>> {
    const { data, error } = await supabase
      .from(TABLES.CONNECTION_READS)
      .select("connection_id")
      .eq("user_id", userId)
      .in("connection_id", connectionIds);

    if (error) {
      return {
        error: {
          code: ERROR_CODES.NETWORK_ERROR,
          message: "Failed to fetch connection read state",
          details: error,
        },
      };
    }

    return { data: new Set((data || []).map((row: any) => row.connection_id)) };
  }

  private static toItemSummary(item: any): ConnectionItemSummary | null {
    if (!item) return null;
    return {
      id: item.id,
      title: item.title,
      imageUrl: item.image_urls && item.image_urls.length > 0 ? item.image_urls[0] : undefined,
      listingType: item.listing_type,
    };
  }

  private static toConnectionSummary(
    row: any,
    userId: string,
    interestRows: any[],
    lastMessage: ConnectionLastMessage | null,
    isOpened: boolean
  ): ConnectionSummary {
    const otherUserRaw = row.user_id_1 === userId ? row.user2 : row.user1;

    const itemInterests: ConnectionItemInterestPair[] = interestRows.map((interest) => {
      if (!interest.item1) {
        // Giveaway interest: item_id_1 is null (no reciprocal item), so there's
        // nothing to match ownership against the usual way. item2 is the
        // giveaway item itself -- "mine" if the viewer is its owner (the
        // lister), otherwise "theirs" (the recipient's view). Without this
        // branch, the item silently disappears from the recipient's Chat
        // list and thread header, since neither of the checks below can
        // ever match when item1 doesn't exist.
        const item2IsMine = interest.item2?.user_id === userId;
        return {
          id: interest.id,
          myItem: item2IsMine ? this.toItemSummary(interest.item2) : null,
          theirItem: item2IsMine ? null : this.toItemSummary(interest.item2),
        };
      }
      const item1IsMine = interest.item1?.user_id === userId;
      const item2IsMine = interest.item2?.user_id === userId;
      const mine = item1IsMine ? interest.item1 : item2IsMine ? interest.item2 : null;
      const theirs = item1IsMine ? interest.item2 : item2IsMine ? interest.item1 : null;
      return {
        id: interest.id,
        myItem: this.toItemSummary(mine),
        theirItem: this.toItemSummary(theirs),
      };
    });

    return {
      id: row.id,
      otherUser: {
        id: otherUserRaw.id,
        username: otherUserRaw.username,
        avatarUrl: otherUserRaw.avatar_url,
        isCurator: otherUserRaw.is_curator,
      },
      itemInterests,
      lastMessage,
      isNew: !isOpened,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
