import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { ConnectionService } from "../services";

/**
 * List of the current user's active connections, for the Chat list screen.
 */
export const useConnections = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: connectionsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["connections", user?.id],
    queryFn: () => ConnectionService.getUserConnections(user!.id),
    enabled: !!user,
  });

  const markOpened = useMutation({
    mutationFn: (connectionId: string) => ConnectionService.markConnectionOpened(connectionId, user!.id),
    onSuccess: (_result, connectionId) => {
      queryClient.invalidateQueries({ queryKey: ["connections", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["connection", connectionId, user?.id] });
    },
  });

  return {
    connections: connectionsData?.data ?? [],
    loading: isLoading,
    error: error || connectionsData?.error,
    markConnectionOpened: (connectionId: string) => markOpened.mutateAsync(connectionId),
  };
};

/**
 * A single connection's detail, for the (still-placeholder, step 3 will
 * replace this) thread screen.
 */
export const useConnection = (connectionId?: string) => {
  const { user } = useAuth();

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["connection", connectionId, user?.id],
    queryFn: () => ConnectionService.getConnection(connectionId!, user!.id),
    enabled: !!connectionId && !!user,
  });

  return {
    connection: data?.data,
    loading: isLoading,
    error: error || data?.error,
  };
};
