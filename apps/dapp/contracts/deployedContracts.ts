/**
 * The ARL contracts the app knows, by chain: the local fixture (localContracts.ts) and the Base
 * Mainnet deployment (baseMainnetContracts.ts). Both are generated; see scripts/.
 */
import baseMainnetContracts from "./baseMainnetContracts";
import localContracts from "./localContracts";

import type { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";

const deployedContracts = { ...localContracts, ...baseMainnetContracts } as const;

export default deployedContracts satisfies GenericContractsDeclaration;
