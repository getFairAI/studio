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

import { WalletContext } from '@/context/wallet';
import { QUERY_TX_WITH } from '@/queries/graphql';
import { ApolloError, useLazyQuery, useQuery } from '@apollo/client';
import { ReactElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  TAG_NAMES,
  CANCEL_OPERATION,
  secondInMS,
  U_LOGO_SRC,
  OLD_PROTOCOL_NAME,
  OLD_PROTOCOL_VERSION,
  DEFAULT_TAGS,
  MARKETPLACE_EVM_ADDRESS,
  OPERATOR_USDC_FEE,
} from '@/constants';
import {
  Backdrop,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  CircularProgress,
  Container,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { displayShortTxOrAddr, findTag, parseUnixTimestamp } from '@/utils/common';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CopyIcon from '@mui/icons-material/ContentCopy';
import arweave from '@/utils/arweave';
import { useSnackbar } from 'notistack';
import DebounceButton from '@/components/debounce-button';
import { getUsdcSentLogs, findByIdDocument, decodeTxMemo, findByIdQuery } from '@fairai/evm-sdk';
import { EVMWalletContext } from '@/context/evm-wallet';

interface Registration {
  solutionTransaction: string;
  solutionName: string;
  id: string;
  solutionCreator: string;
  operatorFee: number;
  operatorName: string;
  timestamp: string;
}

const RegistrationContent = ({
  registration,
  text,
  color,
}: {
  registration: Registration;
  text: string;
  color: string;
}) => {
  const { enqueueSnackbar } = useSnackbar();

  const handleCopy = useCallback(() => {
    if (registration.solutionTransaction) {
      (async () => {
        await navigator.clipboard.writeText(registration.solutionTransaction);
        enqueueSnackbar('Copied to clipboard', { variant: 'info' });
      })();
    }
  }, [registration, enqueueSnackbar]);

  const handleViewExplorer = useCallback(
    () =>
      window.open(`https://viewblock.io/arweave/tx/${registration.solutionTransaction}`, '_blank'),
    [registration],
  );

  return (
    <CardContent
      sx={{ display: 'flex', gap: '16px', justifyContent: 'space-between', padding: '8px 16px' }}
    >
      <Box>
        <Box display={'flex'} gap={'8px'}>
          <Typography fontWeight={'600'}>Solution Transaction:</Typography>
          <Tooltip title={registration.solutionTransaction}>
            <Typography>
              {displayShortTxOrAddr(registration.solutionTransaction)}
              <IconButton size='small' onClick={handleCopy}>
                <CopyIcon fontSize='inherit' />
              </IconButton>
              <IconButton size='small' onClick={handleViewExplorer}>
                <OpenInNewIcon fontSize='inherit' />
              </IconButton>
            </Typography>
          </Tooltip>
        </Box>
        <Box display={'flex'} gap={'8px'}>
          <Typography fontWeight={'600'}>Solution Creator:</Typography>
          <Tooltip title={registration.solutionCreator}>
            <Typography>
              {displayShortTxOrAddr(registration.solutionCreator)}
              <IconButton size='small'>
                <CopyIcon fontSize='inherit' />
              </IconButton>
            </Typography>
          </Tooltip>
        </Box>
        <Box display={'flex'} gap={'8px'}>
          <Typography fontWeight={'600'}>Timestamp:</Typography>
          <Typography noWrap>{`${registration.timestamp} (${parseUnixTimestamp(
            registration.timestamp,
          )})`}</Typography>
        </Box>
      </Box>
      <Box>
        <Box display={'flex'} gap={'8px'} alignItems={'center'}>
          <Typography fontWeight={'600'}>Operator Name:</Typography>
          <Typography>{registration.operatorName}</Typography>
        </Box>
        <Box display={'flex'} gap={'8px'} alignItems={'center'}>
          <Typography fontWeight={'600'}>Operator Fee:</Typography>
          <Typography>{registration.operatorFee}</Typography>
          <img src={U_LOGO_SRC} width={'18px'} height={'18px'} />
        </Box>
      </Box>
      <Box display={'flex'} flexDirection={'column'} justifyContent={'center'}>
        <Box display={'flex'} gap={'8px'}>
          <Button
            variant='outlined'
            disabled
            sx={{
              color,
              '&.MuiButtonBase-root:disabled': {
                color,
                borderColor: color,
              },
            }}
          >
            <Typography>{text}</Typography>
          </Button>
        </Box>
      </Box>
    </CardContent>
  );
};

const RegistrationCard = ({ tx }: { tx: findByIdQuery['transactions']['edges'][0] }) => {
  const [isCancelled, setIsCancelled] = useState(false);
  const theme = useTheme();
  const { currentAddress, dispatchTx } = useContext(WalletContext);
  const { enqueueSnackbar } = useSnackbar();

  const registration = useMemo(() => {
    const solutionName = findTag(tx, 'solutionName') ?? 'Solution Name Not Found';
    const solutionCreator = findTag(tx, 'solutionCreator') ?? 'Solution Curator Not Found';
    const solutionTransaction =
      findTag(tx, 'solutionTransaction') ?? 'Solution Transaction Not Found';
    const operatorFee = findTag(tx, 'operatorFee') ?? 'Operator Fee Not Found';
    const operatorName = findTag(tx, 'operatorName') ?? 'Operator Name Not Found';
    const timestamp = findTag(tx, 'unixTime') ?? 'Timestamp Not Found';

    const parsedFee = parseFloat(operatorFee);

    return {
      id: tx.node.id,
      operatorFee: parsedFee,
      solutionTransaction,
      solutionName,
      solutionCreator,
      operatorName,
      timestamp,
    };
  }, [tx]);

  const id: string = useMemo(() => tx.node.id, [tx]);

  const { data: cancelData } = useQuery(QUERY_TX_WITH, {
    variables: {
      address: currentAddress,
      tags: [
        ...DEFAULT_TAGS,
        { name: TAG_NAMES.operationName, values: [CANCEL_OPERATION] },
        { name: TAG_NAMES.registrationTransaction, values: [id] },
      ],
    },
    skip: !id,
  });

  const color = useMemo(() => {
    if (isCancelled) {
      return theme.palette.neutral.main;
    } else {
      return theme.palette.success.main;
    }
  }, [isCancelled]);

  const text = useMemo(() => {
    if (isCancelled) {
      return 'Cancelled';
    } else {
      return 'Active';
    }
  }, [isCancelled]);

  useEffect(() => {
    if (cancelData && cancelData.transactions.edges.length > 0) {
      setIsCancelled(true);
    }
  }, [cancelData]);

  const handleCancel = useCallback(() => {
    (async () => {
      // cancel tx
      try {
        const cancelTx = await arweave.createTransaction({
          data: 'Cancel Transaction',
        });
        cancelTx.addTag(TAG_NAMES.protocolName, OLD_PROTOCOL_NAME);
        cancelTx.addTag(TAG_NAMES.protocolVersion, OLD_PROTOCOL_VERSION);
        cancelTx.addTag(TAG_NAMES.operationName, CANCEL_OPERATION);
        cancelTx.addTag(TAG_NAMES.registrationTransaction, id);
        cancelTx.addTag(TAG_NAMES.solutionName, registration.solutionName);
        cancelTx.addTag(TAG_NAMES.solutionCreator, registration.solutionCreator);
        cancelTx.addTag(TAG_NAMES.solutionTransaction, registration.solutionTransaction);
        cancelTx.addTag(TAG_NAMES.unixTime, (Date.now() / secondInMS).toString());

        const cancelResult = await dispatchTx(cancelTx);
        setIsCancelled(true);
        enqueueSnackbar(
          <>
            Cancel Transaction Sent
            <br></br>
            <a
              href={`https://viewblock.io/arweave/tx/${cancelResult.id}`}
              target={'_blank'}
              rel='noreferrer'
            >
              <u>View Transaction in Explorer</u>
            </a>
          </>,
          {
            variant: 'success',
          },
        );
      } catch (error) {
        enqueueSnackbar('Cancel Transaction Failed', { variant: 'error' });
      }
    })();
  }, [id, registration]);

  return (
    <Card sx={{ display: 'flex', flexDirection: 'column' }}>
      <CardHeader
        title={registration.solutionName}
        sx={{ padding: '8px 16px' }}
        action={
          <Tooltip title='View in Explorer'>
            <span>
              <IconButton
                size='small'
                href={`https://viewblock.io/arweave/tx/${id}`}
                target='_blank'
              >
                <OpenInNewIcon />
              </IconButton>
            </span>
          </Tooltip>
        }
      />
      <RegistrationContent registration={registration} color={color} text={text} />
      {!isCancelled && (
        <CardActions
          sx={{ display: 'flex', justifyContent: 'center', padding: '8px 16px', gap: '8px' }}
        >
          <DebounceButton onClick={handleCancel} variant='outlined'>
            <Typography>Cancel</Typography>
          </DebounceButton>
        </CardActions>
      )}
    </Card>
  );
};

const RegistrationError = ({
  error,
  children,
}: {
  error?: ApolloError;
  children: ReactElement;
}) => {
  if (error) {
    return (
      <Box display={'flex'} flexDirection={'column'} alignItems={'center'} padding={'16px'}>
        <Typography textAlign={'center'}>
          There Was a Problem Fetching previous payments...
        </Typography>
      </Box>
    );
  } else {
    return children;
  }
};

const RegistrationsEmpty = ({
  data,
  children,
}: {
  data?: findByIdQuery;
  children: ReactElement;
}) => {
  if (data && data.transactions.edges.length === 0) {
    return (
      <Box>
        <Typography textAlign={'center'}>
          The Connected Address does not Have Registrations to any Solution.
        </Typography>
      </Box>
    );
  } else {
    return children;
  }
};

const Registrations = () => {
  const justifyContent = 'space-between';

  const theme = useTheme();
  const { currentAddress } = useContext(EVMWalletContext);

  const [getTxs, { data, refetch, loading, error }] = useLazyQuery(findByIdDocument);

  useEffect(() => {
    if (currentAddress) {
      const txs: string[] = [];
      (async () => {
        const startTimestamp = 1709251200; // timestamp for 1 march 2024
        const logs = await getUsdcSentLogs(
          currentAddress as `0x${string}`,
          MARKETPLACE_EVM_ADDRESS,
          OPERATOR_USDC_FEE,
          startTimestamp,
        );
        for (const sentPayment of logs) {
          const transfer = await decodeTxMemo(sentPayment.transactionHash);
          txs.push(transfer);
        }
        getTxs({
          variables: {
            ids: txs,
          },
        });
      })();
    }
  }, [currentAddress]);

  const refreshClick = useCallback(() => {
    (async () => {
      await refetch();
    })();
  }, [refetch]);

  return (
    <Container sx={{ paddingTop: '16px' }} maxWidth='lg'>
      <RegistrationError error={error}>
        <RegistrationsEmpty data={data}>
          <>
            <Box display={'flex'} justifyContent={justifyContent} padding={'16px 8px'}>
              <Button onClick={refreshClick} endIcon={<RefreshIcon />} variant='outlined'>
                <Typography>Refresh</Typography>
              </Button>
            </Box>
            <Stack spacing={2}>
              {data?.transactions.edges.map((tx: findByIdQuery['transactions']['edges'][0]) => (
                <RegistrationCard key={tx.node.id} tx={tx} />
              ))}
            </Stack>
          </>
        </RegistrationsEmpty>
      </RegistrationError>
      {loading && (
        <Backdrop
          sx={{
            zIndex: theme.zIndex.drawer + 1,
            borderRadius: '23px',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
          }}
          open={true}
        >
          <Typography variant='h2' color={theme.palette.primary.main}>
            Fetching Latest Payments...
          </Typography>
          <CircularProgress color='primary' />
        </Backdrop>
      )}
    </Container>
  );
};

export default Registrations;
