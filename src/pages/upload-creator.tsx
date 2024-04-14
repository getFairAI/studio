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
  Backdrop,
  Box,
  Button,
  CircularProgress,
  /* CardHeader, */
  Container,
  MenuItem,
  Snackbar,
  Tab,
  Tabs,
  Typography,
  useTheme,
} from '@mui/material';
import {
  SyntheticEvent,
  UIEvent,
  MouseEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FieldValues, UseFormSetValue, useForm, useWatch } from 'react-hook-form';
import TextControl from '@/components/text-control';
import MarkdownControl from '@/components/md-control';
import FileControl from '@/components/file-control';
import AvatarControl from '@/components/avatar-control';
import CustomProgress from '@/components/progress';
import {
  MARKETPLACE_FEE,
  VAULT_ADDRESS,
  TAG_NAMES,
  MODEL_CREATION,
  MODEL_CREATION_PAYMENT,
  MODEL_ATTACHMENT,
  AVATAR_ATTACHMENT,
  NOTES_ATTACHMENT,
  secondInMS,
  successStatusCode,
  U_DIVIDER,
  OLD_PROTOCOL_NAME,
  OLD_PROTOCOL_VERSION,
  U_LOGO_SRC,
  RENDERER_NAME,
} from '@/constants';
import { BundlrContext } from '@/context/bundlr';
import { useSnackbar } from 'notistack';
import { WalletContext } from '@/context/wallet';
import { ChunkError, ChunkInfo } from '@/interfaces/bundlr';
import { FundContext } from '@/context/fund';
import { IContractEdge, ITag } from '@/interfaces/arweave';
import DebounceButton from '@/components/debounce-button';
import { sendU } from '@/utils/u';
import { AdvancedConfiguration } from '@/components/advanced-configuration';
import { LicenseForm } from '@/interfaces/common';
import {
  addAssetTags,
  addLicenseTags,
  commonUpdateQuery,
  displayShortTxOrAddr,
  findTag,
  parseCost,
} from '@/utils/common';
import { WarpFactory } from 'warp-contracts';
import { DeployPlugin } from 'warp-contracts-plugin-deploy';
import SelectControl from '@/components/select-control';
import FairSDKWeb from '@fair-protocol/sdk/web';
import { useLazyQuery, useQuery } from '@apollo/client';
import { GET_LATEST_MODEL_ATTACHMENTS } from '@/queries/graphql';
import { getData } from '@/utils/arweave';
import _ from 'lodash';

interface CreateForm extends FieldValues {
  name: string;
  notes: string;
  file: File;
  description?: string;
  avatar?: File;
  category: string;
}

const ModelOption = ({
  el,
  setValue,
}: {
  el: IContractEdge;
  setValue?: UseFormSetValue<FieldValues>;
}) => {
  const handleModelChoice = useCallback(() => {
    if (setValue) {
      setValue('currentModel', JSON.stringify(el), {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    }
  }, [el, setValue]);
  return (
    <MenuItem
      onClick={handleModelChoice}
      sx={{
        display: 'flex',
        gap: '16px',
      }}
    >
      <Typography>{findTag(el, 'modelName')}</Typography>
      <Typography sx={{ opacity: '0.5' }}>
        {findTag(el, 'modelTransaction')}
        {` (Creator: ${displayShortTxOrAddr(findTag(el, 'sequencerOwner') as string)})`}
      </Typography>
    </MenuItem>
  );
};

const UploadCreator = () => {
  const { handleSubmit, reset, control } = useForm({
    defaultValues: {
      name: '',
      description: '',
      notes: '',
      avatar: '',
      file: '',
      category: '',
    },
  } as FieldValues);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [, setMessage] = useState('');
  const [formData, setFormData] = useState<CreateForm | undefined>(undefined);
  const totalChunks = useRef(0);
  const { nodeBalance, getPrice, chunkUpload, updateBalance } = useContext(BundlrContext);
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const { currentAddress, currentUBalance, updateUBalance } = useContext(WalletContext);
  const { setOpen: setFundOpen } = useContext(FundContext);
  const [isUploading, setIsUploading] = useState(false);
  const [usdFee, setUsdFee] = useState('0');
  const [currentTab, setCurrentTab] = useState<'create' | 'edit'>('create');
  const [selectAnchorEl, setSelectAnchorEl] = useState<null | HTMLElement>(null);
  const selectOpen = useMemo(() => Boolean(selectAnchorEl), [selectAnchorEl]);
  const [models, setModels] = useState<IContractEdge[]>([]);

  const disabled = useMemo(
    () =>
      (!control._formState.isValid && control._formState.isDirty) || !currentAddress || isUploading,
    [control._formState.isValid, control._formState.isDirty, currentAddress, isUploading],
  );

  const licenseRef = useRef<HTMLInputElement>(null);
  const { control: licenseControl, reset: resetLicenseForm } = useForm<LicenseForm>({
    defaultValues: {
      derivations: '',
      commercialUse: '',
      licenseFeeInterval: '',
      paymentMode: '',
    },
  } as FieldValues);
  const {
    control: updateControl,
    handleSubmit: handleUpdateSubmit,
    setValue: setUpdateValue,
  } = useForm({
    defaultValues: {
      currentModel: '',
      name: '',
      description: '',
      notes: '',
      avatar: '',
      file: '',
      category: '',
    },
  } as FieldValues);
  const modelChanged = useWatch({ name: 'currentModel', control: updateControl });

  const queryObject = FairSDKWeb.utils.getModelsQuery();
  const {
    data: modelsData,
    loading: modelsLoading,
    error: modelsError,
    fetchMore: modelsFetchMore,
  } = useQuery(queryObject.query, {
    variables: {
      ...queryObject.variables,
      tags: [
        ...queryObject.variables.tags,
        { name: TAG_NAMES.sequencerOwner, values: [currentAddress] },
      ],
    },
    skip: !currentAddress,
    notifyOnNetworkStatusChange: true,
  });

  const [fetchAvatar, { data: avatarData }] = useLazyQuery(GET_LATEST_MODEL_ATTACHMENTS);
  const [fetchNotes, { data: notesData }] = useLazyQuery(GET_LATEST_MODEL_ATTACHMENTS);

  useEffect(() => {
    const txString = localStorage.getItem('model');
    if (txString) {
      setUpdateValue('currentModel', txString);
      setCurrentTab('edit');
      localStorage.removeItem('model');
    }
  }, [setUpdateValue, setCurrentTab]);

  useEffect(() => {
    if (modelsData) {
      setModels(FairSDKWeb.utils.filterByUniqueModelTxId(modelsData.transactions.edges));
    }
  }, [modelsData]);

  useEffect(() => {
    if (modelChanged) {
      const tx = JSON.parse(modelChanged);
      const name = findTag(tx, 'modelName') ?? '';
      const description = findTag(tx, 'description') ?? '';
      /* const notes = findTag(tx, '');
      const avatar = findTag(tx, 'avatar'); */
      const category = findTag(tx, 'modelCategory') ?? '';
      const modelId = findTag(tx, 'modelTransaction') ?? '';
      setUpdateValue('name', name);
      setUpdateValue('description', description);
      setUpdateValue('category', category);
      fetchAvatar({
        variables: {
          tags: [
            { name: TAG_NAMES.operationName, values: [MODEL_ATTACHMENT] },
            { name: TAG_NAMES.attachmentRole, values: [AVATAR_ATTACHMENT] },
            { name: TAG_NAMES.modelTransaction, values: [modelId] },
          ],
          owner: currentAddress,
        },
      });
      fetchNotes({
        variables: {
          tags: [
            { name: TAG_NAMES.operationName, values: [MODEL_ATTACHMENT] },
            { name: TAG_NAMES.attachmentRole, values: [NOTES_ATTACHMENT] },
            { name: TAG_NAMES.modelTransaction, values: [modelId] },
          ],
          owner: currentAddress,
        },
      });
    }
  }, [modelChanged, updateControl, currentAddress, setUpdateValue]);

  useEffect(() => {
    const avatarTxId = avatarData?.transactions?.edges[0]?.node.id ?? '';

    if (avatarTxId) {
      setUpdateValue('avatar', avatarTxId);
    } else {
      setUpdateValue('avatar', '');
    }
  }, [avatarData, setUpdateValue]);

  useEffect(() => {
    const notesTxId = notesData?.transactions?.edges[0]?.node.id ?? '';

    if (notesTxId) {
      (async () => {
        const notesContent = (await getData(notesTxId)) as string;
        setUpdateValue('notes', notesContent);
      })();
    } else {
      setUpdateValue('notes', '');
    }
  }, [notesData]);

  const onSubmit = async (data: FieldValues) => {
    await updateBalance();
    setFormData(data as CreateForm);

    if (nodeBalance <= 0) {
      setFundOpen(true);
    } else {
      setIsUploading(true);
      await handleFundFinished(data as CreateForm);
      setIsUploading(false);
    }
  };

  const onUpdateSubmit = useCallback(
    async (data: FieldValues) => {
      if (currentUBalance < parseInt(MARKETPLACE_FEE, 10)) {
        enqueueSnackbar('Not Enough Balance in your Wallet to pay MarketPlace Fee', {
          variant: 'error',
        });
        return;
      } else {
        setIsUploading(true);
        try {
          const parsedCurrentModel = JSON.parse(data.currentModel);
          const modelId = findTag(parsedCurrentModel, 'modelTransaction') ?? '';
          const previousVersions = findTag(parsedCurrentModel, 'previousVersions') ?? '';
          const previousData = {
            name: findTag(parsedCurrentModel, 'modelName'),
            description: findTag(parsedCurrentModel, 'description'),
            category: findTag(parsedCurrentModel, 'modelCategory'),
          };
          const currentData = {
            name: data.name,
            description: data.description,
            category: data.category,
          };

          if (!_.isEqual(previousData, currentData)) {
            const parsedUFee = parseFloat(MARKETPLACE_FEE) * U_DIVIDER;

            const paymentTags = [
              { name: TAG_NAMES.protocolName, value: OLD_PROTOCOL_NAME },
              { name: TAG_NAMES.protocolVersion, value: OLD_PROTOCOL_VERSION },
              { name: TAG_NAMES.operationName, value: MODEL_CREATION_PAYMENT },
              { name: TAG_NAMES.modelName, value: data.name },
              { name: TAG_NAMES.modelCategory, value: data.category },
              { name: TAG_NAMES.modelTransaction, value: modelId },
              { name: TAG_NAMES.updateFor, value: modelId },
              { name: TAG_NAMES.unixTime, value: (Date.now() / secondInMS).toString() },
            ];

            if (previousVersions) {
              const prevVersions: string[] = JSON.parse(previousVersions);
              prevVersions.push(modelId);
              paymentTags.push({
                name: TAG_NAMES.previousVersions,
                value: JSON.stringify(prevVersions),
              });
            } else {
              paymentTags.push({
                name: TAG_NAMES.previousVersions,
                value: JSON.stringify([modelId]),
              });
            }

            if (data.description) {
              paymentTags.push({ name: TAG_NAMES.description, value: data.description });
            }

            const paymentId = await sendU(VAULT_ADDRESS, parsedUFee.toString(), paymentTags);
            await updateUBalance();
            enqueueSnackbar(
              <>
                Model Updated
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
          }

          const avatarTxId = avatarData?.transactions?.edges[0]?.node.id ?? '';
          const notesTxId = notesData?.transactions?.edges[0]?.node.id ?? '';
          const notesContent = (await getData(notesTxId)) as string;

          try {
            if (data.notes !== notesContent) {
              await uploadUsageNotes(modelId, data.name, data.notes);
            }
            if (data.avatar !== avatarTxId) {
              await uploadAvatarImage(modelId, data.avatar);
            }
          } catch (error) {
            enqueueSnackbar('Error Uploading An Attchment', { variant: 'error' });
            // error uploading attachments
          }
        } catch (error) {
          setSnackbarOpen(false);
          setProgress(0);
          setMessage('Upload error ');
          enqueueSnackbar('An Error Occured.', { variant: 'error' });
        }
        setIsUploading(false);
      }
    },
    [
      nodeBalance,
      currentUBalance,
      avatarData,
      notesData,
      enqueueSnackbar,
      updateUBalance,
      setFundOpen,
      setProgress,
      setMessage,
      setSnackbarOpen,
      setIsUploading,
    ],
  );

  const bundlrUpload = async (fileToUpload: File, tags: ITag[], successMessage: string) => {
    const filePrice = await getPrice(fileToUpload.size);
    if (filePrice.toNumber() > nodeBalance) {
      enqueueSnackbar('Not Enought Balance in Bundlr Node', { variant: 'error' });
    }
    const finishedPercentage = 100;

    /** Register Event Callbacks */
    // event callback: called for every chunk uploaded
    const handleUpload = (chunkInfo: ChunkInfo) => {
      const chunkNumber = chunkInfo.id + 1;
      // update the progress bar based on how much has been uploaded
      if (chunkNumber >= totalChunks.current) {
        setProgress(finishedPercentage);
      } else {
        setProgress((chunkNumber / totalChunks.current) * finishedPercentage);
      }
    };

    // event callback: called if an error happens
    const handleError = (e: ChunkError) => {
      setSnackbarOpen(false);
      enqueueSnackbar(
        `Error uploading chunk number ${e.id} - ${(e.res as { statusText: string }).statusText}`,
        { variant: 'error' },
      );
    };

    // event callback: called when file is fully uploaded
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleDone = (_finishRes: unknown) => {
      // set the progress bar to 100
      setProgress(finishedPercentage);
      setSnackbarOpen(false);
    };

    const res = await chunkUpload(
      fileToUpload,
      tags,
      totalChunks,
      handleUpload,
      handleError,
      handleDone,
    );

    if (res.status === successStatusCode) {
      enqueueSnackbar(
        <>
          {successMessage} <br></br>
          <a
            href={`https://viewblock.io/arweave/tx/${res.data.id}`}
            target={'_blank'}
            rel='noreferrer'
          >
            <u>View Transaction in Explorer</u>
          </a>
        </>,
        { variant: 'success' },
      );
    } else {
      throw new Error(res.statusText);
    }

    return res;
  };

  const uploadAvatarImage = async (modelTx: string, image?: File) => {
    if (!image || !(image instanceof File)) {
      return;
    }

    // upload the file
    const tags = [];
    tags.push({ name: TAG_NAMES.protocolName, value: OLD_PROTOCOL_NAME });
    tags.push({ name: TAG_NAMES.protocolVersion, value: OLD_PROTOCOL_VERSION });
    tags.push({ name: TAG_NAMES.contentType, value: image.type });
    tags.push({ name: TAG_NAMES.modelTransaction, value: modelTx });
    tags.push({ name: TAG_NAMES.operationName, value: MODEL_ATTACHMENT });
    tags.push({ name: TAG_NAMES.attachmentName, value: image.name });
    tags.push({ name: TAG_NAMES.attachmentRole, value: AVATAR_ATTACHMENT });
    tags.push({ name: TAG_NAMES.unixTime, value: (Date.now() / secondInMS).toString() });
    setSnackbarOpen(true);

    await bundlrUpload(image, tags, 'Avatar Uploaded Successfully');
  };

  const uploadUsageNotes = async (modelTx: string, modelName: string, usageNotes: string) => {
    const file = new File([usageNotes], `${modelName}-usage.md`, {
      type: 'text/markdown',
    });

    // upload the file
    const tags = [];
    tags.push({ name: TAG_NAMES.protocolName, value: OLD_PROTOCOL_NAME });
    tags.push({ name: TAG_NAMES.protocolVersion, value: OLD_PROTOCOL_VERSION });
    tags.push({ name: TAG_NAMES.contentType, value: file.type });
    tags.push({ name: TAG_NAMES.modelTransaction, value: modelTx });
    tags.push({ name: TAG_NAMES.operationName, value: MODEL_ATTACHMENT });
    tags.push({ name: TAG_NAMES.attachmentName, value: file.name });
    tags.push({ name: TAG_NAMES.attachmentRole, value: NOTES_ATTACHMENT });
    tags.push({ name: TAG_NAMES.unixTime, value: (Date.now() / secondInMS).toString() });
    setSnackbarOpen(true);

    await bundlrUpload(file, tags, 'Usage Notes Uploaded Successfully');
  };

  const handleFundFinished = async (data?: CreateForm) => {
    setFundOpen(false);
    if (!data) {
      data = formData;
    }

    if (!data?.file) {
      enqueueSnackbar('No File Selected', { variant: 'error' });
      return;
    }

    const file = data.file;

    // upload the file
    const tags = [];
    const parsedUFee = parseFloat(MARKETPLACE_FEE) * U_DIVIDER;

    if (currentUBalance < parseInt(MARKETPLACE_FEE, 10)) {
      enqueueSnackbar('Not Enough Balance in your Wallet to pay MarketPlace Fee', {
        variant: 'error',
      });
      return;
    }

    tags.push({ name: TAG_NAMES.protocolName, value: OLD_PROTOCOL_NAME });
    tags.push({ name: TAG_NAMES.protocolVersion, value: OLD_PROTOCOL_VERSION });
    tags.push({ name: TAG_NAMES.contentType, value: file.type });
    tags.push({ name: TAG_NAMES.modelName, value: `${data.name}` });
    tags.push({ name: TAG_NAMES.modelCategory, value: data.category });
    tags.push({ name: TAG_NAMES.operationName, value: MODEL_CREATION });
    tags.push({ name: TAG_NAMES.paymentQuantity, value: parsedUFee.toString() });
    tags.push({ name: TAG_NAMES.paymentTarget, value: VAULT_ADDRESS });
    if (data.description) {
      tags.push({ name: TAG_NAMES.description, value: data.description });
    }
    tags.push({ name: TAG_NAMES.renderWith, value: RENDERER_NAME });
    tags.push({ name: TAG_NAMES.unixTime, value: (Date.now() / secondInMS).toString() });
    addAssetTags(tags, currentAddress);
    addLicenseTags(tags, licenseControl._formValues, licenseRef.current?.value);
    setSnackbarOpen(true);

    try {
      const res = await bundlrUpload(file, tags, 'Model Uploaded Successfully');
      // register the model asset  in the warp contract
      const warp = await WarpFactory.forMainnet().use(new DeployPlugin());
      warp.register(res.data.id, 'arweave');

      const paymentTags = [
        { name: TAG_NAMES.protocolName, value: OLD_PROTOCOL_NAME },
        { name: TAG_NAMES.protocolVersion, value: OLD_PROTOCOL_VERSION },
        { name: TAG_NAMES.contentType, value: file.type },
        { name: TAG_NAMES.operationName, value: MODEL_CREATION_PAYMENT },
        { name: TAG_NAMES.modelName, value: data.name },
        { name: TAG_NAMES.modelCategory, value: data.category },
        { name: TAG_NAMES.modelTransaction, value: res.data.id },
        { name: TAG_NAMES.unixTime, value: (Date.now() / secondInMS).toString() },
      ];

      if (data.description) {
        paymentTags.push({ name: TAG_NAMES.description, value: data.description });
      }

      const paymentId = await sendU(VAULT_ADDRESS, parsedUFee.toString(), paymentTags);
      await updateUBalance();
      enqueueSnackbar(
        <>
          Paid Marketplace Fee: {MARKETPLACE_FEE} $U Tokens.
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

      try {
        await uploadUsageNotes(res.data.id, data.name, data.notes);
        await uploadAvatarImage(res.data.id, data.avatar);
      } catch (error) {
        enqueueSnackbar('Error Uploading An Attchment', { variant: 'error' });
        // error uploading attachments
      }
      reset(); // reset form
    } catch (error) {
      setSnackbarOpen(false);
      setProgress(0);
      setMessage('Upload error ');
      enqueueSnackbar('An Error Occured.', { variant: 'error' });
    }
  };

  const handleReset = useCallback(() => reset(), [reset]);

  const handleCloseSnackbar = useCallback(() => setSnackbarOpen(false), [setSnackbarOpen]);

  useEffect(() => {
    (async () => {
      const nDigits = 4;
      const usdCost = await parseCost(parseFloat(MARKETPLACE_FEE));
      setUsdFee(usdCost.toFixed(nDigits));
    })();
  }, [MARKETPLACE_FEE, parseCost]);

  const handleTabChange = useCallback(
    (_: SyntheticEvent, value: 'create' | 'edit') => setCurrentTab(value),
    [setCurrentTab],
  );

  const selectLoadMore = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const bottomOffset = 100;
      const bottom =
        event.currentTarget.scrollHeight - event.currentTarget.scrollTop <=
        event.currentTarget.clientHeight + bottomOffset;

      const hasNextPage = modelsData?.transactions?.pageInfo?.hasNextPage;
      if (bottom && hasNextPage) {
        // user is at the end of the list so load more items
        modelsFetchMore({
          variables: {
            after:
              modelsData && modelsData.transactions.edges.length > 0
                ? modelsData.transactions.edges[modelsData.transactions.edges.length - 1].cursor
                : undefined,
          },
          updateQuery: commonUpdateQuery,
        });
      }
    },
    [modelsData, commonUpdateQuery],
  );

  const handleSelected = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (selectAnchorEl) {
        setSelectAnchorEl(null);
      } else {
        setSelectAnchorEl(event.currentTarget);
      }
    },
    [selectAnchorEl, setSelectAnchorEl],
  );

  const renderValueFn = useCallback((selected: unknown) => {
    if (typeof selected !== 'string') {
      return '';
    }

    const title = findTag(JSON.parse(selected), 'modelName');
    const mainText = findTag(JSON.parse(selected), 'modelTransaction');
    const subText =
      findTag(JSON.parse(selected), 'sequencerOwner') ?? JSON.parse(selected).node.owner.address;

    return (
      <Box
        sx={{
          display: 'flex',
          gap: '16px',
        }}
      >
        <Typography>{title}</Typography>
        <Typography sx={{ opacity: '0.5' }}>
          {mainText}
          {` (Creator: ${displayShortTxOrAddr(subText as string)}) `}
        </Typography>
      </Box>
    );
  }, []);

  return (
    <Container
      sx={{
        padding: 0,
        margin: 0,
        height: '100%',
        blockSize: 'auto',
        '@media all': {
          maxWidth: '100%',
          padding: 0,
        },
        '@media (min-height: 1240px)': {
          blockSize: '100%',
        },
      }}
    >
      <Container maxWidth={'lg'}>
        <Tabs value={currentTab} onChange={handleTabChange}>
          <Tab label='Create Model' value='create' />
          <Tab label='Update Model' value='edit' />
        </Tabs>
        <Box
          role='tabpanel'
          hidden={currentTab !== 'create'}
          display={'flex'}
          flexDirection={'column'}
          gap={'16px'}
        >
          {currentTab === 'create' && (
            <Box
              sx={{
                marginTop: '16px',
                paddingBottom: 0,
                gap: '32px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box padding={'0px 32px'}>
                <TextControl
                  name='name'
                  control={control}
                  rules={{ required: true }}
                  mat={{
                    variant: 'outlined',
                    InputProps: {
                      sx: {
                        borderWidth: '1px',
                        borderColor: theme.palette.text.primary,
                      },
                    },
                  }}
                  style={{ width: '100%' }}
                />
              </Box>
              <Box display={'flex'} gap={'30px'} width={'100%'} padding='0px 32px'>
                <Box width={'25%'}>
                  <AvatarControl name='avatar' control={control} />
                </Box>
                <Box sx={{ width: '100%', marginTop: 0, height: '219px', marginBottom: 0 }}>
                  <SelectControl
                    name='category'
                    control={control}
                    rules={{ required: true }}
                    defaultValue={''}
                    mat={{
                      sx: {
                        borderWidth: '1px',
                        borderColor: theme.palette.text.primary,
                        borderRadius: '16px',
                      },
                      placeholder: 'Category',
                    }}
                  >
                    <MenuItem value={'text'}>Text</MenuItem>
                    <MenuItem value={'image'}>Image</MenuItem>
                    <MenuItem value={'audio'}>Audio</MenuItem>
                    <MenuItem value={'video'}>Video</MenuItem>
                    <MenuItem value={'other'}>Other</MenuItem>
                  </SelectControl>
                  <TextControl
                    name='description'
                    control={control}
                    mat={{
                      variant: 'outlined',
                      multiline: true,
                      margin: 'normal',
                      minRows: 5,
                      maxRows: 6,
                      InputProps: {
                        sx: {
                          borderWidth: '1px',
                          borderColor: theme.palette.text.primary,
                          height: '100%',
                        },
                      },
                    }}
                    style={{ width: '100%' }}
                  />
                </Box>
              </Box>

              <Box padding='0px 32px'>
                <Typography paddingLeft={'8px'}>Usage Notes</Typography>
                <MarkdownControl props={{ name: 'notes', control, rules: { required: true } }} />
              </Box>
              <Box padding='0px 32px'>
                <FileControl name='file' control={control} rules={{ required: true }} />
              </Box>
              <AdvancedConfiguration
                licenseRef={licenseRef}
                licenseControl={licenseControl}
                resetLicenseForm={resetLicenseForm}
              />
              <Box padding='0px 32px'>
                <Alert severity='warning' variant='outlined'>
                  <Typography alignItems={'center'} display={'flex'} gap={'4px'}>
                    Uploading a model requires a fee of {MARKETPLACE_FEE}
                    <img width='20px' height='20px' src={U_LOGO_SRC} /> (${usdFee}) Tokens.
                  </Typography>
                </Alert>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  padding: '0 32px 32px 32px',
                  justifyContent: 'flex-end',
                  mt: '32px',
                  width: '100%',
                  gap: '32px',
                }}
              >
                <Button
                  onClick={handleReset}
                  sx={{
                    // border: `1px solid ${theme.palette.text.primary}`,
                    height: '39px',
                    width: '204px',
                  }}
                  variant='outlined'
                  className='plausible-event-name=Reset+to+Default+Click'
                >
                  <Typography
                    sx={{
                      fontStyle: 'normal',
                      fontWeight: 500,
                      fontSize: '15px',
                      lineHeight: '20px',
                    }}
                  >
                    Reset to Default
                  </Typography>
                </Button>
                <DebounceButton
                  onClick={handleSubmit(onSubmit)}
                  disabled={disabled}
                  sx={{
                    height: '39px',
                    width: '204px',
                  }}
                  variant='contained'
                  className='plausible-event-name=Submit+Model+Click'
                >
                  <Typography
                    sx={{
                      fontStyle: 'normal',
                      fontWeight: 500,
                      fontSize: '15px',
                      lineHeight: '20px',
                    }}
                  >
                    Submit
                  </Typography>
                </DebounceButton>
              </Box>
            </Box>
          )}
        </Box>
        <Box
          role='tabpanel'
          hidden={currentTab !== 'edit'}
          display={'flex'}
          flexDirection={'column'}
          gap={'16px'}
        >
          {currentTab === 'edit' && (
            <Box
              sx={{
                marginTop: '16px',
                paddingBottom: 0,
                gap: '32px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box padding={'0px 32px'}>
                <SelectControl
                  name={'currentModel'}
                  control={updateControl}
                  rules={{ required: !disabled }}
                  disabled={disabled}
                  defaultValue=''
                  mat={{
                    onClick: handleSelected,
                    placeholder: 'Choose Model to Update',
                    sx: {
                      borderWidth: '1px',
                      borderColor: theme.palette.text.primary,
                      borderRadius: '16px',
                    },
                    renderValue: renderValueFn,
                    MenuProps: {
                      anchorEl: selectAnchorEl,
                      open: selectOpen,
                      PaperProps: {
                        onScroll: selectLoadMore,
                        sx: {
                          minHeight: '144px',
                          maxHeight: '144px',
                          overflowY: modelsLoading ? 'hidden' : 'auto',
                        },
                      },
                    },
                  }}
                >
                  {modelsLoading && (
                    <Backdrop
                      sx={{
                        zIndex: theme.zIndex.drawer + 1,
                        backdropFilter: 'blur(1px)',
                        display: 'flex',
                        flexDirection: 'column',
                        position: 'absolute',
                        minHeight: '144px',
                      }}
                      open={modelsLoading}
                    >
                      <CircularProgress color='primary'></CircularProgress>
                    </Backdrop>
                  )}
                  {modelsError && (
                    <Box>
                      <Typography>{'Could Not Fetch Available Models'}</Typography>
                    </Box>
                  )}

                  {models.length > 0 &&
                    models.map((el: IContractEdge) => (
                      <ModelOption key={el.node.id} el={el} setValue={setUpdateValue} />
                    ))}

                  {models.length === 0 && (
                    <Box>
                      <Typography>{'There Are no Available Models'}</Typography>
                    </Box>
                  )}
                </SelectControl>
              </Box>
              <Box padding={'0px 32px'}>
                <TextControl
                  name='name'
                  control={updateControl}
                  rules={{ required: true }}
                  mat={{
                    variant: 'outlined',
                    InputProps: {
                      sx: {
                        borderWidth: '1px',
                        borderColor: theme.palette.text.primary,
                      },
                    },
                  }}
                  style={{ width: '100%' }}
                />
              </Box>
              <Box display={'flex'} gap={'30px'} width={'100%'} padding='0px 32px'>
                <Box width={'25%'}>
                  <AvatarControl name='avatar' control={updateControl} />
                </Box>
                <Box sx={{ width: '100%', marginTop: 0, height: '219px', marginBottom: 0 }}>
                  <SelectControl
                    name='category'
                    control={updateControl}
                    rules={{ required: true }}
                    defaultValue={''}
                    mat={{
                      sx: {
                        borderWidth: '1px',
                        borderColor: theme.palette.text.primary,
                        borderRadius: '16px',
                      },
                      placeholder: 'Category',
                    }}
                  >
                    <MenuItem value={'text'}>Text</MenuItem>
                    <MenuItem value={'image'}>Image</MenuItem>
                    <MenuItem value={'audio'}>Audio</MenuItem>
                    <MenuItem value={'video'}>Video</MenuItem>
                    <MenuItem value={'other'}>Other</MenuItem>
                  </SelectControl>
                  <TextControl
                    name='description'
                    control={updateControl}
                    mat={{
                      variant: 'outlined',
                      multiline: true,
                      margin: 'normal',
                      minRows: 5,
                      maxRows: 6,
                      InputProps: {
                        sx: {
                          borderWidth: '1px',
                          borderColor: theme.palette.text.primary,
                          height: '100%',
                        },
                      },
                    }}
                    style={{ width: '100%' }}
                  />
                </Box>
              </Box>

              <Box padding='0px 32px'>
                <Typography paddingLeft={'8px'}>Usage Notes</Typography>
                <MarkdownControl
                  props={{ name: 'notes', control: updateControl, rules: { required: true } }}
                />
              </Box>
              <Box padding='0px 32px'>
                <Alert severity='warning' variant='outlined'>
                  <Typography alignItems={'center'} display={'flex'} gap={'4px'}>
                    Updating a model requires a fee of {MARKETPLACE_FEE}
                    <img width='20px' height='20px' src={U_LOGO_SRC} /> (${usdFee}) Tokens.
                  </Typography>
                </Alert>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  padding: '0 32px 32px 32px',
                  justifyContent: 'flex-end',
                  mt: '32px',
                  width: '100%',
                  gap: '32px',
                }}
              >
                <DebounceButton
                  onClick={handleUpdateSubmit(onUpdateSubmit)}
                  disabled={disabled}
                  sx={{
                    height: '39px',
                    width: '204px',
                  }}
                  variant='contained'
                  className='plausible-event-name=Update+Model+Click'
                >
                  <Typography
                    sx={{
                      fontStyle: 'normal',
                      fontWeight: 500,
                      fontSize: '15px',
                      lineHeight: '20px',
                    }}
                  >
                    Update Fields
                  </Typography>
                </DebounceButton>
              </Box>
            </Box>
          )}
        </Box>
        <Snackbar
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          open={snackbarOpen}
          onClose={handleCloseSnackbar}
          ClickAwayListenerProps={{ onClickAway: () => null }}
        >
          <Alert
            severity='info'
            sx={{
              minWidth: '300px',
              '.MuiAlert-message': {
                width: '100%',
              },
            }}
          >
            Uploading...
            <CustomProgress value={progress}></CustomProgress>
          </Alert>
        </Snackbar>
      </Container>
    </Container>
  );
};

export default UploadCreator;
