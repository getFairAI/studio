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

import { IContractEdge } from '@/interfaces/arweave';
import { findTag, genLoadingArray } from '@/utils/common';
import { NetworkStatus, useQuery } from '@apollo/client';
import {
  Container,
  Box,
  Stack,
  Card,
  CardActionArea,
  Typography,
  Button,
  Skeleton,
  Select,
  MenuItem,
  useTheme,
} from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import ReplayIcon from '@mui/icons-material/Replay';
import ScriptCard from '@/components/script-card';
import useOnScreen from '@/hooks/useOnScreen';
import { Outlet } from 'react-router-dom';
import _ from 'lodash';
import {
  MARKETPLACE_ADDRESS,
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  SOLUTION_CREATION,
  SOLUTION_DELETION,
  TAG_NAMES,
} from '@/constants';
import { findByTagsAndOwnersDocument, findByTagsDocument, findByTagsQuery } from '@fairai/evm-sdk';
import { client } from '@/utils/apollo';

const ListLoadingCard = () => {
  return (
    <Card
      sx={{
        flexGrow: 0,
        width: '100%',
        height: '140px',
      }}
      raised={true}
    >
      <CardActionArea>
        <Skeleton
          sx={{
            transform: 'none',
            width: '100%',
            height: '140px',
            borderRadius: '8px',
          }}
          animation='wave'
        />
      </CardActionArea>
    </Card>
  );
};

const Operators = () => {
  const [txs, setTxs] = useState<IContractEdge[]>([]);
  const [filtering, setFiltering] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const target = useRef<HTMLDivElement>(null);
  const isOnScreen = useOnScreen(target);
  const elementsPerPage = 5;
  const [hightlightTop, setHighLightTop] = useState(false);
  const theme = useTheme();
  const mockArray = genLoadingArray(elementsPerPage);
  const { data, previousData, loading, error, refetch, fetchMore, networkStatus } = useQuery(
    findByTagsDocument,
    {
      variables: {
        tags: [
          { name: TAG_NAMES.protocolName, values: [PROTOCOL_NAME] }, // keep Fair Protocol in tags to keep retrocompatibility
          { name: TAG_NAMES.protocolVersion, values: [PROTOCOL_VERSION] },
          { name: TAG_NAMES.operationName, values: [SOLUTION_CREATION] },
          /*  { name: TAG_NAMES.modelTransaction, values: [ state.modelTransaction ]}, */
        ],
        first: 10,
      },
      /* skip: !model, */
    },
  );
  const loadingOrFiltering = useMemo(() => loading || filtering, [loading, filtering]);

  useEffect(() => {
    if (isOnScreen && hasNextPage) {
      const allTxs = data?.transactions?.edges || [];
      const fetchNextCursor = allTxs && allTxs.length > 0 ? allTxs[allTxs.length - 1].cursor : null;
      (async () =>
        fetchMore({
          variables: {
            after: fetchNextCursor,
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
        }))();
    }
  }, [isOnScreen, hasNextPage]);

  /**
   * @description Effect that runs on data changes;
   * it is responsible to set the nextPage status and to update current loaded transactionsm
   * filtering correct payments
   */
  useEffect(() => {
    if (networkStatus === NetworkStatus.loading) {
      setFiltering(true);
    }
    // check has paid correct registration fee
    if (data && networkStatus === NetworkStatus.ready && !_.isEqual(data, previousData)) {
      (async () => {
        const txs = [...data.transactions.edges]; // mutable copy of txs
        let allPreviousVersionsTxs: string[] = [];
        const filtered = txs.reduce((acc, el) => {
          acc.push(el);
          // find previousVersionsTag
          const previousVersions = findTag(el, 'previousVersions');
          if (previousVersions) {
            allPreviousVersionsTxs = allPreviousVersionsTxs.concat(...JSON.parse(previousVersions));
            // remove previous versions from accumulator array
          }
          const newAcc = acc.filter((el) => !allPreviousVersionsTxs.includes(el.node.id));

          return newAcc;
        }, [] as findByTagsQuery['transactions']['edges']);

        const filteredCopy = [...filtered];
        for (const tx of filteredCopy) {
          const deleteTags = [
            { name: TAG_NAMES.operationName, values: [SOLUTION_DELETION] },
            { name: TAG_NAMES.solutionTransaction, values: [tx.node.id] },
          ];

          const owners = [MARKETPLACE_ADDRESS, tx.node.owner.address];

          const data = await client.query({
            query: findByTagsAndOwnersDocument,
            variables: {
              tags: deleteTags,
              first: filteredCopy.length,
              owners,
            },
          });

          if (data.data.transactions.edges.length > 0) {
            // remove scripts with cancellations
            filtered.splice(
              filtered.findIndex((el: IContractEdge) => el.node.id === tx.node.id),
              1,
            );
          }
        }

        setHasNextPage(data.transactions.pageInfo.hasNextPage);
        setFiltering(false);
        setTxs(filtered);
      })();
    }
  }, [data]);

  const handleHighlight = (value: boolean) => setHighLightTop(value);

  return (
    <>
      <Container
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-around',
          alignContent: 'space-around',
          '@media all': {
            maxWidth: '100%',
          },
        }}
      >
        <Typography
          sx={{
            fontStyle: 'normal',
            fontWeight: 300,
            fontSize: '30px',
            lineHeight: '41px',
            padding: '16px',
            /* identical to box height */
            // background: 'linear-gradient(101.22deg, rgba(14, 255, 168, 0.58) 30.84%, #9747FF 55.47%, rgba(84, 81, 228, 0) 78.13%), linear-gradient(0deg, #FFFFFF, #FFFFFF)',
          }}
        >
          Choose a Script to Start Operating
        </Typography>
        <Box className={'filter-box'} sx={{ display: 'flex' }}>
          <Box display={'flex'} flexDirection={'column'}>
            <Box display='flex' gap={'50px'} width={'100%'}>
              <Typography
                sx={{
                  fontStyle: 'normal',
                  fontWeight: 500,
                  fontSize: '30px',
                  fontHeight: '41px',
                  opacity: !hightlightTop ? 1 : 0.5,
                }}
                className='plausible-event-name=Trending+Click'
                onClick={() => handleHighlight(false)}
              >
                Trending
              </Typography>
              <Typography
                sx={{
                  fontStyle: 'normal',
                  fontWeight: 500,
                  fontSize: '30px',
                  fontHeight: '41px',
                  opacity: hightlightTop ? 1 : 0.5,
                }}
                onClick={() => handleHighlight(true)}
                className='plausible-event-name=Top+Click'
              >
                Top
              </Typography>
              <Box flexGrow={1} />
            </Box>
            <Box display={'flex'} position='relative'>
              <Box
                height={'6px'}
                sx={{
                  position: 'absolute',
                  width: hightlightTop ? '55px' : '119px',
                  left: hightlightTop ? '166px' : 0,
                  background: theme.palette.primary.main,
                  borderRadius: '8px',
                }}
              />
            </Box>
          </Box>
          <Box flexGrow={1} />
          <Box display='flex' gap={'50px'}>
            <Select
              sx={{
                border: '2px solid transparent',
                textTransform: 'none',
                background: `linear-gradient(${theme.palette.background.default}, ${theme.palette.background.default}) padding-box,linear-gradient(170.66deg, ${theme.palette.primary.main} -38.15%, ${theme.palette.primary.main} 30.33%, rgba(84, 81, 228, 0) 93.33%) border-box`,
                '& .MuiOutlinedInput-notchedOutline': {
                  borderWidth: '0 !important', // force borderWidth 0 on focus
                },
                '& .MuiSelect-select': {
                  padding: '0px 15px',
                },
                '& .MuiSelect-icon': {
                  color: theme.palette.primary.main,
                },
              }}
              value={'24h'}
            >
              <MenuItem value={'24h'} className='plausible-event-name=24H+Click'>
                <Typography
                  sx={{
                    fontStyle: 'normal',
                    fontWeight: 600,
                    fontSize: '20px',
                    lineHeight: '27px',
                    textAlign: 'center',
                    color: theme.palette.primary.main,
                  }}
                >
                  24H
                </Typography>
              </MenuItem>
              <MenuItem value={'week'} className='plausible-event-name=Week+Click'>
                <Typography>1 Week</Typography>
              </MenuItem>
            </Select>
            <Button
              sx={{
                padding: '5px 15px',
                border: '2px solid transparent',
                textTransform: 'none',
                background: `linear-gradient(${theme.palette.background.default}, ${theme.palette.background.default}) padding-box,linear-gradient(170.66deg, ${theme.palette.primary.main} -38.15%, ${theme.palette.primary.main} 30.33%, rgba(84, 81, 228, 0) 93.33%) border-box`,
              }}
              className='plausible-event-name=View+All+Click'
            >
              <Typography
                sx={{
                  fontStyle: 'normal',
                  fontWeight: 600,
                  fontSize: '20px',
                  lineHeight: '27px',
                  textAlign: 'center',
                }}
              >
                View All
              </Typography>
            </Button>
          </Box>
        </Box>
        <Box>
          <Box
            display={'flex'}
            justifyContent={'flex-start'}
            flexDirection={'row-reverse'}
            gap='30px'
            margin={'16px'}
          >
            <Typography
              sx={{
                fontStyle: 'normal',
                fontWeight: 700,
                fontSize: '20px',
                lineHeight: '27px',
                display: 'flex',
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              Last updated
            </Typography>
            <Typography
              sx={{
                fontStyle: 'normal',
                fontWeight: 700,
                fontSize: '20px',
                lineHeight: '27px',
                display: 'flex',
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              Rating
            </Typography>
            <Typography
              sx={{
                fontStyle: 'normal',
                fontWeight: 700,
                fontSize: '20px',
                lineHeight: '27px',
                display: 'flex',
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              Usage
            </Typography>
            <Typography
              sx={{
                fontStyle: 'normal',
                fontWeight: 700,
                fontSize: '20px',
                lineHeight: '27px',
                display: 'flex',
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              Avg. Operators Fee
            </Typography>
            <Typography
              sx={{
                fontStyle: 'normal',
                fontWeight: 700,
                fontSize: '20px',
                lineHeight: '27px',
                display: 'flex',
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              Current # of Operators
            </Typography>
          </Box>
          <Stack spacing={4} sx={{ margin: '16px' }}>
            {error ? (
              <Container>
                <Typography alignItems='center' display='flex' flexDirection='column'>
                  Could not Fetch Available Models.
                  <Button
                    sx={{ width: 'fit-content' }}
                    endIcon={<ReplayIcon />}
                    onClick={() => refetch()}
                    className='plausible-event-name=Retry+Models+Click'
                  >
                    Retry
                  </Button>
                </Typography>
              </Container>
            ) : (
              txs.map((el, idx) => <ScriptCard scriptTx={el} key={el.node.id} index={idx} />)
            )}
            {loadingOrFiltering && mockArray.map((val) => <ListLoadingCard key={val} />)}
          </Stack>
          <Box ref={target} sx={{ paddingBottom: '16px' }}></Box>
        </Box>
      </Container>
      <Outlet />
    </>
  );
};

export default Operators;
