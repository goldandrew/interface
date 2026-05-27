import { useWalletStore } from "../store/wallet-store"

export function useWallet() {
  const address = useWalletStore((state) => state.address)
  const status = useWalletStore((state) => state.status)
  const network = useWalletStore((state) => state.network)
  const disconnect = useWalletStore((state) => state.setDisconnected)

  return {
    address,
    status,
    network,
    disconnect,
  }
}
