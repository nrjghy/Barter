import { supabase } from "../lib/supabase";
import { ServiceResult } from "./types";
import { ERROR_CODES, ERROR_MESSAGES, TABLES } from "./config";
import { ValidationService } from "./validation";

export interface CreateOfferResult {
  offerId: string;
  expiresAt: string;
}

export interface AcceptOfferResult {
  offerId: string;
  agreedExpiresAt: string;
}

export interface WithdrawOfferResult {
  offerId: string;
  status: string;
}

export type OfferStatus = "pending" | "agreed" | "superseded" | "withdrawn" | "expired" | "completed";

export interface OfferItemSummary {
  id: string;
  title: string;
  imageUrls?: string[];
  offeredBy: string;
}

export interface OfferSummary {
  id: string;
  connectionId: string;
  proposedBy: string;
  status: OfferStatus;
  expiresAt: string;
  agreedAt: string | null;
  agreedExpiresAt: string | null;
  items: OfferItemSummary[];
}

const OFFER_SELECT = `
  id,
  connection_id,
  proposed_by,
  status,
  expires_at,
  agreed_at,
  agreed_expires_at,
  offer_items ( item_id, offered_by, items ( title, image_urls ) )
`;

interface OfferRow {
  id: string;
  connection_id: string;
  proposed_by: string;
  status: OfferStatus;
  expires_at: string;
  agreed_at: string | null;
  agreed_expires_at: string | null;
  offer_items: Array<{
    item_id: string;
    offered_by: string;
    items: { title: string; image_urls: string[] | null } | null;
  }> | null;
}

function toOfferSummary(row: OfferRow): OfferSummary {
  return {
    id: row.id,
    connectionId: row.connection_id,
    proposedBy: row.proposed_by,
    status: row.status,
    expiresAt: row.expires_at,
    agreedAt: row.agreed_at,
    agreedExpiresAt: row.agreed_expires_at,
    items: (row.offer_items || []).map((offerItem) => ({
      id: offerItem.item_id,
      title: offerItem.items?.title ?? "",
      imageUrls: offerItem.items?.image_urls ?? undefined,
      offeredBy: offerItem.offered_by,
    })),
  };
}

export class OfferService {
  /**
   * Proposes a new trade via the create_offer RPC. Has to be an RPC, not a
   * plain client insert, since it also validates both sides' items are
   * active and owned by the right person, and inserts the system message +
   * recipient notification atomically.
   *
   * Follows the same two-layer error convention as TradeCompletionService:
   * `error` below is a client/network-level failure; a separate
   * `result.error` string inside the RPC's own jsonb response means the
   * call went through but the function rejected it (item no longer active,
   * connection not active, etc).
   */
  static async createOffer(
    connectionId: string,
    myItemIds: string[],
    theirItemIds: string[]
  ): Promise<ServiceResult<CreateOfferResult>> {
    try {
      const connectionIdError = ValidationService.validateUUID(connectionId);
      if (connectionIdError) return { error: connectionIdError };

      if (!myItemIds.length || !theirItemIds.length) {
        return {
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: "Select at least one item on each side",
          },
        };
      }

      const { data: result, error } = await supabase.rpc("create_offer", {
        p_connection_id: connectionId,
        p_my_item_ids: myItemIds,
        p_their_item_ids: theirItemIds,
      });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to send offer",
            details: error,
          },
        };
      }

      if (result?.error) {
        return {
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: result.error,
          },
        };
      }

      return {
        data: {
          offerId: result.offerId,
          expiresAt: result.expiresAt,
        },
      };
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
   * Counters a pending offer via the counter_offer RPC -- only the
   * recipient of a pending offer may do this (server-enforced). Same
   * two-layer error convention as createOffer above.
   */
  static async counterOffer(
    offerId: string,
    myItemIds: string[],
    theirItemIds: string[]
  ): Promise<ServiceResult<CreateOfferResult>> {
    try {
      const offerIdError = ValidationService.validateUUID(offerId);
      if (offerIdError) return { error: offerIdError };

      if (!myItemIds.length || !theirItemIds.length) {
        return {
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: "Select at least one item on each side",
          },
        };
      }

      const { data: result, error } = await supabase.rpc("counter_offer", {
        p_offer_id: offerId,
        p_my_item_ids: myItemIds,
        p_their_item_ids: theirItemIds,
      });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to send counter-offer",
            details: error,
          },
        };
      }

      if (result?.error) {
        return {
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: result.error,
          },
        };
      }

      return {
        data: {
          offerId: result.offerId,
          expiresAt: result.expiresAt,
        },
      };
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
   * Accepts a pending offer via the accept_offer RPC -- only the recipient
   * may do this. Same two-layer error convention as createOffer above.
   */
  static async acceptOffer(offerId: string): Promise<ServiceResult<AcceptOfferResult>> {
    try {
      const offerIdError = ValidationService.validateUUID(offerId);
      if (offerIdError) return { error: offerIdError };

      const { data: result, error } = await supabase.rpc("accept_offer", {
        p_offer_id: offerId,
      });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to accept offer",
            details: error,
          },
        };
      }

      if (result?.error) {
        return {
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: result.error,
          },
        };
      }

      return {
        data: {
          offerId: result.offerId,
          agreedExpiresAt: result.agreedExpiresAt,
        },
      };
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
   * Withdraws a pending or agreed offer via the withdraw_offer RPC.
   * Eligibility differs by stage (server-enforced): while pending, only the
   * proposer can withdraw; once agreed, either participant can. Same
   * two-layer error convention as createOffer above.
   */
  static async withdrawOffer(offerId: string): Promise<ServiceResult<WithdrawOfferResult>> {
    try {
      const offerIdError = ValidationService.validateUUID(offerId);
      if (offerIdError) return { error: offerIdError };

      const { data: result, error } = await supabase.rpc("withdraw_offer", {
        p_offer_id: offerId,
      });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to withdraw offer",
            details: error,
          },
        };
      }

      if (result?.error) {
        return {
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: result.error,
          },
        };
      }

      return {
        data: {
          offerId: result.offerId,
          status: result.status,
        },
      };
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
   * Fetches the current-relevance offer for a connection -- a `pending` or
   * `agreed` row, whichever exists (a connection can have at most one of
   * either at a time; server-enforced for pending via a partial unique
   * index, and the composer button disables itself once one exists so a
   * second agreed offer never gets proposed). Drives both the composer
   * button's disabled state and the pinned strip's visibility in
   * ChatThread. Returns null when neither exists -- no active offer.
   */
  static async getCurrentOfferForConnection(connectionId: string): Promise<ServiceResult<OfferSummary | null>> {
    try {
      const connectionIdError = ValidationService.validateUUID(connectionId);
      if (connectionIdError) return { error: connectionIdError };

      const { data, error } = await supabase
        .from(TABLES.OFFERS)
        .select(OFFER_SELECT)
        .eq("connection_id", connectionId)
        .in("status", ["pending", "agreed"]);

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch current offer",
            details: error,
          },
        };
      }

      const rows = (data as unknown as OfferRow[]) || [];
      const preferred = rows.find((row) => row.status === "agreed") ?? rows.find((row) => row.status === "pending");

      return { data: preferred ? toOfferSummary(preferred) : null };
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
   * Fetches offer details for a set of offer ids, keyed by id, regardless
   * of status. Used by ChatThread to render the item breakdown (and,
   * for still-pending offers, Accept/Modify) on each offer-related system
   * message -- mirrors getTradeCompletionsByIds's bulk-by-id convention.
   */
  static async getOffersByIds(offerIds: string[]): Promise<ServiceResult<Record<string, OfferSummary>>> {
    try {
      if (!offerIds || offerIds.length === 0) return { data: {} };

      const { data, error } = await supabase.from(TABLES.OFFERS).select(OFFER_SELECT).in("id", offerIds);

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch offers",
            details: error,
          },
        };
      }

      const byId: Record<string, OfferSummary> = {};
      for (const row of (data as unknown as OfferRow[]) || []) {
        byId[row.id] = toOfferSummary(row);
      }

      return { data: byId };
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
}
