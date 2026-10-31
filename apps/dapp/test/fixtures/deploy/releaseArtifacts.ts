/**
 * Creation code of the released ARL contracts (main at f12604c, contracts as audited at 00d9056),
 * before the 2026-10-28 audit fixes. The published plans in public/plans (executed on Base
 * Sepolia and Base Mainnet) and the rehearsal fixtures in this folder were built from it, so the
 * tests read them against this set. The deploy screen itself accepts only the current build
 * (lib/deployArtifacts.ts). Copied verbatim from that release's lib/deployArtifacts.ts.
 */
export const RELEASE_ARTIFACTS = {
  ARLVestingWallet: {
    creationHash: "0xec33acfaaeb7a7eeec179484b0b7e26f649feca2ebe45ad2d7e56e53c809b1ca",
    creationSize: 2857,
    constructorInputs: [
      {
        name: "beneficiary",
        type: "address",
        internalType: "address",
      },
      {
        name: "cliffStart_",
        type: "uint64",
        internalType: "uint64",
      },
      {
        name: "cliffEnd_",
        type: "uint64",
        internalType: "uint64",
      },
      {
        name: "vestingEnd_",
        type: "uint64",
        internalType: "uint64",
      },
    ],
  },
  ARLTimelock: {
    creationHash: "0x7ebd1071cb25c96daf20bbcf5c524c0946d38d49511ff775081d86f5e0f81356",
    creationSize: 7938,
    constructorInputs: [
      {
        name: "minDelay",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "proposers",
        type: "address[]",
        internalType: "address[]",
      },
      {
        name: "executors",
        type: "address[]",
        internalType: "address[]",
      },
      {
        name: "guardian",
        type: "address",
        internalType: "address",
      },
    ],
  },
  ARLToken: {
    creationHash: "0xe45878e1c9fca3c5b5450898e5ebf53ee2574d19c80c0011ac8acbabd6fcb0b1",
    creationSize: 5911,
    constructorInputs: [
      {
        name: "r",
        type: "tuple",
        internalType: "struct ARLToken.Recipients",
        components: [
          {
            name: "publicLaunch",
            type: "address",
            internalType: "address",
          },
          {
            name: "communityStaking",
            type: "address",
            internalType: "address",
          },
          {
            name: "ecosystemGrowth",
            type: "address",
            internalType: "address",
          },
          {
            name: "strategicPartnerships",
            type: "address",
            internalType: "address",
          },
          {
            name: "liquidity",
            type: "address",
            internalType: "address",
          },
          {
            name: "founder",
            type: "address",
            internalType: "address",
          },
          {
            name: "investors",
            type: "address",
            internalType: "address",
          },
          {
            name: "treasury",
            type: "address",
            internalType: "address",
          },
          {
            name: "team",
            type: "address",
            internalType: "address",
          },
          {
            name: "earlyUsers",
            type: "address",
            internalType: "address",
          },
          {
            name: "grantsBugBounty",
            type: "address",
            internalType: "address",
          },
        ],
      },
    ],
  },
  ARLJobs: {
    creationHash: "0xdb31fe27bf1443a256da4e52fa9fa243ce9e86d7f43863e7ef014449e17df327",
    creationSize: 5143,
    constructorInputs: [
      {
        name: "paymentToken_",
        type: "address",
        internalType: "contract IERC20",
      },
    ],
  },
  ARLVerifiedEvaluator: {
    creationHash: "0x02f3a47b045158d3c4521170c90ccd15c7c2b3b228fec9c869a692ae0cd0d901",
    creationSize: 14529,
    constructorInputs: [
      {
        name: "jobs_",
        type: "address",
        internalType: "contract ARLJobs",
      },
      {
        name: "arbiter_",
        type: "address",
        internalType: "address",
      },
      {
        name: "minChallengeWindow_",
        type: "uint64",
        internalType: "uint64",
      },
      {
        name: "minBond_",
        type: "uint96",
        internalType: "uint96",
      },
      {
        name: "identity_",
        type: "address",
        internalType: "contract IERC8004Identity",
      },
      {
        name: "reputation_",
        type: "address",
        internalType: "contract IERC8004Reputation",
      },
      {
        name: "stakeToken_",
        type: "address",
        internalType: "contract IERC20",
      },
    ],
  },
} as const;
