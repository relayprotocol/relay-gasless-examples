import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  portoWallet,
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
  safeWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { base, mainnet, optimism, arbitrum } from "wagmi/chains";

const projectId = "db4ebdffa6043abbcc7483d5d5dc4e02";

const connectors = connectorsForWallets(
  [
    {
      groupName: "Smart Wallets",
      wallets: [safeWallet, coinbaseWallet],
    },
    {
      groupName: "Other Wallets",
      wallets: [metaMaskWallet, walletConnectWallet],
    },
  ],
  {
    appName: "Relay Origin Subsidy",
    projectId,
  },
);

export const config = createConfig({
  chains: [base, arbitrum, optimism, mainnet],
  connectors,
  transports: {
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [mainnet.id]: http(),
  },
});
