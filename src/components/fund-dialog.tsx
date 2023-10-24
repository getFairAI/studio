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

import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  List,
  ListItem,
  MenuItem,
  Select,
  SelectChangeEvent,
  Slider,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { ChangeEvent, Dispatch, SetStateAction, SyntheticEvent, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import RefreshIcon from '@mui/icons-material/Refresh';
import { NODE1_IRYS_URL, NODE2_IRYS_URL } from '@/constants';
import { IrysContext, irysNodeUrl } from '@/context/irys';
import { useSnackbar } from 'notistack';
import { WalletContext } from '@/context/wallet';
import arweave from '@/utils/arweave';
import { NumberFormatValues, NumericFormat } from 'react-number-format';
import DebounceLoadingButton from './debounce-loading-button';

type FundFinishedFn = (node: string) => Promise<void>;
type tabOptions = 'fund' | 'withdraw';

const maxPercentage = 100;
const marks = [
  {
    value: 0,
    label: '0%',
  },
  {
    value: 25,
    label: '25%',
  },
  {
    value: 50,
    label: '50%',
  },
  {
    value: 75,
    label: '75%',
  },
  {
    value: maxPercentage,
    label: '100%',
  },
];

const valueLabelFormat = (val: number) => `${val}%`;

const WithdrawPanel = ({ currentTab }: { currentTab: tabOptions }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { withdrawNode, nodeBalance } = useContext(IrysContext);
  const [ percentage, setPercentage ] = useState(0);
  const [ withdrawAmount, setWithdrawAmount ] = useState(0);
  const [ loading, setLoading ] = useState(false);
  const parsedNodeBalance = useMemo(() => Number(arweave.ar.winstonToAr(nodeBalance.toString())), [ nodeBalance ]);

  const handleMaxClick = useCallback(() => setWithdrawAmount(parsedNodeBalance), [setWithdrawAmount, parsedNodeBalance]);

  const isAllowed = useCallback(
    (val: NumberFormatValues) => !val.floatValue || val?.floatValue <= parsedNodeBalance,
    [parsedNodeBalance],
  );

  const handleAmountChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.value === '') {
        setWithdrawAmount(0);
        setPercentage(0);
      } else {
        setWithdrawAmount(Number(event.target.value));
        const newPercentage = (Number(event.target.value) / parsedNodeBalance) * maxPercentage;
        setPercentage(Math.round(newPercentage));
      }
    },
    [setWithdrawAmount],
  );

  const handleSliderChange = useCallback(
    (_event: Event, newValue: number | number[]) => {
      setWithdrawAmount((parsedNodeBalance * (newValue as number)) / maxPercentage);
      setPercentage(newValue as number);
    },
    [setWithdrawAmount, parsedNodeBalance],
  );

  const handleWithdraw = useCallback(async () => {
    try {
      setLoading(true);
      const winstonAmount = arweave.ar.arToWinston(withdrawAmount.toString());
  
      const res = await withdrawNode(winstonAmount);
      setWithdrawAmount(0);
      setPercentage(0);
      enqueueSnackbar(
        <>
          Withdrew Balance from Irys Node: {arweave.ar.winstonToAr(res.requested.toString())} AR.
          <br></br>
          <a href={`https://viewblock.io/arweave/tx/${res.tx_id}`} target={'_blank'} rel='noreferrer'>
            <u>View Transaction in Explorer</u>
          </a>
        </>,
        { variant: 'success' },
      );
      setLoading(false);
    } catch (error) {
      setLoading(false);
      enqueueSnackbar(`Error: ${error}`, { variant: 'error' });
    }
  }, [ arweave, withdrawAmount, setLoading, setWithdrawAmount, enqueueSnackbar, withdrawNode ]);

  return <Box role='tabpanel' hidden={currentTab !== 'withdraw'} display={'flex'} flexDirection={'column'} gap={'16px'}>
    {currentTab === 'withdraw' && (<>
      <Box display={'flex'} padding={'0 16px'} gap={'24px'} alignItems={'center'}>
        <Slider
          onChange={handleSliderChange}
          disabled={nodeBalance <= 0}
          marks={marks}
          value={percentage}
          step={1}
          min={0}
          getAriaValueText={valueLabelFormat}
          valueLabelFormat={valueLabelFormat}
          valueLabelDisplay='auto'
        />
        <NumericFormat
          label='Amount to Withdraw'
          placeholder='Amount to Withdraw'
          value={withdrawAmount}
          onChange={handleAmountChange}
          customInput={TextField}
          helperText={
            <Typography sx={{ cursor: 'pointer' }} variant='caption'>
              <u>Max: {parsedNodeBalance.toFixed(4)}</u>
            </Typography>
          }
          FormHelperTextProps={{
            onClick: handleMaxClick,
          }}
          allowNegative={false}
          isAllowed={isAllowed}
          margin='dense'
          decimalScale={4}
          disabled={nodeBalance <= 0}
        />
      </Box>
      <Box>
        <DebounceLoadingButton
          loading={loading}
          variant='outlined'
          onClick={handleWithdraw}
          disabled={withdrawAmount <= 0 || withdrawAmount >= nodeBalance}
        >
          Withdraw
        </DebounceLoadingButton>
      </Box>
    </>)}
  </Box>;
};

const FundDialog = ({
  open,
  setOpen,
  handleFundFinished,
}: {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  handleFundFinished?: FundFinishedFn;
}) => {
  const [node, setNode] = useState<irysNodeUrl>(NODE2_IRYS_URL);
  const [amount, setAmount] = useState(0);
  const [loading, setLoading] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const { nodeBalance, fundNode, updateBalance, changeNode } = useContext(IrysContext);
  const { currentBalance: walletBalance, updateBalance: updateWalletBalance } =
    useContext(WalletContext);
  const [ currentTab, setCurrentTab ] = useState<'fund' | 'withdraw'>('fund');

  const handleChange = async (event: SelectChangeEvent) => {
    setNode(event.target.value as irysNodeUrl);
    await changeNode(event.target.value as irysNodeUrl);
  };

  const handleAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAmount(+event.target.value);
  };

  const asyncGetNodeBalance = async () => {
    await updateBalance();
  };

  useEffect(() => {
    if (open) {
      (async () => asyncGetNodeBalance())();
    }
  }, [node, open]); // run when node changes

  useEffect(() => {
    if (open) {
      (async () => updateWalletBalance())();
    }
  }, [open]);

  const handleClose = () => {
    setOpen(false);
  };

  const handleFund = async () => {
    setLoading(true);
    // const bn = new BigNumber(amount);
    const winstonAmount = arweave.ar.arToWinston(amount.toString());
    try {
      const res = await fundNode(winstonAmount);
      await updateBalance();
      setAmount(0);
      enqueueSnackbar(
        <>
          Funded Irys node with {arweave.ar.winstonToAr(res.quantity)} AR.
          <br></br>
          <a href={`https://viewblock.io/arweave/tx/${res.id}`} target={'_blank'} rel='noreferrer'>
            <u>View Transaction in Explorer</u>
          </a>
        </>,
        { variant: 'success' },
      );
      setLoading(false);
      setOpen(false);
    } catch (error) {
      setLoading(false);
      enqueueSnackbar(`Error: ${error}`, { variant: 'error' });
    }
  };

  const handleTabChange = useCallback((_: SyntheticEvent, value: 'fund' | 'withdraw') => {
    setCurrentTab(value);
  }, [ setCurrentTab ]);

  return (
    <>
      <Dialog open={open} maxWidth={'sm'} fullWidth onClose={handleClose}>
        <DialogTitle>
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: '23px',
              lineHeight: '31px',
            }}
          >
            Irys Node Settings
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Alert variant='outlined' severity='info' sx={{ marginBottom: '16px' }}>
            <Typography>
              Funding or Withdrawing balances from a Node can take up to 40 minutes. Current Pending transactions will not
              be reflected on the node balance until they are confirmed.
              <br />
              You can view Irys Node transactions at:
            </Typography>
            <List sx={{ listStyle: 'inside', padding: 0 }}>
              <ListItem sx={{ display: 'list-item' }}>
                <a
                  href='https://viewblock.io/arweave/address/OXcT1sVRSA5eGwt2k6Yuz8-3e3g9WJi5uSE99CWqsBs'
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  <u>
                    https://viewblock.io/arweave/address/OXcT1sVRSA5eGwt2k6Yuz8-3e3g9WJi5uSE99CWqsBs
                  </u>
                </a>
              </ListItem>
              <ListItem sx={{ display: 'list-item' }}>
                <a
                  href='https://viewblock.io/arweave/address/ZE0N-8P9gXkhtK-07PQu9d8me5tGDxa_i4Mee5RzVYg'
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  <u>
                    https://viewblock.io/arweave/address/ZE0N-8P9gXkhtK-07PQu9d8me5tGDxa_i4Mee5RzVYg
                  </u>
                </a>
              </ListItem>
            </List>
          </Alert>
          <Box
            display={'flex'}
            flexDirection={'column'}
            justifyContent={'space-evenly'}
          >
            <FormControl fullWidth margin='dense'>
              <InputLabel id='select-label'>Irys Node</InputLabel>
              <Select
                labelId='select-label'
                value={node}
                onChange={handleChange}
                label={'Irys Node'}
              >
                <MenuItem value={NODE1_IRYS_URL}>node1.irys.xyz</MenuItem>
                <MenuItem value={NODE2_IRYS_URL}>node2.irys.xyz</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label='Current Irys Balance'
              value={arweave.ar.winstonToAr(nodeBalance.toString())}
              disabled
              margin='dense'
              InputProps={{
                endAdornment: (
                  <InputAdornment position='start'>
                    <IconButton onClick={asyncGetNodeBalance}>
                      <RefreshIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Tabs value={currentTab} onChange={handleTabChange}>
              <Tab label='Fund' value='fund' />
              <Tab label='Withdraw' value='withdraw' />
            </Tabs>
            <Box role='tabpanel' hidden={currentTab !== 'fund'} display={'flex'} flexDirection={'column'} gap={'16px'}>
              {currentTab === 'fund' && (<>
                <NumericFormat
                  value={amount}
                  onChange={handleAmountChange}
                  customInput={TextField}
                  helperText={
                    <Typography sx={{ cursor: 'pointer' }} variant='caption'>
                      <u>Max: {walletBalance.toFixed(4)}</u>
                    </Typography>
                  }
                  FormHelperTextProps={{
                    onClick: () => setAmount(walletBalance),
                  }}
                  allowNegative={false}
                  margin='dense'
                  decimalScale={4}
                  isAllowed={(val) => !val.floatValue || val?.floatValue < walletBalance}
                  decimalSeparator={'.'}
                  sx={{
                    width: '100%'
                  }}
                />
                <Box>
                  <DebounceLoadingButton
                    loading={loading}
                    variant='outlined'
                    onClick={handleFund}
                    disabled={amount <= 0 || amount >= walletBalance}
                  >
                    Fund
                  </DebounceLoadingButton>
                  {handleFundFinished && (
                    <Button
                      onClick={() => handleFundFinished(node)}
                      variant='contained'
                      disabled={nodeBalance <= 0}
                    >
                      Continue
                    </Button>
                  )}
                </Box>
              </>)}
            </Box>
            <WithdrawPanel currentTab={currentTab}/>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FundDialog;