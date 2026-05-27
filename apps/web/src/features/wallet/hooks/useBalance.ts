import { useTokenBalances } from "./useTokenBalances"

export function useBalance() {
  const balancesQuery = useTokenBalances()

  return {
    ...balancesQuery,
    balance: balancesQuery.data?.XLM,
  }
}
