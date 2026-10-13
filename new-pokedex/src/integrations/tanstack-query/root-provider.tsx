import { QueryClient } from '@tanstack/react-query'

export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      // pages show API errors immediately and refresh only when the user asks
      queries: { retry: false, refetchOnWindowFocus: false },
    },
  })

  return {
    queryClient,
  }
}
export default function TanstackQueryProvider() {}
