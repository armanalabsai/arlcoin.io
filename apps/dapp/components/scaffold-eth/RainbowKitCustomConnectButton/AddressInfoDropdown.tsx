// Adapted from Scaffold-ETH 2 (MIT, BuidlGuidl):
// packages/nextjs/components/scaffold-eth/RainbowKitCustomConnectButton/AddressInfoDropdown.tsx.
// ARL: no ENS (no Ethereum Mainnet), no QR code, no burner key reveal, no block explorer.
import { useRef, useState } from "react";
import { getAddress } from "viem";
import type { Address } from "viem";
import { useDisconnect } from "wagmi";
import {
  ArrowLeftEndOnRectangleIcon,
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  DocumentDuplicateIcon,
} from "@heroicons/react/24/outline";

import { NetworkOptions } from "./NetworkOptions";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { useCopyToClipboard, useOutsideClick } from "~~/hooks/scaffold-eth";
import { getTargetNetworks } from "~~/utils/scaffold-eth";

const allowedNetworks = getTargetNetworks();

export const AddressInfoDropdown = ({ address }: { address: Address }) => {
  const { disconnect } = useDisconnect();
  const checkSumAddress = getAddress(address);
  const { copyToClipboard, isCopiedToClipboard } = useCopyToClipboard();
  const [selectingNetwork, setSelectingNetwork] = useState(false);
  const dropdownRef = useRef<HTMLDetailsElement>(null);

  const closeDropdown = () => {
    setSelectingNetwork(false);
    dropdownRef.current?.removeAttribute("open");
  };
  useOutsideClick(dropdownRef, closeDropdown);

  return (
    <details ref={dropdownRef} className="dropdown dropdown-end leading-3">
      <summary className="btn btn-secondary btn-sm h-auto! gap-0 pl-0 pr-2" data-testid="account">
        <BlockieAvatar address={checkSumAddress} size={30} />
        <span className="mr-1 ml-2">
          {checkSumAddress.slice(0, 6)}…{checkSumAddress.slice(-4)}
        </span>
        <ChevronDownIcon className="ml-2 h-6 w-4 sm:ml-0" />
      </summary>
      <ul className="dropdown-content menu z-2 mt-2 gap-1 bg-base-200 p-2 shadow-lg">
        <NetworkOptions hidden={!selectingNetwork} />
        <li className={selectingNetwork ? "hidden" : ""}>
          <button
            className="btn-sm flex h-8 gap-3 py-3"
            type="button"
            onClick={() => copyToClipboard(checkSumAddress)}
          >
            {isCopiedToClipboard ? (
              <CheckCircleIcon className="ml-2 h-6 w-4 sm:ml-0" aria-hidden="true" />
            ) : (
              <DocumentDuplicateIcon className="ml-2 h-6 w-4 sm:ml-0" aria-hidden="true" />
            )}
            <span className="whitespace-nowrap">
              {isCopiedToClipboard ? "Copied" : "Copy address"}
            </span>
          </button>
        </li>
        {allowedNetworks.length > 1 ? (
          <li className={selectingNetwork ? "hidden" : ""}>
            <button
              className="btn-sm flex h-8 gap-3 py-3"
              type="button"
              onClick={() => setSelectingNetwork(true)}
            >
              <ArrowsRightLeftIcon className="ml-2 h-6 w-4 sm:ml-0" /> <span>Switch network</span>
            </button>
          </li>
        ) : null}
        <li className={selectingNetwork ? "hidden" : ""}>
          <button
            className="menu-item btn-sm flex h-8 gap-3 py-3 text-error"
            type="button"
            onClick={() => disconnect()}
          >
            <ArrowLeftEndOnRectangleIcon className="ml-2 h-6 w-4 sm:ml-0" /> <span>Disconnect</span>
          </button>
        </li>
      </ul>
    </details>
  );
};
