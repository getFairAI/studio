/*
 * Fair Protocol, open source decentralised inference marketplace for artificial intelligence.
 * Copyright (C) 2023 Fair Protocol
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see http://www.gnu.org/licenses/.
 */

import { U_CONTRACT_ID, U_DIVIDER } from '@/constants';
import { ITag } from '@/interfaces/arweave';
import { UState, warp } from './warp';
import { Tag } from 'warp-contracts';
import { wallet } from '@/utils/arweave';
import { InjectedArweaveSigner } from 'warp-contracts-plugin-signature';

const contract = warp.contract(U_CONTRACT_ID).setEvaluationOptions({
  remoteStateSyncSource: 'https://dre-u.warp.cc/contract',
  remoteStateSyncEnabled: true,
  unsafeClient: 'skip',
  allowBigInt: true,
  internalWrites: true,
});

type walletType = typeof wallet.namespaces.arweaveWallet | typeof window.arweaveWallet;

export const connectToU = async (wallet: walletType) => {
  const signer = new InjectedArweaveSigner(wallet);
  await signer.setPublicKey();
  signer.getAddress = wallet.getActiveAddress;
  contract.connect(signer);
};

export const getUBalance = async (address: string) => {
  try {
    const { cachedValue } = await contract.readState();

    return (cachedValue as UState).state.balances[address];
  } catch (error) {
    return '0';
  }
};

export const parseUBalance = (balance: string) => {
  try {
    const intBalance = parseInt(balance, 10);
    if (Number.isNaN(intBalance)) {
      throw new Error('NaN');
    }
    return intBalance / U_DIVIDER;
  } catch (error) {
    return 0;
  }
};

export const swapArToU = async (amount: string) => {
  const result = await contract.writeInteraction(
    {
      function: 'mint',
    },
    {
      disableBundling: true,
      reward: amount, // 1 u (you can change this to whatever you want as long as its greater than `72600854` winston)
    },
  );

  return result?.originalTxId;
};

export const sendU = async (to: string, amount: string | number, tags: ITag[]) => {
  if (typeof amount === 'number') {
    amount = amount.toString();
  }

  const result = await contract.writeInteraction(
    {
      function: 'transfer',
      target: to,
      qty: amount,
    },
    { tags: tags as Tag[], strict: true },
  );

  return result?.originalTxId;
};
