import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { assistantApi, type AskAssistantInput } from '@/lib/api/assistant';

/**
 * Assistant server state. Conversations live under one prefix so a new turn, a deletion or a fresh
 * conversation all refresh the history list without any caller naming it.
 */
export const assistantKeys = {
  all: ['assistant'] as const,
  status: () => ['assistant', 'status'] as const,
  conversations: () => ['assistant', 'conversations'] as const,
  conversation: (id: string) => ['assistant', 'conversation', id] as const,
};

/** Whether the assistant is available at all, and whether its answers come from the development fixture. */
export function useAssistantStatus() {
  return useQuery({
    queryKey: assistantKeys.status(),
    queryFn: ({ signal }) => assistantApi.status(signal),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAssistantConversations(enabled = true) {
  return useInfiniteQuery({
    queryKey: assistantKeys.conversations(),
    queryFn: ({ pageParam, signal }) => assistantApi.conversations(pageParam, 20, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNextPage ? last.pageNumber + 1 : undefined),
    enabled,
  });
}

export function useAssistantConversation(id: string | null) {
  return useQuery({
    queryKey: assistantKeys.conversation(id ?? ''),
    queryFn: ({ signal }) => assistantApi.conversation(id!, signal),
    enabled: Boolean(id),
  });
}

/**
 * Asks one question. The same client id travels with every retry of the same question, so a send that failed
 * on the way back returns the turn the server already stored instead of asking again.
 */
export function useAskAssistant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AskAssistantInput) => assistantApi.ask(input),
    onSuccess: (conversation) => {
      queryClient.setQueryData(assistantKeys.conversation(conversation.id), conversation);
      void queryClient.invalidateQueries({ queryKey: assistantKeys.conversations() });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => assistantApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assistantKeys.all }),
  });
}
