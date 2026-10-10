import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes fresh cache
        gcTime: 1000 * 60 * 30, // 30 minutes garbage collection
        refetchOnWindowFocus: false, // Prevent background refetches when switching tabs
        refetchOnReconnect: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    dehydrate: () => ({
      queryClientState: dehydrate(queryClient),
    }),
    hydrate: (dehydrated: any) => {
      if (dehydrated?.queryClientState) {
        hydrate(queryClient, dehydrated.queryClientState);
      }
    },
  });

  return router;
};

