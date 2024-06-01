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
  Autocomplete,
  Backdrop,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  FormLabel,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Typography,
  createFilterOptions,
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
  FormEvent,
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
import {
  TAG_NAMES,
  secondInMS,
  OLD_PROTOCOL_NAME,
  OLD_PROTOCOL_VERSION,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  MODEL_CREATION,
  MODEL_DELETION,
  MARKETPLACE_ADDRESS,
  MODEL_ATTACHMENT,
  NOTES_ATTACHMENT,
  AVATAR_ATTACHMENT,
  SOLUTION_DELETION,
  SOLUTION_CREATION,
} from '@/constants';
import { useSnackbar } from 'notistack';
import { ApolloError, useLazyQuery, useQuery } from '@apollo/client';
import { FIND_BY_TAGS, FIND_BY_TAGS_WITH_OWNERS, GET_LATEST_MODEL_ATTACHMENTS, IRYS_FIND_BY_TAGS } from '@/queries/graphql';
import { IContractEdge, IContractQueryResult } from '@/interfaces/arweave';
import {
  addAssetTags,
  addLicenseTags,
  commonUpdateQuery,
  displayShortTxOrAddr,
  findTag,
} from '@/utils/common';
import DebounceButton from '@/components/debounce-button';
import { client, fetchMoreFn } from '@/utils/apollo';
import { AdvancedConfiguration } from '@/components/advanced-configuration';
import { LicenseForm } from '@/interfaces/common';
import { WarpFactory } from 'warp-contracts';
import { DeployPlugin } from 'warp-contracts-plugin-deploy';
import { WalletContext } from '@/context/wallet';
import { FundContext } from '@/context/fund';
import { BundlrContext } from '@/context/bundlr';
import { findByTagsAndOwnersDocument, findByTagsAndOwnersQuery, findByTagsQuery } from '@fairai/evm-sdk';
import { getData } from '@/utils/arweave';

export interface CreateForm extends FieldValues {
  name: string;
  output: string;
  outputConfiguration: string;
  notes: string;
  file: File;
  codeUrl: string;
  availableModels: string[];
  solutionRequestId: string;
  solution: string;
  description?: string;
  avatar?: File;
  allow: { allowFiles: boolean; allowText: boolean };
  rewardsEvmAddress: `0x${string}`;
}
interface SupportedModelOption {
  name: string;
  url: string;
}

interface IrysTx {
  id: string;
  tags: {
    name: string;
    value: string;
  }[];
  address: string;
}

interface RequestData {
  title: string;
  description: string;
  keywords: string[];
  id: string;
  owner: string;
  timestamp: string;
}

const filter = createFilterOptions<SupportedModelOption>();

const SupportedModelsPick = ({
  data,
  name,
  control,
  loadMore
}: {
  data: IContractQueryResult;
  name: string;
  control: Control<FieldValues, unknown>;
  error?: ApolloError;
  loading?: boolean;
  loadMore: fetchMoreFn;
}) => {
  const [ options, setOptions ] = useState<SupportedModelOption[]>([]);
  const [value, setValue] = useState<SupportedModelOption[]>([]);
  const [open, toggleOpen] = useState(false);
  const [dialogValue, setDialogValue] = useState({
    name: '',
    url: '',
  });
  const { field } = useController({ name, control });

  const handleClose = () => {
    setDialogValue({
      name: '',
      url: '',
    });
    toggleOpen(false);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValue(prev => [ ...prev, {
      name: dialogValue.name,
      url: dialogValue.url,
    }]);
    handleClose();
  };

  useEffect(() => {
    if (data?.transactions?.edges && data?.transactions?.pageInfo?.hasNextPage) {
      loadMore({
        variables: {
          after:
            data && data.transactions.edges.length > 0
              ? data.transactions.edges[data.transactions.edges.length - 1].cursor
              : undefined,
        },
        updateQuery: commonUpdateQuery,
      });
    } else  if (data?.transactions?.edges) {
      (async () => {
        const owners = data.transactions.edges.map((el: IContractEdge) => el.node.owner.address);
        const { data: deletedData } = await client.query({ query: FIND_BY_TAGS_WITH_OWNERS, variables: {
          tags: [
            { name: TAG_NAMES.protocolName, values: [OLD_PROTOCOL_NAME, PROTOCOL_NAME] },
            { name: TAG_NAMES.protocolVersion, values: [OLD_PROTOCOL_VERSION, PROTOCOL_VERSION ] },
            { name: TAG_NAMES.operationName, values: [ MODEL_DELETION ]}
          ],
          owners,
          first: 100
        }});
        const filtered = [ ...data.transactions.edges ]; // coppy array
        for (const el of deletedData.transactions.edges) {
          const deletedModelid = findTag(el, 'modelTransaction') as string;
          const deletedModelOwner = el.node.owner.address;

          const idx = data.transactions.edges.findIndex((el: IContractEdge) => {
            const modelId = findTag(el, 'modelTransaction') as string;
            const modelOwner = el.node.owner.address;
            return modelId === deletedModelid && (modelOwner === deletedModelOwner || deletedModelOwner === MARKETPLACE_ADDRESS);
          });

          if (idx !== -1) {
            filtered.splice(idx, 1);
          }
        }
        
        const opts = filtered.map((el: IContractEdge) => {
          return {
            name: findTag(el, 'modelName') as string,
            url: `https://arweave.net/${el.node.id}`,
          };
        });
        setOptions(opts);
      })();
    }
  }, [ data, setOptions ]);

  useEffect(() => {
    field.onChange(value);
  }, [ value ]);

  return (
    <>
      <Autocomplete
        value={value}
        multiple
        onChange={(_, newValue) => {
          const lastEl = [ ...newValue ].pop();
          if (lastEl && (typeof lastEl === 'string' || (!lastEl.url))) {
            setDialogValue({
              name: (lastEl as SupportedModelOption).name.replace(/Add "/, '').replace(/"$/, ''),
              url: '',
            });
            toggleOpen(true);
          } else if (lastEl && newValue.length > value.length) {
            setValue((prev) => [...prev, lastEl as SupportedModelOption]);
          } else {
            setValue(newValue as SupportedModelOption[]);
          }
        }}
        filterOptions={(options, params) => {
          const filtered = filter(options, params);

          if (params.inputValue !== '') {
            filtered.push({
              name: `Add "${params.inputValue}"`,
              url: ''
            });
          }

          return filtered;
        }}
        options={options}
        getOptionLabel={(option) => {
          // for example value selected with enter, right from the input
          if (typeof option === 'string') {
            return option;
          } else {
            return option.name;
          }
        }}
        selectOnFocus
        clearOnBlur
        handleHomeEndKeys
        disableCloseOnSelect
        renderOption={(props, option, { selected }) => <MenuItem
          selected={selected}
          {...props}
          sx={{
            display: 'flex',
            gap: '16px',
          }}
        >
          <Checkbox checked={selected} />
          <Typography>{option.name}</Typography>
          <Typography sx={{ opacity: '0.5' }}>
            {option.url}
          </Typography>
        </MenuItem>}
        sx={{ width: '100%' }}
        freeSolo
        renderInput={(params) => <TextField {...params} label='Choose Supported Models, or Add new ones' />}
      />
      <Dialog open={open} onClose={handleClose}>
        <form onSubmit={handleSubmit}>
          <DialogTitle>Add a new Supported Model</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
            <DialogContentText>
              Please add the name and the URL of the model you want to support
            </DialogContentText>
            <TextField
              autoFocus
              id='name'
              value={dialogValue.name}
              onChange={(event) =>
                setDialogValue({
                  ...dialogValue,
                  name: event.target.value,
                })
              }
              label='name'
              type='text'
              variant='standard'
            />
            <TextField
              id='url'
              error
              value={dialogValue.url}
              onChange={(event) =>
                setDialogValue({
                  ...dialogValue,
                  url: event.target.value,
                })
              }
              label='url'
              variant='standard'
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose}>Cancel</Button>
            <Button type="submit" disabled={!dialogValue.name || !dialogValue.url}>Add</Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
};

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
}: {
  el: IContractEdge;
  setValue?: UseFormSetValue<FieldValues>;
}) => {
  const handleScriptChoice = useCallback(async () => {
    if (!setValue) {
      return;
    } else {
      setValue('solution', JSON.stringify(el), {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    }
  }, [el, setValue]);

  return (
    <MenuItem
      onClick={handleScriptChoice}
      sx={{
        display: 'flex',
        gap: '16px',
      }}
    >
      <Typography>{findTag(el, 'solutionName')}</Typography>
      <Typography sx={{ opacity: '0.5' }}>
        {findTag(el, 'solutionTransaction')}
        {` (Creator: ${displayShortTxOrAddr(el.node.owner.address as string)}`}
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
  data?: findByTagsAndOwnersQuery;
  error?: ApolloError;
  loading: boolean;
  hasNextPage: boolean;
  disabled?: boolean;
  setValue?: UseFormSetValue<FieldValues>;
  loadMore: () => void;
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
      loadMore();
    }
  };
  const hasNoData = useMemo(
    () => !error && !loading && data?.transactions?.edges?.length === 0,
    [error, loading, data],
  );
  const [ solutionsData, setSolutionsData ] = useState<IContractEdge[]>([]);

  const checkShouldLoadMore = (filtered: IContractEdge[]) => {
    const selectRowHeight = 36;
    const maxHeight = 144;
    if (filtered.length * selectRowHeight < maxHeight && data && data.transactions.pageInfo.hasNextPage) {
      // if there are not enough elements to show scroll & has next pºage, force load more
      loadMore();
    }
  };

  useEffect(() => {
    if (data && data?.transactions?.edges?.length > 0) {
      (async () => {
        const txs = [ ...data.transactions.edges ]; // mutable copy of txs
        const filtered = txs.reduce((acc, el) => {
          acc.push(el);
          // find previousVersionsTag
          const previousVersions= findTag(el, 'previousVersions');
          if (previousVersions) {
            const versionsArray: string[] = JSON.parse(previousVersions);
            // remove previous versions from accumulator array
            const newAcc = acc.filter((el) => !versionsArray.includes(el.node.id));
            return newAcc;
          }
  
          return acc;
        }, [] as findByTagsQuery['transactions']['edges']);
  
        const filteredCopy = [ ...filtered ];
        for (const tx of filteredCopy) {
          const deleteTags = [
            { name: TAG_NAMES.operationName, values: [ SOLUTION_DELETION ] },
            { name: TAG_NAMES.solutionTransaction, values: [ tx.node.id ] },
          ];
        
          const owners = [ MARKETPLACE_ADDRESS, tx.node.owner.address ];
        
          const data = await client.query({
            query: findByTagsAndOwnersDocument,
            variables: {
              tags: deleteTags, first: filteredCopy.length ,owners,
            }
          });
        
          if (data.data.transactions.edges.length > 0) {
            // remove scripts with cancellations
            filtered.splice(filtered.findIndex((el: IContractEdge) => el.node.id === tx.node.id), 1);
          }
        }
  
        setSolutionsData(filtered);
        checkShouldLoadMore(filtered);
      })();
    }
  }, [ data]);

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
      if (typeof selected !== 'string') {
        return '';
      }
      const title = findTag(JSON.parse(selected), 'solutionName');
      const mainText = findTag(JSON.parse(selected), 'solutionTransaction');
      const subText = JSON.parse(selected).node.owner.address;

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
    [],
  );

  return (
    <SelectControl
      name={name}
      control={control}
      rules={{ required: !disabled }}
      disabled={disabled}
      mat={{
        onClick: handleSelected,
        placeholder: 'Choose a Solution',
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
            {'Could not fetch available Solutions for the current address'}
          </Typography>
        </Box>
      )}

      {solutionsData.length > 0 &&
        solutionsData.map((el: IContractEdge) => (
          <ScriptOption key={el.node.id} el={el} setValue={setValue} />
        ))}

      {hasNoData && (
        <Box>
          <Typography>
            {'There are no Solutions created with the current address'}
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
      {showOutputConfig && (
        <SelectControl
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
      )}
    </Box>
  );
};

const UploadCurator = () => {
  const elementsPerPage = 5;
  const { handleSubmit, reset, control, setValue } = useForm({
    defaultValues: {
      name: '',
      output: 'text',
      outputConfiguration: 'none',
      description: '',
      notes: '',
      avatar: '',
      file: '',
      codeUrl: '',
      availableModels: [],
      solutionRequestId: 'none',
      solution: '',
      allow: {
        allowFiles: false,
        allowText: true,
      },
      rewardsEvmAddress: '',
    },
  } as FieldValues);
  const [ requests, setRequests ] = useState<RequestData[]>([]);
  const [ showUrl, setShowUrl ] = useState(false);
  const [, setMessage] = useState('');
  const [hasScriptsNextPage, setHasScriptsNextPage] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const { currentAddress } = useContext(WalletContext);
  const { nodeBalance, upload } = useContext(BundlrContext);
  const { setOpen: setFundOpen } = useContext(FundContext);
  const [currentTab, setCurrentTab] = useState<'create' | 'edit'>('create');

  const [fetchAvatar, { data: avatarData }] = useLazyQuery(GET_LATEST_MODEL_ATTACHMENTS);
  const [fetchNotes, { data: notesData }] = useLazyQuery(GET_LATEST_MODEL_ATTACHMENTS);

  const disabled = useMemo(
    () =>
      (!control._formState.isValid && control._formState.isDirty) || !currentAddress,
    [control._formState.isValid, control._formState.isDirty, currentAddress],
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
    data: solutionsData,
    loading: solutionsLoading,
    error: solutionsError,
    fetchMore: solutionsFetchMore,
  } = useQuery(findByTagsAndOwnersDocument, {
    variables: {
      tags: [
        { name: TAG_NAMES.protocolName, values: [ PROTOCOL_NAME ]}, // keep Fair Protocol in tags to keep retrocompatibility
        { name: TAG_NAMES.protocolVersion, values: [ PROTOCOL_VERSION ]},
        { name: TAG_NAMES.operationName, values: [ SOLUTION_CREATION ]},
        /*  { name: TAG_NAMES.modelTransaction, values: [ state.modelTransaction ]}, */
      ],
      first: elementsPerPage,
      owners: [ currentAddress ]
    },
    skip: !currentAddress,
    notifyOnNetworkStatusChange: true,
  });

  const {
    data: modelsData,
    loading: modelsLoading,
    error: modelsError,
    fetchMore: modelsFetchMore,
  } = useQuery(FIND_BY_TAGS, {
    variables: {
      tags: [
        { name: TAG_NAMES.protocolName, values: [OLD_PROTOCOL_NAME, PROTOCOL_NAME] },
        { name: TAG_NAMES.protocolVersion, values: [OLD_PROTOCOL_VERSION, PROTOCOL_VERSION ] },
        { name: TAG_NAMES.operationName, values: [ MODEL_CREATION ]},
        /* { name: TAG_NAMES.modelCategory, values: [ outputValue ] }, */
      ],
      first: 100
    },
    notifyOnNetworkStatusChange: true,
  });

  const { data: solutionRequestsData } = useQuery(IRYS_FIND_BY_TAGS, {
    variables: {
      tags: [
        { name: TAG_NAMES.protocolName, values: [PROTOCOL_NAME] },
        { name: TAG_NAMES.protocolVersion, values: [ PROTOCOL_VERSION ] },
        { name: TAG_NAMES.operationName, values: ['Request-Solution'] },
      ],
      first: 100
    },
    context: {
      clientName: 'irys'
    },
  });

  const solutionChanged = useWatch({ name: 'solution', control });
  const codeUrlValue = useWatch({ name: 'codeUrl', control });

  useEffect(() => {
    (async () => {
      const txs: { node: IrysTx}[] = solutionRequestsData?.transactions?.edges ?? [];

      const txsData: RequestData[] = [];
      for (const tx of txs) {
        const response = await fetch(`https://arweave.net/${tx.node.id}`);
        const json = await response.json();

        txsData.push({
          ...json,
          id: tx.node.id,
          owner: tx.node.address,
          timestamp: tx.node.tags.find((tag) => tag.name === TAG_NAMES.unixTime)?.value ?? '',
        } as RequestData);
      }

      setRequests(txsData);
    })();
  }, [solutionRequestsData]);

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

  useEffect(() => {
    if (solutionsData) {
      setHasScriptsNextPage(solutionsData?.transactions?.pageInfo?.hasNextPage || false);
    }
  }, [solutionsData]);

  useEffect(() => {
    if (solutionChanged) {
      const tx = JSON.parse(solutionChanged);
      const name = findTag(tx, 'solutionName') ?? '';
      const description = findTag(tx, 'description') ?? '';
      /* const notes = findTag(tx, '');
      const avatar = findTag(tx, 'avatar'); */
      const output = findTag(tx, 'output') ?? '';
      const outputConfiguration = findTag(tx, 'outputConfiguration') ?? '';

      setValue('name', name);
      setValue('description', description);
      setValue('output', output);
      setValue('outputConfiguration', outputConfiguration);
      setValue('rewardsEvmAddress', findTag(tx, 'rewardsEvmAddress') ?? '');
      setValue('solutionRequestId', findTag(tx, 'solutionRequestId') ?? 'none');
      setValue('availableModels', JSON.parse(findTag(tx, 'supportedModels') ?? '[]'));
      setValue('allow.allowFiles', findTag(tx, 'allowFiles') === 'true');
      setValue('allow.allowText', findTag(tx, 'allowText') === 'true');
      fetchAvatar({
        variables: {
          tags: [
            { name: TAG_NAMES.operationName, values: [MODEL_ATTACHMENT] },
            { name: TAG_NAMES.attachmentRole, values: [AVATAR_ATTACHMENT] },
            { name: TAG_NAMES.solutionTransaction, values: [tx.node.id] },
          ],
          owner: currentAddress,
        },
      });
      fetchNotes({
        variables: {
          tags: [
            { name: TAG_NAMES.operationName, values: [MODEL_ATTACHMENT] },
            { name: TAG_NAMES.attachmentRole, values: [NOTES_ATTACHMENT] },
            { name: TAG_NAMES.solutionTransaction, values: [tx.node.id] },
          ],
          owner: currentAddress,
        },
      });
      (async () => {
        const res = await getData(tx.node.id);
        if (res instanceof File) {
          setValue('file', res);
        } else {
          setValue('codeUrl', res);
        }
      })();
    }
  }, [ solutionChanged, currentAddress, setValue ]);

  useEffect(() => {
    const avatarTxId = avatarData?.transactions?.edges[0]?.node.id ?? '';

    if (avatarTxId) {
      setValue('avatar', avatarTxId);
    } else {
      setValue('avatar', '');
    }
  }, [avatarData, setValue]);

  useEffect(() => {
    const notesTxId = notesData?.transactions?.edges[0]?.node.id ?? '';

    if (notesTxId) {
      (async () => {
        const notesContent = (await getData(notesTxId)) as string;
        setValue('notes', notesContent);
      })();
    } else {
      setValue('notes', '');
    }
  }, [notesData, setValue]);

  const onSubmit = async (data: FieldValues) => {
    if (nodeBalance <= 0) {
      setFundOpen(true);
    } else {
      await handleFundFinished(data as CreateForm); // use default node
    }
  };

  const getCommonTags = (data: CreateForm) => {
    const commonTags = [];
    commonTags.push({ name: TAG_NAMES.protocolName, value: PROTOCOL_NAME });
    commonTags.push({ name: TAG_NAMES.protocolVersion, value: PROTOCOL_VERSION });
    commonTags.push({ name: TAG_NAMES.contentType, value: data.file ? data.file.type : 'text/url-list'});
    commonTags.push({ name: TAG_NAMES.solutionName, value: `${data.name}` });
    commonTags.push({ name: TAG_NAMES.output, value: data.output });
    commonTags.push({ name: TAG_NAMES.rewardsEvmAddress, value: data.rewardsEvmAddress });
    if (!!data.outputConfiguration && data.outputConfiguration !== 'none') {
      commonTags.push({ name: TAG_NAMES.outputConfiguration, value: data.outputConfiguration });
    }
    if (data.description) {
      commonTags.push({ name: TAG_NAMES.description, value: data.description });
    }
    commonTags.push({ name: TAG_NAMES.unixTime, value: (Date.now() / secondInMS).toString() });
    commonTags.push({ name: TAG_NAMES.allowFiles, value: `${data.allow.allowFiles}` });
    commonTags.push({ name: TAG_NAMES.allowText, value: `${data.allow.allowText}` });
    if (data.solutionRequestId !== 'none') {
      commonTags.push({ name: 'Solution-Request-Id', value: data.solutionRequestId });
    }
    commonTags.push({ name: 'Supported-Models', value: JSON.stringify(data.availableModels) });

    if (currentTab === 'edit') {
      const solutionData = JSON.parse(data.solution) as IContractEdge;
      const currentSolutionId = solutionData.node.id;
      commonTags.push({ name: TAG_NAMES.updateFor, value: currentSolutionId });
      if (findTag(solutionData, 'previousVersions')) {
        const prevVersions: string[] = JSON.parse(
          findTag(solutionData, 'previousVersions') as string,
        );
        prevVersions.push(currentSolutionId);
        commonTags.push({ name: TAG_NAMES.previousVersions, value: JSON.stringify(prevVersions) });
      } else {
        commonTags.push({
          name: TAG_NAMES.previousVersions,
          value: JSON.stringify([currentSolutionId]),
        });
      }
    }
    return commonTags;
  };

  const handleFundFinished = async (data: CreateForm) => {
    if (!data.file && !data.codeUrl) {
      enqueueSnackbar('No File Or Source code Url Provided', { variant: 'error' });
      return;
    }

    const kb = 1024;
    const maxBytes = 100;

    if (!!data.file && data.file.size < maxBytes * kb) {
      enqueueSnackbar('File Size is too large', { variant: 'error' });
      return;
    }

    const file = data.file;

    const commonTags = getCommonTags(data);
    // add extra tags for payment save
    const uploadTags = [...commonTags];
    uploadTags.push({ name: TAG_NAMES.operationName, value: 'Solution Creation' });
    addAssetTags(uploadTags, currentAddress);
    addLicenseTags(uploadTags, licenseControl._formValues, licenseRef.current?.value);

    try {
      /* const res = await bundlrUpload({
        ...commonUploadProps,
        tags: uploadTags,
        fileToUpload: file,
        successMessage: 'Script Uploaded Successfully',
      }); */
      const res = await upload(file || data.codeUrl, uploadTags);

      showSuccessSnackbar(res.id, 'Solution Uploaded Successfully');
      // register the model asset  in the warp contract
      const warp = await WarpFactory.forMainnet().use(new DeployPlugin());
      warp.register(res.id, 'node1');


      try {
        const usageFile = new File([data.notes], `${data.name}-usage.md`, {
          type: 'text/markdown',
        });
      
        // upload the file
        const usageNoteTags = [];
        usageNoteTags.push({ name: TAG_NAMES.protocolName, value: PROTOCOL_NAME });
        usageNoteTags.push({ name: TAG_NAMES.protocolVersion, value: PROTOCOL_VERSION });
        usageNoteTags.push({ name: TAG_NAMES.contentType, value: usageFile.type });
        usageNoteTags.push({ name: TAG_NAMES.operationName, value: MODEL_ATTACHMENT });
        usageNoteTags.push({ name: TAG_NAMES.attachmentName, value: usageFile.name });
        usageNoteTags.push({ name: TAG_NAMES.attachmentRole, value: NOTES_ATTACHMENT });
        usageNoteTags.push({ name: TAG_NAMES.unixTime, value: (Date.now() / secondInMS).toString() });
        usageNoteTags.push({ name: TAG_NAMES.solutionTransaction, value: res.id });
      
        await upload(usageFile, usageNoteTags);
        
        if (data.avatar) {
          // upload the file
          const imageTags = [];
          imageTags.push({ name: TAG_NAMES.protocolName, value: PROTOCOL_NAME });
          imageTags.push({ name: TAG_NAMES.protocolVersion, value: PROTOCOL_VERSION });
          imageTags.push({ name: TAG_NAMES.contentType, value: data.avatar.type });
          imageTags.push({ name: TAG_NAMES.operationName, value: MODEL_ATTACHMENT });
          imageTags.push({ name: TAG_NAMES.attachmentName, value: data.avatar.name });
          imageTags.push({ name: TAG_NAMES.attachmentRole, value: AVATAR_ATTACHMENT });
          imageTags.push({ name: TAG_NAMES.unixTime, value: (Date.now() / secondInMS).toString() });

          imageTags.push({ name: TAG_NAMES.solutionTransaction, value: res.id });
          
          await upload(data.avatar, imageTags);
        }
      } catch (error) {
        enqueueSnackbar('Error Uploading An Attchment', { variant: 'error' });
        // error uploading attachments
      }
      reset(); // reset form
    } catch (error) {
      setMessage('Upload error ');
      enqueueSnackbar('An Error Occured.', { variant: 'error' });
    }
  };

  const handleTabChange = useCallback(
    (_: SyntheticEvent, value: 'create' | 'edit') => {
      reset();
      setCurrentTab(value);
    },
    [setCurrentTab, reset],
  );

  const loadMore = () => {
    solutionsFetchMore({
      variables: {
        after:
          solutionsData && solutionsData.transactions.edges.length > 0
            ? solutionsData.transactions.edges[solutionsData.transactions.edges.length - 1].cursor
            : undefined,
      },
      updateQuery: (prev: findByTagsQuery, { fetchMoreResult }) => {
        if (!fetchMoreResult) {
          return prev;
        }

        return Object.assign({}, prev, {
          transactions: {
            edges: [...prev.transactions.edges, ...fetchMoreResult.transactions.edges],
            pageInfo: fetchMoreResult.transactions.pageInfo,
          },
        });
      },
    });
  };

  const getContent = () => {
    if (currentTab === 'create') {
      return (
        <>
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
          <Box padding={'0px 32px'}>
            <SelectControl
              name='solutionRequestId'
              control={control}
              defaultValue={'none'}
              mat={{
                sx: {
                  borderWidth: '1px',
                  borderColor: theme.palette.text.primary,
                  borderRadius: '16px',
                },
                placeholder: 'Link a Solution Request ID',
              }}
            >
              {requests.map((el: RequestData) => 
                <MenuItem key={el.id} value={el.id}>
                  {el.title}
                </MenuItem>
              )}
              <MenuItem value={'none'}>
                No Solution Request
              </MenuItem>
            </SelectControl>
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
            <SupportedModelsPick
              name={'availableModels'}
              control={control}
              data={modelsData}
              error={modelsError}
              loading={modelsLoading}
              loadMore={modelsFetchMore}
            />
          </Box>
          <OutputFields control={control} />
        </>
      );
    } else {
      return (
        <>
          <Box padding='0px 32px' display={'flex'} flexDirection={'column'} gap={'16px'}>
            <GenericSelect
              name='solution'
              control={control}
              data={solutionsData}
              error={solutionsError}
              loading={solutionsLoading}
              hasNextPage={hasScriptsNextPage}
              disabled={false}
              loadMore={loadMore}
              setValue={setValue}
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
              style={{ width: '100%', marginTop: 0 }}
            />
          </Box>
          <Box padding='0px 32px'>
            <SupportedModelsPick
              name={'availableModels'}
              control={control}
              data={modelsData}
              error={modelsError}
              loading={modelsLoading}
              loadMore={modelsFetchMore}
            />
          </Box>
        </>
      );
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
        <Box
          role='tabpanel'
          sx={{
            marginTop: '16px',
            paddingBottom: 0,
            gap: '32px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {getContent()}
          <Box padding='0px 32px'>
            <AllowGroupControl name={'allow'} control={control} />
          </Box>
          <Box padding='0px 32px'>
            <FormLabel>Usage Notes: *</FormLabel>
            <MarkdownControl props={{ control, name: 'notes', rules: { required: true } }} />
          </Box>
          <Box padding='0px 32px' mb={'8px'}>
            <FileControl name='file' control={control} rules={{ required: !codeUrlValue }} />
            {!showUrl && <Typography variant='caption' textAlign={'center'} display={'flex'} justifyContent={'center'}>{'You can Also'} <u style={{ cursor: 'pointer', paddingLeft: '2px' }} onClick={() => setShowUrl(true)}>{'provide a link to a code repository.'}</u></Typography>}
            {showUrl && <Box display={'flex'} width={'100%'} gap={'16px'}>
              <TextControl
                name='codeUrl'
                control={control}
                mat={{
                  label: 'Code Repository URL',
                  variant: 'outlined',
                  size: 'small',
                  sx: {
                    width: '100%',
                  }
                }}
              />
              <Button variant='text' onClick={() => setShowUrl(false)}>Cancel</Button>
            </Box>}
          </Box>
          <Box padding='0px 32px'>
            <TextControl
              name='rewardsEvmAddress'
              control={control}
              mat={{
                variant: 'outlined',
                label: 'Rewards Arbitrum Address',
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
          <AdvancedConfiguration
            licenseRef={licenseRef}
            licenseControl={licenseControl}
            resetLicenseForm={resetLicenseForm}
          />
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
              className={
                currentTab === 'create'
                  ? 'plausible-event-name=Submit+Script+Click'
                  : 'plausible-event-name=Update+Script+Click'
              }
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
      </Container>
    </Container>
  );
};

export default UploadCurator;
