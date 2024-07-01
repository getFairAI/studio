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

import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import {
  Alert,
  Box,
  Button,
  CardContent,
  CircularProgress,
  FormControl,
  IconButton,
  InputAdornment,
  StepContent,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import { ChangeEvent, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import DownloadIcon from '@mui/icons-material/Download';
import rehypeSanitize from 'rehype-sanitize';
import { IEdge } from '@/interfaces/arweave';
import {
  CANCEL_OPERATION,
  MARKETPLACE_EVM_ADDRESS,
  NET_ARWEAVE_URL,
  OLD_PROTOCOL_NAME,
  OLD_PROTOCOL_VERSION,
  OPERATOR_USDC_FEE,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  TAG_NAMES,
  defaultDecimalPlaces,
} from '@/constants';
import { NumericFormat } from 'react-number-format';
import { displayShortTxOrAddr, findTag, printSize } from '@/utils/common';
import { useLoaderData, useLocation, useParams, useRouteLoaderData } from 'react-router-dom';
import { RouteLoaderResult } from '@/interfaces/router';
import { getData } from '@/utils/arweave';
import MarkdownControl from './md-control';
import { WalletContext } from '@/context/wallet';
import DebounceButton from './debounce-button';
import { useQuery } from '@apollo/client';
import { toSvg } from 'jdenticon';
import { useSnackbar } from 'notistack';
import ContentCopy from '@mui/icons-material/ContentCopy';
import {
  findByTagsAndOwnersDocument,
  getUsdcSentLogs,
  decodeTxMemo,
  sendUSDC,
} from '@fairai/evm-sdk';
import { OpenInNew } from '@mui/icons-material';
import { EVMWalletContext } from '@/context/evm-wallet';

const RegisterStep = ({
  tx,
  handleSubmit,
  handleNext,
  handleBack,
}: {
  tx: IEdge;
  handleSubmit: (rate: string, name: string, handleNext: () => void) => Promise<void>;
  handleNext: () => void;
  handleBack: () => void;
}) => {
  const [operatorName, setOperatorName] = useState('');
  const [rate, setRate] = useState(0);
  const { currentAddress } = useContext(WalletContext);
  const { currentAddress: evmWallet } = useContext(EVMWalletContext);
  const theme = useTheme();
  const [paymentHash, setPaymentHash] = useState('');

  const scriptTxid = useMemo(() => tx.node.id, [tx]);

  const { data, loading, refetch } = useQuery(findByTagsAndOwnersDocument, {
    variables: {
      tags: [
        { name: TAG_NAMES.protocolName, values: [PROTOCOL_NAME] },
        { name: TAG_NAMES.protocolVersion, values: [PROTOCOL_VERSION] },
        { name: TAG_NAMES.solutionTransaction, values: [scriptTxid!] },
        { name: TAG_NAMES.operationName, values: ['Operator Registration'] },
      ],
      owners: [currentAddress],
      first: 1,
    },
    skip: !scriptTxid || !currentAddress,
  });

  const registrationId = useMemo(() => data?.transactions?.edges[0]?.node.id ?? '', [data]);
  const registrationTx = useMemo(() => data?.transactions?.edges[0] ?? null, [data]);
  const registrationName = useMemo(() => {
    if (data?.transactions.edges[0]) {
      return findTag(data?.transactions?.edges[0], 'operatorName');
    } else {
      return '';
    }
  }, [data]);
  const registrationFee = useMemo(() => {
    if (data?.transactions.edges[0]) {
      return findTag(data?.transactions?.edges[0], 'operatorFee');
    } else {
      return '';
    }
  }, [data]);
  const { data: cancelData, loading: cancelLoading } = useQuery(findByTagsAndOwnersDocument, {
    variables: {
      owners: [currentAddress],
      tags: [
        { name: TAG_NAMES.protocolName, values: [OLD_PROTOCOL_NAME, PROTOCOL_NAME] },
        { name: TAG_NAMES.protocolVersion, values: [OLD_PROTOCOL_VERSION, PROTOCOL_VERSION] },
        { name: TAG_NAMES.operationName, values: [CANCEL_OPERATION] },
        { name: TAG_NAMES.registrationTransaction, values: [registrationId!] },
      ],
      first: 1,
    },
    skip: !registrationId || !currentAddress,
  });
  const isLoading = useMemo(() => loading || cancelLoading, [loading, cancelLoading]);

  useEffect(() => {
    if (registrationTx) {
      (async () => {
        const timestamp = await findTag(registrationTx, 'unixTime');
        const logs = await getUsdcSentLogs(
          evmWallet as `0x${string}`,
          MARKETPLACE_EVM_ADDRESS,
          OPERATOR_USDC_FEE,
          parseFloat(timestamp ?? ''),
        );

        for (const log of logs) {
          const arweaveTx = await decodeTxMemo(log.transactionHash);

          if (arweaveTx === registrationId) {
            setPaymentHash(log.transactionHash);
            break;
          }
        }
      })();
    }
  }, [registrationTx]);

  const handleRateChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newNumber = parseFloat(event.target.value);

    if (newNumber) {
      setRate(parseFloat(newNumber.toFixed(defaultDecimalPlaces)));
    }
  };

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setOperatorName(event.target.value);
  };

  const handleNextAndUpdate = useCallback(() => {
    refetch();
    handleNext();
  }, [refetch, handleNext]);

  const handleFinish = useCallback(async () => {
    await handleSubmit(rate.toString(), operatorName, handleNextAndUpdate);
  }, [rate, operatorName, handleNextAndUpdate, handleSubmit]);

  const viewTx = useCallback(() => {
    window.open(`https://viewblock.io/arweave/tx/${registrationId}`, '_blank');
  }, [registrationId]);

  const viewEVMTx = useCallback(() => {
    window.open(`https://arbiscan.io/tx/${paymentHash}`, '_blank');
  }, [paymentHash]);

  const handleRetryNow = useCallback(async () => {
    if (registrationId) {
      const payment = await sendUSDC(MARKETPLACE_EVM_ADDRESS, OPERATOR_USDC_FEE, registrationId);
      setPaymentHash(payment);
    }
  }, [registrationId]);

  if (isLoading) {
    return (
      <Box justifyContent={'center'} display={'flex'} width={'100%'}>
        <CircularProgress />
      </Box>
    );
  } else if (registrationId && cancelData?.transactions.edges.length === 0) {
    return (
      <Box
        flexDirection={'column'}
        display={'flex'}
        width={'100%'}
        gap={'16px'}
        alignItems={'center'}
      >
        <Typography sx={{ mt: 2, mb: 1 }} alignContent={'center'} textAlign={'center'}>
          You have already registered an operator. If you want to change the name or fee, you need
          to cancel the registration first.
        </Typography>
        <Box
          display={'flex'}
          border={'0.5px solid'}
          borderRadius={'10px'}
          padding={'16px'}
          gap={'16px'}
        >
          <Box sx={{ display: 'flex', fontWeight: 500, gap: '8px' }}>
            <Typography>ID:</Typography>
            <Typography>
              <u
                onClick={viewTx}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
              >
                {displayShortTxOrAddr(registrationId)}
                <OpenInNew fontSize='inherit' />
              </u>
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', fontWeight: 500, gap: '8px' }}>
            <Typography>Name:</Typography>
            <Typography>{registrationName}</Typography>
          </Box>
          <Box sx={{ display: 'flex', fontWeight: 500, gap: '8px' }}>
            <Typography>Fee:</Typography>
            <Typography display={'flex'} alignItems={'center'} gap={'4px'}>
              {registrationFee}
              <img width={'18px'} height={'18px'} src='./usdc-logo.svg'></img>
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', fontWeight: 500, gap: '8px' }}>
            <Typography>Status:</Typography>
            <Typography color={theme.palette.success.main}>{'Confirmed'}</Typography>
          </Box>
          <Box sx={{ display: 'flex', fontWeight: 500, gap: '8px' }}>
            <Typography>USDC Payment:</Typography>
            {paymentHash && (
              <Typography>
                <u
                  onClick={viewEVMTx}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                >
                  {displayShortTxOrAddr(paymentHash)}
                  <OpenInNew fontSize='inherit' />
                </u>
              </Typography>
            )}
            {!paymentHash && (
              <Typography color={theme.palette.error.main}>
                Not Found.{' '}
                <u onClick={handleRetryNow} style={{ cursor: 'pointer' }}>
                  Retry Payment
                </u>
              </Typography>
            )}
          </Box>
        </Box>
        <Box></Box>
      </Box>
    );
  } else {
    return (
      <Box display={'flex'} flexDirection={'column'} gap={'16px'}>
        <Box justifyContent={'space-between'} display={'flex'} gap={'16px'}>
          <TextField
            value={operatorName}
            label={'Name'}
            onChange={handleNameChange}
            InputProps={{
              sx: {
                borderWidth: '1px',
                borderColor: '#FFF',
              },
            }}
            sx={{
              width: '72%',
            }}
          />
          <NumericFormat
            value={rate}
            onChange={handleRateChange}
            customInput={TextField}
            decimalScale={4}
            label='Fee'
            variant='outlined'
            decimalSeparator={'.'}
            InputProps={{
              sx: {
                borderWidth: '1px',
                borderColor: '#FFF',
              },
            }}
            sx={{ width: '25%' }}
          />
        </Box>
        <Alert severity='warning' variant='outlined' sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography
            gap={'4px'}
            textAlign={'left'}
            display={'flex'}
            alignItems={'center'}
            flexWrap={'wrap'}
          >
            Registering an Operator requires a fee of {OPERATOR_USDC_FEE} USDC{' '}
            <img width='18px' height='18px' src={'./usdc-logo.svg'} />, and both an Arweave Wallet
            and an EVM Wallet to procceed.
          </Typography>
        </Alert>
        <Box display={'flex'} justifyContent={'space-between'}>
          <Button
            onClick={handleBack}
            sx={{
              borderRadius: '7px',
              height: '39px',
              width: '204px',
            }}
            variant='outlined'
          >
            <Typography
              sx={{
                fontStyle: 'normal',
                fontWeight: 500,
                fontSize: '15px',
                lineHeight: '20px',
              }}
            >
              Back
            </Typography>
          </Button>
          <DebounceButton
            onClick={handleFinish}
            sx={{
              borderRadius: '7px',
              height: '39px',
              width: '204px',
            }}
            variant='contained'
            disabled={!operatorName || !rate || !currentAddress}
          >
            <Typography
              sx={{
                fontStyle: 'normal',
                fontWeight: 500,
                fontSize: '15px',
                lineHeight: '20px',
              }}
            >
              Finish
            </Typography>
          </DebounceButton>
        </Box>
      </Box>
    );
  }
};

export const CustomStepper = (props: {
  data: IEdge;
  handleSubmit: (rate: string, name: string, handleNext: () => void) => Promise<void>;
  handleClose: () => void;
  isRegistered: boolean;
}) => {
  const { txid: scriptTxId } = useParams();
  const { notesTxId } = (useRouteLoaderData('register') as RouteLoaderResult) || {};
  const [activeStep, setActiveStep] = useState(0);
  const [skipped, setSkipped] = useState(new Set<number>());
  const [completed, setCompleted] = useState(new Set<number>());
  const [fileSize, setFileSize] = useState(0);
  const [notes, setNotes] = useState('');
  const { avatarTxId } = (useLoaderData() as RouteLoaderResult) || {};
  const { state }: { state: IEdge } = useLocation();
  const { enqueueSnackbar } = useSnackbar();
  /* const target = useRef<HTMLDivElement>(null);
  const isOnScreen = useOnScreen(target);
  const [hasScrolledDown, setHasScrollDown] = useState(false); */

  const imgUrl = useMemo(() => {
    if (avatarTxId) {
      return `https://arweave.net/${avatarTxId}`;
    }
    const img = toSvg(findTag(state, 'solutionTransaction'), 100);
    const svg = new Blob([img], { type: 'image/svg+xml' });
    return URL.createObjectURL(svg);
  }, [state, avatarTxId]);

  const isStepSkipped = (step: number) => skipped.has(step);

  const handleNext = useCallback(() => {
    let newSkipped = skipped;
    if (isStepSkipped(activeStep)) {
      newSkipped = new Set(newSkipped.values());
      newSkipped.delete(activeStep);
    }

    setActiveStep((prevActiveStep) => prevActiveStep + 1);
    setSkipped(newSkipped);
    setCompleted(completed.add(activeStep));
  }, [skipped, activeStep, setSkipped, setActiveStep, setCompleted, completed]);

  const handleBack = useCallback(() => {
    const newCompleted = new Set(completed.values());
    newCompleted.delete(activeStep);
    setCompleted(newCompleted);
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  }, [completed, setCompleted, setActiveStep]);

  const download = (id: string, name?: string) => {
    const a = document.createElement('a');
    a.href = `${NET_ARWEAVE_URL}/${id}`;
    a.download = name || id;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(`${NET_ARWEAVE_URL}/${props.data.node.id}`, {
          method: 'HEAD',
        });
        setFileSize(parseInt(response.headers.get('Content-Length') ?? '', 10));
      } catch (e) {
        // do nothing
      }
    })();
  }, [props.data]);

  useEffect(() => {
    if (notesTxId) {
      (async () => {
        setNotes((await getData(notesTxId)) as string);
      })();
    }
  }, [notesTxId]);

  const handleSriptDownload = useCallback(() => {
    const id = props.data.node.id;
    const name = findTag(props.data, 'solutionName');
    if (id) {
      download(id, name);
    }
  }, [download, props.data]);

  const handleCopy = useCallback(() => {
    if (scriptTxId) {
      (async () => {
        await navigator.clipboard.writeText(scriptTxId);
        enqueueSnackbar('Copied to clipboard', { variant: 'info' });
      })();
    }
  }, [scriptTxId]);

  return (
    <>
      <Stepper
        activeStep={activeStep}
        orientation='vertical' /* connector={<ColorlibConnector />} */
      >
        <Step key='reviewInfo'>
          <StepLabel
          /* StepIconComponent={ColorlibStepIcon}
          StepIconProps={{ active: activeStep === 0, completed: completed.has(0) }} */
          >
            Review Information
          </StepLabel>
          <StepContent sx={{ width: '100%' }}>
            <Box display={'flex'} flexDirection='column' justifyContent={'flex-end'}>
              <CardContent
                sx={{
                  display: 'flex',
                  gap: '48px',
                  padding: '0px 32px',
                  width: '100%',
                }}
              >
                <Box
                  sx={{
                    borderRadius: '23px',
                    width: '317px',
                    height: '352px',
                    background: `url(${imgUrl ? imgUrl : ''})`,
                    // backgroundPosition: 'center',s
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: 'cover' /* <------ */,
                    backgroundPosition: 'center',
                  }}
                />
                <Box display={'flex'} flexDirection={'column'} gap={'30px'} width={'30%'}>
                  <Box>
                    <Typography
                      sx={{
                        fontStyle: 'normal',
                        fontWeight: 700,
                        fontSize: '23px',
                        lineHeight: '31px',
                        display: 'flex',
                        alignItems: 'center',
                        textAlign: 'center',
                      }}
                    >
                      Name
                    </Typography>
                    <Typography
                      sx={{
                        fontStyle: 'normal',
                        fontWeight: 400,
                        fontSize: '23px',
                        lineHeight: '31px',
                        display: 'flex',
                        alignItems: 'center',
                        textAlign: 'center',
                      }}
                    >
                      {findTag(state, 'solutionName')}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography
                      sx={{
                        fontStyle: 'normal',
                        fontWeight: 700,
                        fontSize: '23px',
                        lineHeight: '31px',
                        display: 'flex',
                        alignItems: 'center',
                        textAlign: 'center',
                      }}
                    >
                      Output Type
                    </Typography>
                    <Typography
                      sx={{
                        fontStyle: 'normal',
                        fontWeight: 400,
                        fontSize: '23px',
                        lineHeight: '31px',
                        display: 'flex',
                        alignItems: 'center',
                        textAlign: 'center',
                      }}
                    >
                      {findTag(state, 'output')}
                    </Typography>
                  </Box>
                </Box>
                <Box
                  display={'flex'}
                  flexDirection={'column'}
                  width={'45%'}
                  justifyContent={'space-between'}
                >
                  <Box>
                    <Typography
                      sx={{
                        fontStyle: 'normal',
                        fontWeight: 700,
                        fontSize: '23px',
                        lineHeight: '31px',
                        display: 'flex',
                        alignItems: 'center',
                        textAlign: 'center',
                      }}
                    >
                      Description
                    </Typography>
                    <Typography>
                      {findTag(state, 'description') || 'No Description Available'}
                    </Typography>
                    <Box sx={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
                      <Button
                        variant='outlined'
                        endIcon={<ContentCopy />}
                        onClick={handleCopy}
                        sx={{ marginTop: '18px', height: '39px' }}
                      >
                        <Typography>
                          Copy Tx Id ({displayShortTxOrAddr(scriptTxId as string)})
                        </Typography>
                      </Button>
                    </Box>
                  </Box>

                  <Box sx={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      onClick={handleNext}
                      sx={{
                        borderRadius: '7px',
                        height: '39px',
                        width: '204px',
                        '&.Mui-disabled': {
                          opacity: '0.1',
                        },
                      }}
                      variant='contained'
                    >
                      <Typography
                        sx={{
                          fontStyle: 'normal',
                          fontWeight: 500,
                          fontSize: '15px',
                          lineHeight: '20px',
                        }}
                      >
                        Next
                      </Typography>
                    </Button>
                  </Box>
                </Box>
              </CardContent>
            </Box>
          </StepContent>
        </Step>
        <Step key='Configuration'>
          <StepLabel
          /*  StepIconComponent={ColorlibStepIcon}
          StepIconProps={{ active: activeStep === 1, completed: completed.has(1) }} */
          >
            Setup
          </StepLabel>
          <StepContent sx={{ width: '100%' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <MarkdownControl
                viewProps={{
                  preview: 'preview',
                  previewOptions: {
                    rehypePlugins: [[rehypeSanitize]],
                  },
                  hideToolbar: true,
                  fullscreen: false,
                  value: notes,
                }}
              />
              <Box>
                <FormControl variant='outlined' fullWidth>
                  <TextField
                    multiline
                    disabled
                    minRows={1}
                    value={findTag(props.data, 'solutionName')}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position='start'>
                          <IconButton aria-label='download' onClick={handleSriptDownload}>
                            <DownloadIcon />
                          </IconButton>
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position='start'>{printSize(fileSize)}</InputAdornment>
                      ),
                      readOnly: true,
                      sx: {
                        borderWidth: '1px',
                        borderColor: '#FFF',
                      },
                    }}
                  />
                </FormControl>
              </Box>
              <Box display={'flex'} justifyContent={'space-between'}>
                <Button
                  onClick={handleBack}
                  sx={{
                    borderRadius: '7px',
                    height: '39px',
                    width: '204px',
                  }}
                  variant='outlined'
                >
                  <Typography
                    sx={{
                      fontStyle: 'normal',
                      fontWeight: 500,
                      fontSize: '15px',
                      lineHeight: '20px',
                    }}
                  >
                    Back
                  </Typography>
                </Button>
                <Button
                  onClick={handleNext}
                  sx={{
                    borderRadius: '7px',
                    height: '39px',
                    width: '204px',
                  }}
                  variant='contained'
                >
                  <Typography
                    sx={{
                      fontStyle: 'normal',
                      fontWeight: 500,
                      fontSize: '15px',
                      lineHeight: '20px',
                    }}
                  >
                    Next
                  </Typography>
                </Button>
              </Box>
            </Box>
          </StepContent>
        </Step>
        <Step key='Registration'>
          <StepLabel
          /* StepIconComponent={ColorlibStepIcon}
          StepIconProps={{ active: activeStep === 2, completed: completed.has(2) }} */
          >
            Register
          </StepLabel>
          <StepContent sx={{ width: '100%' }}>
            <RegisterStep
              tx={props.data}
              handleBack={handleBack}
              handleNext={handleNext}
              handleSubmit={props.handleSubmit}
            />
          </StepContent>
        </Step>
      </Stepper>
    </>
  );
};
