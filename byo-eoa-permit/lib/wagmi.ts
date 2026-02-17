import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { mainnet, optimism, arbitrum, base, polygon } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "BYO EOA Permit",
  projectId: "db4ebdffa6043abbcc7483d5d5dc4e02",
  chains: [mainnet, base, arbitrum, optimism, polygon],
  ssr: true,
});
