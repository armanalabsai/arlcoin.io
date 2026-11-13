// The wallet the ARL node signs with: a private key kept in n8n's encrypted credential store and
// a Base Mainnet RPC endpoint. Use a dedicated wallet that holds only what the workflow needs.

import type { ICredentialType, INodeProperties } from "../n8n.ts";

export class ArlWalletApi implements ICredentialType {
  name = "arlWalletApi";
  displayName = "ARL Wallet API";
  documentationUrl = "https://github.com/armanalabsai/arlcoin.io/tree/main/packages/n8n-nodes-arl";
  icon = "file:arl.svg";
  properties: INodeProperties[] = [
    {
      displayName: "Private Key",
      name: "privateKey",
      type: "string",
      typeOptions: { password: true },
      default: "",
      required: true,
      placeholder: "0x…",
      description:
        "Private key of a dedicated wallet on Base Mainnet that pays gas and, for clients, the job budget. Never use a wallet that holds more than the workflow needs.",
    },
    {
      displayName: "RPC URL",
      name: "rpcUrl",
      type: "string",
      default: "https://mainnet.base.org",
      description: "A Base Mainnet JSON-RPC endpoint",
    },
  ];
}
