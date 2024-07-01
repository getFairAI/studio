import { CustomStepper } from '@/components/stepper';
import {
  TAG_NAMES,
  REGISTER_OPERATION,
  secondInMS,
  OPERATOR_USDC_FEE,
  MARKETPLACE_EVM_ADDRESS,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
} from '@/constants';
import { IEdge } from '@/interfaces/arweave';
import { findTag } from '@/utils/common';
import {
  Typography,
  DialogContent,
  Dialog,
  DialogTitle,
  IconButton,
  useTheme,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useCallback, useContext, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '@/styles/ui.css';
import { WalletContext } from '@/context/wallet';
import Close from '@mui/icons-material/Close';
import { EVMWalletContext } from '@/context/evm-wallet';
import arweave from '@/utils/arweave';
import { sendUSDC } from '@fairai/evm-sdk';

const Register = () => {
  const { state }: { state: IEdge } = useLocation();
  const [isRegistered, setIsRegistered] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const theme = useTheme();
  const { dispatchTx } = useContext(WalletContext);
  const { usdcBalance } = useContext(EVMWalletContext);

  const handleRegister = async (fee: string, operatorName: string, handleNext: () => void) => {
    try {
      if (usdcBalance < OPERATOR_USDC_FEE) {
        enqueueSnackbar('Insufficient USDC Balance', { variant: 'error' });
        return;
      }

      const tags = [];
      tags.push({ name: TAG_NAMES.protocolName, value: PROTOCOL_NAME });
      tags.push({ name: TAG_NAMES.protocolVersion, value: PROTOCOL_VERSION });
      tags.push({
        name: TAG_NAMES.solutionName,
        value: findTag(state, 'solutionName') ?? '',
      });
      tags.push({
        name: TAG_NAMES.solutionCreator,
        value: state.node.owner.address,
      });
      tags.push({
        name: TAG_NAMES.solutionTransaction,
        value: state.node.id,
      });
      tags.push({ name: TAG_NAMES.operatorFee, value: fee });
      tags.push({ name: TAG_NAMES.operationName, value: REGISTER_OPERATION });
      tags.push({ name: TAG_NAMES.operatorName, value: operatorName });
      tags.push({ name: TAG_NAMES.unixTime, value: (Date.now() / secondInMS).toString() });
      // tags.push({ name: TAG_NAMES.saveTransaction, values: saveResult.id as string });

      const tx = await arweave.createTransaction({ data: 'Operator Registered' });
      tags.forEach((tag) => tx.addTag(tag.name, tag.value));
      const { id: arweaveTxId } = await dispatchTx(tx);
      if (!arweaveTxId) {
        enqueueSnackbar('Something went Wrong. Please Try again...', { variant: 'error' });
        return;
      }
      const paymentHash = await sendUSDC(MARKETPLACE_EVM_ADDRESS, OPERATOR_USDC_FEE, arweaveTxId);
      enqueueSnackbar(
        <>
          Operator Registration Submitted.
          <br></br>
          <a
            href={`https://viewblock.io/arweave/tx/${arweaveTxId}`}
            target={'_blank'}
            rel='noreferrer'
          >
            <u>View Transaction in Explorer</u>
          </a>
        </>,
        { variant: 'success' },
      );
      enqueueSnackbar(
        <>
          Operator Payment Submitted.
          <br></br>
          <a href={`https://arbiscan.io/tx/${paymentHash}`} target={'_blank'} rel='noreferrer'>
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
          size='small'
          className='plausible-event-name=Close+Model+Click'
        >
          <Close />
        </IconButton>
      </DialogTitle>
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
