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

export const initContract = (txid: string) => warp.contract(txid).setEvaluationOptions({
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