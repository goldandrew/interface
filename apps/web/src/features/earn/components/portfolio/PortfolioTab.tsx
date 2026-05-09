import { RewardsBar } from "./RewardsBar"
import { RecommendedAssets } from "./RecommendedAssets"
import { AssetsList } from "./AssetsList"

export function PortfolioTab() {
  return (
    <div className="space-y-8">
      <RewardsBar />
      <RecommendedAssets />
      <AssetsList />
    </div>
  )
}
