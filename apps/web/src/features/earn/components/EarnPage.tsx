import { Navbar } from "../../../ui/Navbar"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@workspace/ui/components/tabs"
import { PortfolioTab } from "./portfolio/PortfolioTab"

function ComingSoonTab({ label }: { label: string }) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-2 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/40">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="text-muted-foreground/60"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <p className="text-sm font-medium text-foreground/60">{label}</p>
      <p className="text-xs text-muted-foreground">Coming soon</p>
    </div>
  )
}

export function EarnPage() {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <Navbar variant="app" />
      <div className="mx-auto w-full max-w-260 px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <header className="mb-7">
          <h1 className="text-[22px] font-semibold tracking-tight">Earn</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Stake SO4 and buy GLV or GM to earn rewards
          </p>
        </header>

        <Tabs defaultValue="portfolio" className="gap-6">
          <TabsList className="h-9">
            <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
            <TabsTrigger value="discover">Discover</TabsTrigger>
            <TabsTrigger value="additional">Additional opportunities</TabsTrigger>
            <TabsTrigger value="distributions">Distributions</TabsTrigger>
          </TabsList>

          <TabsContent value="portfolio">
            <PortfolioTab />
          </TabsContent>
          <TabsContent value="discover">
            <ComingSoonTab label="Discover" />
          </TabsContent>
          <TabsContent value="additional">
            <ComingSoonTab label="Additional opportunities" />
          </TabsContent>
          <TabsContent value="distributions">
            <ComingSoonTab label="Distributions" />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
