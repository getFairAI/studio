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

import { Contract, WarpFactory } from 'warp-contracts';

export interface UState {
  state: {
    name: string;
    ticker: string;
    settings: Array<Array<string>>;
    balances: { [address: string]: string };
    claimable: Array<{ txid: string; to: string }>;
    divisibility: number;
  };
}

export const warp = WarpFactory.forMainnet();

export const initContract = (txid: string) =>
  warp.contract(txid).setEvaluationOptions({
    remoteStateSyncSource: 'https://dre-u.warp.cc/contract',
    remoteStateSyncEnabled: true,
    unsafeClient: 'skip',
    allowBigInt: true,
    internalWrites: true,
  });

export const getBalances = async (contract: Contract<unknown>) => {
  try {
    const { cachedValue } = await contract.readState();

    return (cachedValue as UState).state.balances;
  } catch (error) {
    return {};
  }
};
