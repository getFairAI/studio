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
  Checkbox,
  CircularProgress,
  Container,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  FormLabel,
  MenuItem,
  Snackbar,
  Tab,
  Tabs,
  Typography,
  useTheme,
} from '@mui/material';
import {
  ChangeEvent,
  UIEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  MouseEvent,
  SyntheticEvent,
} from 'react';
import {
  Control,
  FieldValues,
  UseControllerProps,
  UseFormSetValue,
  useController,
  useForm,
  useWatch,
} from 'react-hook-form';
import TextControl from '@/components/text-control';
import SelectControl from '@/components/select-control';
import MarkdownControl from '@/components/md-control';
import FileControl from '@/components/file-control';
import AvatarControl from '@/components/avatar-control';
import CustomProgress from '@/components/progress';
import {
  TAG_NAMES,
  SCRIPT_CREATION,
  SCRIPT_CREATION_PAYMENT,
  secondInMS,
  U_DIVIDER,
  SCRIPT_CREATION_FEE,
  VAULT_ADDRESS,
  SCRIPT_CREATION_PAYMENT_TAGS,
  DEFAULT_TAGS,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  U_LOGO_SRC,
} from '@/constants';
import { BundlrContext } from '@/context/bundlr';
import { useSnackbar } from 'notistack';
import { WalletContext } from '@/context/wallet';
import { FundContext } from '@/context/fund';
import { ApolloError, useQuery } from '@apollo/client';
import { FIND_BY_TAGS } from '@/queries/graphql';
import { IContractEdge, IContractQueryResult } from '@/interfaces/arweave';
import {
  addAssetTags,
  addLicenseTags,
  bundlrUpload,
  commonUpdateQuery,
  displayShortTxOrAddr,
  findTag,
  isFakeDeleted,
  parseCost,
  uploadAvatarImage,
  uploadUsageNotes,
} from '@/utils/common';
import DebounceButton from '@/components/debounce-button';
import { sendU } from '@/utils/u';
import { fetchMoreFn } from '@/utils/apollo';
import { AdvancedConfiguration } from '@/components/advanced-configuration';
import { LicenseForm } from '@/interfaces/common';
import { WarpFactory } from 'warp-contracts';
import { DeployPlugin } from 'warp-contracts-plugin-deploy';
import FairSDKWeb from '@fair-protocol/sdk/web';

export interface CreateForm extends FieldValues {
  name: string;
  fee: number;
  output: string;
  outputConfiguration: string;
  notes: string;
  file: File;
  model: string;
  script: string;
  description?: string;
  avatar?: File;
  allow: { allowFiles: boolean; allowText: boolean };
}

const AllowGroupControl = (props: UseControllerProps) => {
  const { field } = useController(props);

  const error = useMemo(() => {
    const values = field.value as { allowFiles: boolean; allowText: boolean };
    if (!values.allowFiles && !values.allowText) {
      return true;
    } else {
      return false;
    }
  }, [field]);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const values = field.value as { allowFiles: boolean; allowText: boolean };
      if (event.target.name === 'allowFiles') {
        field.onChange({
          ...values,
          allowFiles: !values.allowFiles,
        });
      } else if (event.target.name === 'allowText') {
        field.onChange({
          ...values,
          allowText: !values.allowText,
        });
      } else {
        // do nothing
      }
    },
    [field],
  );

  return (
    <FormControl required error={error} variant='outlined'>
      <FormLabel>Choose Input configurations:</FormLabel>
      <FormGroup>
        <FormControlLabel
          control={
            <Checkbox
              checked={field.value.allowFiles}
              onChange={handleChange}
              name='allowFiles'
              onBlur={field.onBlur}
            />
          }
          label='Allow Files'
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={field.value.allowText}
              onChange={handleChange}
              name='allowText'
              onBlur={field.onBlur}
            />
          }
          label='Allow Text'
        />
      </FormGroup>
      {error && <FormHelperText>Please Choose at least one of the options</FormHelperText>}
    </FormControl>
  );
};

const ScriptOption = ({
  el,
  setValue,
  modelsData,
}: {
  el: IContractEdge;
  setValue?: UseFormSetValue<FieldValues>;
  modelsData?: IContractEdge[];
}) => {
  const handleScriptChoice = useCallback(async () => {
    if (!setValue || !modelsData) {
      return;
    } else {
      const scriptModel = await FairSDKWeb.utils.getById(findTag(el, 'modelTransaction') as string);
      setValue('model', JSON.stringify(scriptModel), {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setValue('script', JSON.stringify(el), {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    }
  }, [el, modelsData, setValue]);

  return (
    <MenuItem
      onClick={handleScriptChoice}
      sx={{
        display: 'flex',
        gap: '16px',
      }}
    >
      <Typography>{findTag(el, 'scriptName')}</Typography>
      <Typography sx={{ opacity: '0.5' }}>
        {findTag(el, 'scriptTransaction')}
        {` (Creator: ${displayShortTxOrAddr(findTag(el, 'sequencerOwner') as string)}`}
      </Typography>
    </MenuItem>
  );
};

const ModelOption = ({
  el,
  setValue,
}: {
  el: IContractEdge;
  setValue?: UseFormSetValue<FieldValues>;
}) => {
  const handleModelChoice = useCallback(() => {
    if (setValue) {
      setValue('model', JSON.stringify(el), {
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
        {` (Creator: ${displayShortTxOrAddr(findTag(el, 'sequencerOwner') as string)}`}
      </Typography>
    </MenuItem>
  );
};

const GenericSelect = ({
  name,
  control,
  data,
  error,
  loading,
  hasNextPage,
  disabled = false,
  setValue,
  loadMore,
}: {
  name: string;
  control: Control<FieldValues, unknown>;
  data: IContractQueryResult;
  error?: ApolloError;
  loading: boolean;
  hasNextPage: boolean;
  disabled?: boolean;
  setValue?: UseFormSetValue<FieldValues>;
  loadMore: fetchMoreFn;
}) => {
  const theme = useTheme();
  const [selectAnchorEl, setSelectAnchorEl] = useState<null | HTMLElement>(null);
  const selectOpen = useMemo(() => Boolean(selectAnchorEl), [selectAnchorEl]);

  const selectLoadMore = (event: UIEvent<HTMLDivElement>) => {
    const bottomOffset = 100;
    const bottom =
      event.currentTarget.scrollHeight - event.currentTarget.scrollTop <=
      event.currentTarget.clientHeight + bottomOffset;
    if (bottom && hasNextPage) {
      // user is at the end of the list so load more items
      loadMore({
        variables: {
          after:
            data && data.transactions.edges.length > 0
              ? data.transactions.edges[data.transactions.edges.length - 1].cursor
              : undefined,
        },
        updateQuery: commonUpdateQuery,
      });
    }
  };
  const isScript = useMemo(() => name === 'script', [name]);
  const hasNoData = useMemo(
    () => !error && !loading && data?.transactions?.edges?.length === 0,
    [error, loading, data],
  );
  const [scriptData, setScriptData] = useState<IContractEdge[]>([]);
  const [modelData, setModelData] = useState<IContractEdge[]>([]);

  const checkShouldLoadMore = (filtered: IContractEdge[]) => {
    const selectRowHeight = 36;
    const maxHeight = 144;
    if (filtered.length * selectRowHeight < maxHeight && data.transactions.pageInfo.hasNextPage) {
      // if there are not enough elements to show scroll & has next pºage, force load more
      loadMore({
        variables: {
          after:
            data && data.transactions.edges.length > 0
              ? data.transactions.edges[data.transactions.edges.length - 1].cursor
              : undefined,
        },
        updateQuery: commonUpdateQuery,
      });
    }
  };

  const filterModels = (newData: IContractQueryResult) => {
    (async () => {
      const filtered: IContractEdge[] = await FairSDKWeb.utils.modelsFilter(newData.transactions.edges);
      setModelData(filtered);
      checkShouldLoadMore(filtered);
    })();
  };

  const filterScripts = (newData: IContractQueryResult) => {
    (async () => {
      const uniqueScripts = FairSDKWeb.utils.filterByUniqueScriptTxId(newData.transactions.edges);
      const filteredScritps =  FairSDKWeb.utils.filterPreviousVersions(uniqueScripts);
      const filtered: IContractEdge[] = [];
      for (const el of filteredScritps) {
        const scriptId = FairSDKWeb.utils.findTag(el, 'scriptTransaction') as string;
        const scriptOwner = FairSDKWeb.utils.findTag(el, 'sequencerOwner') as string ?? el.node.owner.address;
        const sequencerId = FairSDKWeb.utils.findTag(el, 'sequencerTxId') as string ?? el.node.id;

        const isValidPayment = await FairSDKWeb.utils.isUTxValid(sequencerId);

        if (!isValidPayment) {
          // ignore
        } else if (!scriptOwner || !scriptId) {
          // ignore
        } else if (await isFakeDeleted(scriptId, scriptOwner, 'script')) {
          // if fake deleted ignore
        } else {
          filtered.push(el as IContractEdge);
        }
      }

      setScriptData(filtered);
      checkShouldLoadMore(filtered);
    })();
  };

  useEffect(() => {
    if (isScript && data?.transactions?.edges?.length > 0) {
      filterScripts(data);
    } else if (data?.transactions?.edges?.length > 0) {
      filterModels(data);
    } else {
      setScriptData([]);
    }
  }, [isScript, data]);

  const handleSelected = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (disabled) {
        // ignore
      } else if (selectAnchorEl) {
        setSelectAnchorEl(null);
      } else {
        setSelectAnchorEl(event.currentTarget);
      }
    },
    [selectAnchorEl, disabled, setSelectAnchorEl],
  );
  const renderValueFn = useCallback(
    (selected: unknown) => {
      let title;
      let mainText;
      let subText;
      if (typeof selected !== 'string') {
        return '';
      }
      if (isScript) {
        title = findTag(JSON.parse(selected), 'scriptName');
        mainText = findTag(JSON.parse(selected), 'scriptTransaction');
        subText = findTag(JSON.parse(selected), 'sequencerOwner');
      } else {
        title = findTag(JSON.parse(selected), 'modelName');
        mainText = findTag(JSON.parse(selected), 'modelTransaction');
        subText = findTag(JSON.parse(selected), 'sequencerOwner') ?? JSON.parse(selected).node.owner.address;
      }

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
            {` (Creator: ${displayShortTxOrAddr(subText as string)})`}
          </Typography>
        </Box>
      );
    },
    [isScript],
  );

  return (
    <SelectControl
      name={name}
      control={control}
      rules={{ required: !disabled }}
      disabled={disabled}
      mat={{
        onClick: handleSelected,
        placeholder: isScript ? 'Choose a Script' : 'Choose a Model',
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
              overflowY: loading ? 'hidden' : 'auto',
            },
          },
        },
      }}
    >
      {loading && (
        <Backdrop
          sx={{
            zIndex: theme.zIndex.drawer + 1,
            backdropFilter: 'blur(1px)',
            display: 'flex',
            flexDirection: 'column',
            position: 'absolute',
            minHeight: '144px',
          }}
          open={loading}
        >
          <CircularProgress color='primary'></CircularProgress>
        </Backdrop>
      )}
      {error && (
        <Box>
          <Typography>
            {isScript
              ? 'Could not fetch available scripts for the current address'
              : 'Could Not Fetch Available Models'}
          </Typography>
        </Box>
      )}

      {modelData.length > 0 &&
        modelData.map((el: IContractEdge) => (
          <ModelOption key={el.node.id} el={el} setValue={setValue} />
        ))}

      {scriptData.length > 0 &&
        scriptData.map((el: IContractEdge) => (
          <ScriptOption key={el.node.id} el={el} setValue={setValue} modelsData={modelData} />
        ))}

      {hasNoData && (
        <Box>
          <Typography>
            {isScript
              ? 'There are no Scripts created with the current address'
              : 'There Are no Available Models'}
          </Typography>
        </Box>
      )}
    </SelectControl>
  );
};

const OutputFields = ({ control }: { control: Control<FieldValues, unknown> }) => {
  const theme = useTheme();
  const outputValue = useWatch({ name: 'output', control });
  const showOutputConfig = useMemo(() => outputValue === 'image', [outputValue]);

  return (
    <Box display={'flex'} padding={'0px 32px'} gap='32px' width={'100%'}>
      <SelectControl
        name='output'
        control={control}
        rules={{ required: true }}
        defaultValue={'text'}
        mat={{
          sx: {
            borderWidth: '1px',
            borderColor: theme.palette.text.primary,
            borderRadius: '16px',
          },
          placeholder: 'Select The Output Type',
        }}
      >
        <MenuItem value={'text'}>Text</MenuItem>
        <MenuItem value={'audio'}>Audio</MenuItem>
        <MenuItem value={'image'}>Image</MenuItem>
      </SelectControl>
      {
        showOutputConfig && <SelectControl
          name='outputConfiguration'
          control={control}
          rules={{ required: true }}
          defaultValue={'none'}
          mat={{
            sx: {
              borderWidth: '1px',
              borderColor: theme.palette.text.primary,
              borderRadius: '16px',
            },
            placeholder: 'Select The Output Configuration',
          }}
        >
          <MenuItem value={'none'}>None</MenuItem>
          <MenuItem value={'stable-diffusion'}>Stable Diffusion</MenuItem>
        </SelectControl>
      }
    </Box>
  );
};

const UploadCurator = () => {
  const elementsPerPage = 5;
  const { handleSubmit, reset, control, setValue } = useForm({
    defaultValues: {
      name: '',
      fee: 0,
      output: 'text',
      outputConfiguration: 'none',
      description: '',
      notes: '',
      avatar: '',
      file: '',
      model: '',
      script: '',
      allow: {
        allowFiles: false,
        allowText: true,
      },
    },
  } as FieldValues);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [, setMessage] = useState('');
  const [formData, setFormData] = useState<CreateForm | undefined>(undefined);
  const [hasModelsNextPage, setHasModelsNextPage] = useState(false);
  const [hasScriptsNextPage, setHasScriptsNextPage] = useState(false);
  const totalChunks = useRef(0);
  const { nodeBalance, getPrice, chunkUpload, updateBalance } = useContext(BundlrContext);
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const { currentAddress, currentUBalance, updateUBalance } = useContext(WalletContext);
  const { setOpen: setFundOpen } = useContext(FundContext);
  const [isUploading, setIsUploading] = useState(false);
  const [ usdFee, setUsdFee ] = useState('0');
  const [ currentTab, setCurrentTab ] = useState<'create' | 'edit'>('create');

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
    data: scriptsData,
    loading: scriptsLoading,
    error: scriptsError,
    fetchMore: scriptsFetchMore,
  } = useQuery(FIND_BY_TAGS, {
    variables: {
      tags: [
        ...DEFAULT_TAGS,
        ...SCRIPT_CREATION_PAYMENT_TAGS,
        {
          name: TAG_NAMES.sequencerOwner,
          values: [currentAddress],
        },
      ],
      first: elementsPerPage,
    },
    notifyOnNetworkStatusChange: true,
    skip: !currentAddress,
  });

  const queryObject = FairSDKWeb.utils.getModelsQuery();
  const {
    data: modelsData,
    loading: modelsLoading,
    error: modelsError,
    fetchMore: modelsFetchMore,
  } = useQuery(queryObject.query, {
    variables: queryObject.variables,
    notifyOnNetworkStatusChange: true,
  });

  const showSuccessSnackbar = (id: string, message: string) => {
    enqueueSnackbar(
      <>
        {message} <br></br>
        <a href={`https://viewblock.io/arweave/tx/${id}`} target={'_blank'} rel='noreferrer'>
          <u>View Transaction in Explorer</u>
        </a>
      </>,
      { variant: 'success' },
    );
  };

  const commonUploadProps = useMemo(
    () => ({
      nodeBalance,
      totalChunks,
      chunkUpload,
      enqueueSnackbar,
      setSnackbarOpen,
      setProgress,
      getPrice,
      showSuccessSnackbar,
    }),
    [
      nodeBalance,      
      totalChunks,
      chunkUpload,
      enqueueSnackbar,
      setSnackbarOpen,
      setProgress,
      getPrice,
      showSuccessSnackbar,
    ],
  );

  useEffect(() => {
    if (modelsData) {
      setHasModelsNextPage(modelsData?.transactions?.pageInfo?.hasNextPage || false);
    }
  }, [modelsData]);

  useEffect(() => {
    if (scriptsData) {
      setHasScriptsNextPage(scriptsData?.transactions?.pageInfo?.hasNextPage || false);
    }
  }, [scriptsData]);

  const onSubmit = async (data: FieldValues) => {
    await updateBalance();
    setFormData(data as CreateForm);

    if (nodeBalance <= 0) {
      setFundOpen(true);
    } else {
      setIsUploading(true);
      await handleFundFinished(data as CreateForm); // use default node
      setIsUploading(false);
    }
  };

  const getCommonTags = (data: CreateForm, modelData: IContractEdge, modelOwner: string) => {
    const file = data.file;
    const commonTags = [];
    commonTags.push({ name: TAG_NAMES.protocolName, value: PROTOCOL_NAME });
    commonTags.push({ name: TAG_NAMES.protocolVersion, value: PROTOCOL_VERSION });
    commonTags.push({ name: TAG_NAMES.contentType, value: file.type });
    commonTags.push({ name: TAG_NAMES.scriptName, value: `${data.name}` });
    commonTags.push({ name: TAG_NAMES.output, value: data.output });
    if (!!data.outputConfiguration  && data.outputConfiguration !== 'none') {
      commonTags.push({ name: TAG_NAMES.outputConfiguration, value: data.outputConfiguration });
    }
    commonTags.push({
      name: TAG_NAMES.modelName,
      value: findTag(modelData, 'modelName') as string,
    });
    commonTags.push({ name: TAG_NAMES.modelCreator, value: modelOwner });
    commonTags.push({
      name: TAG_NAMES.modelTransaction,
      value: findTag(modelData, 'modelTransaction') as string,
    });
    if (data.description) {
      commonTags.push({ name: TAG_NAMES.description, value: data.description });
    }
    commonTags.push({ name: TAG_NAMES.unixTime, value: (Date.now() / secondInMS).toString() });
    commonTags.push({ name: TAG_NAMES.allowFiles, value: `${data.allow.allowFiles}` });
    commonTags.push({ name: TAG_NAMES.allowText, value: `${data.allow.allowText}` });

    if (currentTab === 'edit') {
      const scriptData = JSON.parse(data.script) as IContractEdge;
      const currentScriptId = findTag(scriptData, 'scriptTransaction') as string;
      commonTags.push({ name: TAG_NAMES.updateFor, value: currentScriptId });
      if (findTag(scriptData, 'previousVersions')) {
        const prevVersions: string[] = JSON.parse(
          findTag(scriptData, 'previousVersions') as string,
        );
        prevVersions.push(currentScriptId);
        commonTags.push({ name: TAG_NAMES.previousVersions, value: JSON.stringify(prevVersions) });
      } else {
        commonTags.push({
          name: TAG_NAMES.previousVersions,
          value: JSON.stringify([currentScriptId]),
        });
      }
    }
    return commonTags;
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
    const modelData = JSON.parse(data.model) as IContractEdge;
    const uFee = parseFloat(SCRIPT_CREATION_FEE) * U_DIVIDER;

    if (currentUBalance < parseFloat(SCRIPT_CREATION_FEE)) {
      enqueueSnackbar(
        `Not Enough Balance in your Wallet to pay Script Creation Fee (${SCRIPT_CREATION_FEE} $U)`,
        { variant: 'error' },
      );
      return;
    }

    const modelOwner = findTag(modelData, 'sequencerOwner') as string ?? modelData.node.owner.address;
    const commonTags = getCommonTags(data, modelData, modelOwner);
    // add extra tags for payment save
    const uploadTags = [...commonTags];
    uploadTags.push({ name: TAG_NAMES.paymentQuantity, value: uFee.toString() });
    uploadTags.push({ name: TAG_NAMES.paymentTarget, value: VAULT_ADDRESS });
    uploadTags.push({ name: TAG_NAMES.operationName, value: SCRIPT_CREATION });
    addAssetTags(uploadTags, currentAddress);
    addLicenseTags(uploadTags, licenseControl._formValues, licenseRef.current?.value);

    setSnackbarOpen(true);
    try {
      const res = await bundlrUpload({
        ...commonUploadProps,
        tags: uploadTags,
        fileToUpload: file,
        successMessage: 'Script Uploaded Successfully',
      });

      // register the model asset  in the warp contract
      const warp = await WarpFactory.forMainnet().use(new DeployPlugin());
      warp.register(res.data.id, 'arweave');

      const paymentTags = [
        ...commonTags,
        { name: TAG_NAMES.scriptTransaction, value: res.data.id },
        { name: TAG_NAMES.operationName, value: SCRIPT_CREATION_PAYMENT },
      ];

      const paymentId = await sendU(VAULT_ADDRESS, uFee.toString(), paymentTags);
      await updateUBalance();

      showSuccessSnackbar(
        paymentId as string,
        `Paid Script Creation Fee ${SCRIPT_CREATION_FEE} $U.`,
      );

      try {
        await uploadUsageNotes(res.data.id, data.name, data.notes, commonUploadProps, 'script');
        if (currentTab === 'create') {
          await uploadAvatarImage(res.data.id, commonUploadProps, 'script', data.avatar);
        }
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

  useEffect(() => {
    (async () => {
      const nDigits = 4;
      const usdCost = await parseCost(parseFloat(SCRIPT_CREATION_FEE));
      setUsdFee(usdCost.toFixed(nDigits));
    })();
  }, [SCRIPT_CREATION_FEE, parseCost]);

  const handleTabChange = useCallback((_: SyntheticEvent, value: 'create' | 'edit') => {
    reset();
    setCurrentTab(value);
  }, [ setCurrentTab, reset ]);

  const getContent = () => {
    if (currentTab === 'create') {
      return <>
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
          <TextControl
            name='description'
            control={control}
            mat={{
              variant: 'outlined',
              multiline: true,
              margin: 'normal',
              minRows: 6,
              maxRows: 6,
              InputProps: {
                sx: {
                  borderWidth: '1px',
                  borderColor: theme.palette.text.primary,
                  height: '100%',
                },
              },
            }}
            style={{ width: '100%', marginTop: 0, marginBottom: 0 }}
          />
        </Box>
        <Box padding='0px 32px'>
          <GenericSelect
            name='model'
            control={control}
            data={modelsData}
            error={modelsError}
            loading={modelsLoading}
            hasNextPage={hasModelsNextPage}
            loadMore={modelsFetchMore}
            disabled={false}
            setValue={setValue}
          />
        </Box>
        <OutputFields control={control} />
      </>;
    } else {
      return <>
        <Box padding='0px 32px' display={'flex'} flexDirection={'column'} gap={'16px'}>
          <GenericSelect
            name='script'
            control={control}
            data={scriptsData}
            error={scriptsError}
            loading={scriptsLoading}
            hasNextPage={hasScriptsNextPage}
            disabled={false}
            loadMore={scriptsFetchMore}
            setValue={setValue}
          />
          <GenericSelect
            name='model'
            control={control}
            data={modelsData}
            error={modelsError}
            loading={modelsLoading}
            hasNextPage={hasModelsNextPage}
            disabled={true}
            loadMore={modelsFetchMore}
          />
        </Box>
        <Box
          display={'flex'}
          justifyContent={'space-between'}
          alignItems={'center'}
          flexGrow={1}
          width={'100%'}
          padding='0px 32px'
          gap='16px'
        >
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
          <OutputFields control={control} />
        </Box>
        <Box padding='0px 32px'>
          <TextControl
            name='description'
            control={control}
            mat={{
              variant: 'outlined',
              multiline: true,
              margin: 'normal',
              minRows: 6,
              maxRows: 6,
              InputProps: {
                sx: {
                  borderWidth: '1px',
                  borderColor: theme.palette.text.primary,
                  height: '100%',
                },
              },
            }}
            style={{ width: '100%', marginTop: 0 }}
          />
        </Box>
      </>;
    }
  };

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
          <Tab label='Create Script' value='create' />
          <Tab label='Update Script' value='edit' />
        </Tabs>
        <Box role='tabpanel' sx={{ marginTop: '16px', paddingBottom: 0, gap: '32px', display: 'flex', flexDirection: 'column' }}>
          {getContent()}
          <Box padding='0px 32px'>
            <AllowGroupControl name={'allow'} control={control} />
          </Box>
          <Box padding='0px 32px'>
            <Typography paddingLeft={'8px'}>
              Usage Notes
            </Typography>
            <MarkdownControl props={{ control, name: 'notes', rules: { required: true } }} />
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
                Uploading a Script requires a fee of {SCRIPT_CREATION_FEE}<img width='20px' height='20px' src={U_LOGO_SRC} /> (${usdFee}) Tokens. 
              </Typography>
            </Alert>
          </Box>
          <Box sx={{ display: 'flex', padding: '0 32px 32px 32px', justifyContent: 'flex-end', mt: '32px', width: '100%', gap: '32px' }}>
            <Button
                onClick={() => reset()}
                sx={{
                  // border: `1px solid ${theme.palette.text.primary}`,
                  borderRadius: '7px',
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
                borderRadius: '7px',
                height: '39px',
                width: '204px',
              }}
              variant='contained'
              className={currentTab === 'create' ? 'plausible-event-name=Submit+Script+Click' : 'plausible-event-name=Update+Script+Click'}
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
        <Snackbar
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          open={snackbarOpen}
          onClose={() => setSnackbarOpen(false)}
          ClickAwayListenerProps={{ onClickAway: () => null }}
        >
          <Alert severity='info' sx={{ width: '100%', minWidth: '300px' }}>
            Uploading...
            <CustomProgress value={progress}></CustomProgress>
          </Alert>
        </Snackbar>
      </Container>
    </Container>
  );
};

export default UploadCurator;
