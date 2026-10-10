/**
 * The ARL contracts the app knows, by chain: the local fixture (localContracts.ts) and the Base
 * Sepolia deployment (baseSepoliaContracts.ts). Both are generated; see scripts/.
 */
import baseSepoliaContracts from "./baseSepoliaContracts";
import localContracts from "./localContracts";

import type { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";

const deployedContracts = { ...localContracts, ...baseSepoliaContracts } as const;

export default deployedContracts satisfies GenericContractsDeclaration;
