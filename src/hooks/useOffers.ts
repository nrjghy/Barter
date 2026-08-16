import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { OfferService } from "../services";

/**
 * The current-relevance offer for a connection (a `pending` or `agreed`
 * row, whichever exists) plus the four offer actions. Drives both the
 * composer button's disabled state and the pinned agreed-offer strip in
 * ChatThread. Polls on the same cadence as useMessages so the strip and
 * the thread never drift out of sync while a thread is open.
 */
export const useOffers = (connectionId?: string) => {
  const queryClient = useQueryClient();

  const { data: currentOfferData, isLoading: currentOfferLoading } = useQuery({
    queryKey: ["currentOffer", connectionId],
    queryFn: () => OfferService.getCurrentOfferForConnection(connectionId!),
    enabled: !!connectionId,
    refetchInterval: 4000,
  });

  const invalidateOfferQueries = () => {
    if (connectionId) {
      queryClient.invalidateQueries({ queryKey: ["currentOffer", connectionId] });
      queryClient.invalidateQueries({ queryKey: ["messages", connectionId] });
    }
    queryClient.invalidateQueries({ queryKey: ["offersByIds"] });
  };

  const createOffer = useMutation({
    mutationFn: ({
      connectionId,
      myItemIds,
      theirItemIds,
    }: {
      connectionId: string;
      myItemIds: string[];
      theirItemIds: string[];
    }) => OfferService.createOffer(connectionId, myItemIds, theirItemIds),
    onSuccess: invalidateOfferQueries,
  });

  const counterOffer = useMutation({
    mutationFn: ({
      offerId,
      myItemIds,
      theirItemIds,
    }: {
      offerId: string;
      myItemIds: string[];
      theirItemIds: string[];
    }) => OfferService.counterOffer(offerId, myItemIds, theirItemIds),
    onSuccess: invalidateOfferQueries,
  });

  const acceptOffer = useMutation({
    mutationFn: (offerId: string) => OfferService.acceptOffer(offerId),
    onSuccess: invalidateOfferQueries,
  });

  const withdrawOffer = useMutation({
    mutationFn: (offerId: string) => OfferService.withdrawOffer(offerId),
    onSuccess: invalidateOfferQueries,
  });

  return {
    currentOffer: currentOfferData?.data ?? null,
    currentOfferLoading,
    currentOfferError: currentOfferData?.error,

    createOffer: createOffer.mutateAsync,
    createOfferLoading: createOffer.isPending,

    counterOffer: counterOffer.mutateAsync,
    counterOfferLoading: counterOffer.isPending,

    acceptOffer: acceptOffer.mutateAsync,
    acceptOfferLoading: acceptOffer.isPending,

    withdrawOffer: withdrawOffer.mutateAsync,
    withdrawOfferLoading: withdrawOffer.isPending,
  };
};

/**
 * Offer details for a set of offer ids, keyed by id, regardless of status.
 * Used by ChatThread to render the item breakdown (and, for still-pending
 * offers, Accept/Modify) on each offer-related system message -- mirrors
 * useTradeCompletionsByIds's bulk-by-id convention.
 */
export const useOffersByIds = (ids: string[]) => {
  const sortedIds = [...ids].sort();

  const { data, isLoading, error } = useQuery({
    queryKey: ["offersByIds", sortedIds],
    queryFn: () => OfferService.getOffersByIds(sortedIds),
    enabled: sortedIds.length > 0,
  });

  return {
    offersById: data?.data ?? {},
    loading: isLoading,
    error: error || data?.error,
  };
};
