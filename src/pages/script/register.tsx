import { CustomStepper } from '@/components/stepper';
import {
  VAULT_ADDRESS,
  TAG_NAMES,
  REGISTER_OPERATION,
  OPERATOR_REGISTRATION_AR_FEE,
  secondInMS,
  U_DIVIDER,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
} from '@/constants';
import { IEdge } from '@/interfaces/arweave';
import { RouteLoaderResult } from '@/interfaces/router';
import { displayShortTxOrAddr, findTag } from '@/utils/common';
import {
  Box,
  Typography,
  DialogContent,
  Dialog,
  DialogTitle,
  IconButton,
  CardContent,
  useTheme,
  Button,
} from '@mui/material';
import { toSvg } from 'jdenticon';
import { useSnackbar } from 'notistack';
import { useCallback, useContext, useMemo, useState } from 'react';
import { useLoaderData, useLocation, useNavigate, useParams } from 'react-router-dom';
import '@/styles/ui.css';
import { WalletContext } from '@/context/wallet';
import { sendU } from '@/utils/u';
import { ContentCopy } from '@mui/icons-material';

const Register = () => {
  const { txid: scriptTxId } = useParams();
  const { avatarTxId } = (useLoaderData() as RouteLoaderResult) || {};
  const { state }: { state: IEdge } = useLocation();
  const [isRegistered, setIsRegistered] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const theme = useTheme();
  const { currentUBalance, updateUBalance } = useContext(WalletContext);

  const imgUrl = useMemo(() => {
    if (avatarTxId) {
      return `https://arweave.net/${avatarTxId}`;
    }
    const img = toSvg(findTag(state, 'scriptTransaction'), 100);
    const svg = new Blob([img], { type: 'image/svg+xml' });
    return URL.createObjectURL(svg);
  }, [state, avatarTxId]);

  const handleRegister = async (rate: string, operatorName: string, handleNext: () => void) => {
    try {
      if (currentUBalance < parseFloat(OPERATOR_REGISTRATION_AR_FEE)) {
        enqueueSnackbar('Insufficient $U Balance', { variant: 'error' });
        return;
      }

      const parsedUFee = parseFloat(OPERATOR_REGISTRATION_AR_FEE) * U_DIVIDER;
      const parsedOpFee = parseFloat(rate) * U_DIVIDER;

      const tags = [];
      tags.push({ name: TAG_NAMES.protocolName, value: PROTOCOL_NAME });
      tags.push({ name: TAG_NAMES.protocolVersion, value: PROTOCOL_VERSION });
      tags.push({
        name: TAG_NAMES.scriptName,
        value: findTag(state, 'scriptName') ?? '',
      });
      tags.push({
        name: TAG_NAMES.scriptCurator,
        value: findTag(state, 'sequencerOwner') as string,
      });
      tags.push({
        name: TAG_NAMES.scriptTransaction,
        value: findTag(state, 'scriptTransaction') as string,
      });
      tags.push({ name: TAG_NAMES.operatorFee, value: parsedOpFee.toString() });
      tags.push({ name: TAG_NAMES.operationName, value: REGISTER_OPERATION });
      tags.push({ name: TAG_NAMES.operatorName, value: operatorName });
      tags.push({ name: TAG_NAMES.unixTime, value: (Date.now() / secondInMS).toString() });
      // tags.push({ name: TAG_NAMES.saveTransaction, values: saveResult.id as string });

      const paymentId = await sendU(VAULT_ADDRESS, parsedUFee.toString(), tags);
      await updateUBalance();
      enqueueSnackbar(
        <>
          Operator Registration Submitted.
          <br></br>
          <a
            href={`https://viewblock.io/arweave/tx/${paymentId}`}
            target={'_blank'}
            rel='noreferrer'
          >
            <u>View Transaction in Explorer</u>
          </a>
        </>,
        { variant: 'success' },
      );
      setIsRegistered(true);
      handleNext();
    } catch (error) {
      enqueueSnackbar('Something went Wrong. Please Try again...', { variant: 'error' });
    }
  };

  const handleClose = useCallback(() => navigate(-1), [navigate]);

  const handleCopy = useCallback(() => {
    if (scriptTxId) {
      (async () => {
        await navigator.clipboard.writeText(scriptTxId);
        enqueueSnackbar('Copied to clipboard', { variant: 'info' });
      })();
    }
  }, [scriptTxId]);

  return (
    <Dialog
      open={true}
      maxWidth={'lg'}
      fullWidth
      sx={{
        padding: '8px',
        '& .MuiPaper-root': {
          background:
            theme.palette.mode === 'dark'
              ? theme.palette.neutral.main
              : theme.palette.background.default,
        },
      }}
    >
      <DialogTitle
        display='flex'
        justifyContent={'space-between'}
        alignItems='center'
        lineHeight={0}
      >
        <Typography
          sx={{
            fontWeight: 500,
            fontSize: '25px',
            lineHeight: '34px',
          }}
        >
          Register Operator
        </Typography>
        <IconButton
          onClick={handleClose}
          sx={{
            background: theme.palette.primary.main,
            '&:hover': {
              background: theme.palette.primary.main,
              opacity: 0.8,
            },
          }}
        >
          <img src='./close-icon.svg' />
        </IconButton>
      </DialogTitle>
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
              {findTag(state, 'scriptName')}
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
        <Box display={'flex'} flexDirection={'column'} gap={'16px'} width={'45%'}>
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
            <Typography>{findTag(state, 'description') || 'No Description Available'}</Typography>
          </Box>
          <Button variant='outlined' endIcon={<ContentCopy />} onClick={handleCopy}>
            <Typography>Copy Tx Id ({displayShortTxOrAddr(scriptTxId as string)})</Typography>
          </Button>
        </Box>
      </CardContent>
      <DialogContent sx={{ padding: '20px 32px' }}>
        <CustomStepper
          data={state}
          handleSubmit={handleRegister}
          handleClose={handleClose}
          isRegistered={isRegistered}
        />
      </DialogContent>
    </Dialog>
  );
};

export default Register;
