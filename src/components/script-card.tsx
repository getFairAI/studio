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
  AVATAR_ATTACHMENT,
  MODEL_ATTACHMENT,
  NET_ARWEAVE_URL,
  TAG_NAMES,
  secondInMS,
} from '@/constants';
import { IContractEdge } from '@/interfaces/arweave';
import { GET_LATEST_MODEL_ATTACHMENTS } from '@/queries/graphql';
import { ApolloQueryResult, useQuery } from '@apollo/client';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CardHeader,
  CardMedia,
  Container,
  Typography,
  useTheme,
} from '@mui/material';
import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReplayIcon from '@mui/icons-material/Replay';
import { commonUpdateQuery, findTag } from '@/utils/common';
import { toSvg } from 'jdenticon';
import FairSDKWeb from '@fair-protocol/sdk/web';

interface Element {
  name: string;
  txid: string;
  uploader: string;
  avgFee: string;
  totalOperators: number;
}

const ScriptError = ({
  handleRefetch,
}: {
  handleRefetch: () => Promise<ApolloQueryResult<unknown>>;
}) => {
  return (
    <Container>
      <Typography alignItems='center' display='flex' flexDirection='column'>
        Could not Fetch Registered Operators.
        <Button
          sx={{ width: 'fit-content' }}
          endIcon={<ReplayIcon />}
          onClick={handleRefetch as () => void}
          className='plausibe-event-name=Retry+Fetch+Operators'
        >
          Retry
        </Button>
      </Typography>
    </Container>
  );
};

const ScriptImage = ({
  imgUrl,
  loading,
  avatarLoading,
}: {
  imgUrl?: string;
  loading: boolean;
  avatarLoading: boolean;
}) => {
  const isLoading = useMemo(
    () => !imgUrl || loading || avatarLoading,
    [loading, avatarLoading, imgUrl],
  );

  if (isLoading) {
    return (
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '317px',
          height: '352px',
          background: 'linear-gradient(180deg, rgba(71, 71, 71, 0) 0%, rgba(1, 1, 1, 0) 188.85%)',
          // backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover' /* <------ */,
          backgroundPosition: 'center',
        }}
      />
    );
  } else {
    return (
      <CardMedia
        src={imgUrl}
        sx={{
          borderRadius: '16px',
          height: '100px',
          width: '100px',
          background: `linear-gradient(180deg, rgba(71, 71, 71, 0) 0%, rgba(1, 1, 1, 0) 188.85%), url(${imgUrl})`,
          backgroundPosition: 'center',
          backgroundSize: 'cover',
        }}
      />
    );
  }
};

const parseScriptData = (
  data: IContractEdge[],
  scriptTx: IContractEdge,
  setCardData: Dispatch<SetStateAction<Element | undefined>>,
  owner?: string,
) => {
  const uniqueOperators: IContractEdge[] = [];
  const registrations: IContractEdge[] = data;

  // filter registratiosn for same model (only keep latest one per operator)
  registrations.forEach((op: IContractEdge) =>
    uniqueOperators.filter(
      (unique) =>
        findTag(op, 'sequencerOwner') === findTag(unique, 'sequencerOwner') ||
        op.node.owner.address === unique.node.owner.address,
    ).length > 0
      ? undefined
      : uniqueOperators.push(op),
  );

  const opFees = uniqueOperators.map((op) => {
    const fee = findTag(op, 'operatorFee');
    if (fee) {
      return parseFloat(fee);
    } else {
      return 0;
    }
  });
  const average = (arr: number[]) => arr.reduce((p, c) => p + c, 0) / arr.length;
  let avgFee: string = (average(opFees) / FairSDKWeb.utils.U_DIVIDER).toString();

  if (Number.isNaN(avgFee)) {
    avgFee = 'Not enough Operators for Fee';
  }

  setCardData({
    avgFee,
    name: findTag(scriptTx, 'solutionName') ?? 'Name not Available',
    txid: findTag(scriptTx, 'solutionTransaction') ?? 'Transaction Not Available',
    uploader: owner ?? 'Uploader Not Available',
    totalOperators: uniqueOperators.length,
  });
};

const commonTextProps = {
  fontSize: '20px',
  lineHeight: '27px',
  display: 'flex',
  alignItems: 'center',
  textAlign: 'center',
  fontStyle: 'normal',
};
const headerTextProps = {
  fontWeight: 300,
  ...commonTextProps,
};

const ScriptCard = ({ scriptTx, index }: { scriptTx: IContractEdge; index: number }) => {
  const navigate = useNavigate();
  const [cardData, setCardData] = useState<Element>();
  const theme = useTheme();

  const owner = useMemo(
    () => scriptTx.node.owner.address,
    [scriptTx],
  );
  const scriptId = useMemo(
    () => scriptTx.node.id,
    [scriptTx],
  );
  const scriptName = useMemo(
    () => findTag(scriptTx, 'solutionName') ?? 'Name not Available',
    [scriptTx],
  );

  const previousVersionsTxIds = useMemo(
    () => {
      try {
        return JSON.parse(findTag(scriptTx, 'previousVersions') as string) as string[];
      } catch (err) {
        return [];
      }
    },
    [scriptTx],
  );

  const queryObject = FairSDKWeb.utils.getOperatorQueryForScript(
    scriptId,
    scriptName,
    owner,
  );
  const { data, loading, error, refetch, fetchMore } = useQuery(queryObject.query, {
    variables: queryObject.variables,
    notifyOnNetworkStatusChange: true,
  });

  const { data: avatarData, loading: avatarLoading } = useQuery(GET_LATEST_MODEL_ATTACHMENTS, {
    variables: {
      tags: [
        { name: TAG_NAMES.operationName, values: [MODEL_ATTACHMENT] },
        { name: TAG_NAMES.attachmentRole, values: [AVATAR_ATTACHMENT] },
        { name: TAG_NAMES.solutionTransaction, values: [ scriptId, ...previousVersionsTxIds ] },
      ],
      owner,
    },
    skip: !scriptId || !owner || !previousVersionsTxIds,
  });

  const imgUrl = useMemo(() => {
    const avatarTxId = avatarData?.transactions?.edges[0]?.node?.id;
    if (avatarTxId) {
      return `${NET_ARWEAVE_URL}/${avatarTxId}`;
    } else {
      const imgSize = 100;
      const img = toSvg(scriptId, imgSize);
      const svg = new Blob([img], { type: 'image/svg+xml' });
      return URL.createObjectURL(svg);
    }
  }, [avatarData, scriptId]);

  useEffect(() => {
    if (data?.transactions?.pageInfo.hasNextPage) {
      (async () =>
        fetchMore({
          variables: {
            after: data.transactions.edges[data.transactions.edges.length - 1].cursor,
          },
          updateQuery: commonUpdateQuery,
        }))();
    } else if (data?.transactions) {
      // use immediately invoked function to be able to call async operations in useEffect
      (async () => {
        const filtered = await FairSDKWeb.utils.operatorsFilter(data.transactions.edges);
        parseScriptData(filtered, scriptTx, setCardData, owner);
      })();
    } else {
      // do nothing
    }
  }, [data]); // data changes

  const handleCardClick = useCallback(() => {
    navigate(`/register/${encodeURIComponent(scriptId ?? 'error')}`, {
      state: scriptTx,
    });
  }, [scriptId, scriptTx, navigate]);

  const getTimePassed = () => {
    const timestamp = findTag(scriptTx, 'unixTime');
    if (!timestamp) {
      return 'Pending';
    }
    const currentTimestamp = Date.now();

    const dateA = parseInt(timestamp, 10) * secondInMS;
    const dateB = currentTimestamp;

    const timeDiff = dateB - dateA;

    const secondsInMinute = 60; // same as minutes in hour
    const hoursInDay = 24;
    const daysInWeek = 7;
    const daysInMonth = 30; // round to 30 days, ignore odd months
    const daysInYear = 365; // rounded odd years
    // 1 day = 1000 * 60 * 60
    const day = secondInMS * secondsInMinute * secondsInMinute * hoursInDay;

    const nDaysDiff = Math.round(timeDiff / day);

    if (nDaysDiff <= 0) {
      return 'Today';
    } else if (nDaysDiff > 0 && nDaysDiff < daysInWeek) {
      return `${nDaysDiff} Day(s) ago`;
    } else if (nDaysDiff > daysInWeek && nDaysDiff <= daysInMonth) {
      const nWeeks = Math.round(nDaysDiff / daysInWeek);
      return `${nWeeks} Week(s) Ago`;
    } else if (nDaysDiff > daysInMonth && nDaysDiff <= daysInYear) {
      const nMonths = Math.round(nDaysDiff / daysInMonth);
      return `${nMonths} Month(s) Ago`;
    } else {
      const nYears = Math.round(nDaysDiff / daysInYear);
      return `${nYears} Year(s) ago`;
    }
  };

  const handleRefetch = useCallback(async () => refetch(), [refetch]);

  if (error) {
    return <ScriptError handleRefetch={handleRefetch} />;
  }

  return (
    <Card
      sx={{
        background:
          'linear-gradient(177deg, rgba(118, 118, 118, 0.1) 2.17%, rgba(1, 1, 1, 0) 60%);',
        borderRadius: '10px',
        boxShadow: 'none',
        '&:hover': {
          boxShadow: `0px 2px 24px -1px ${theme.palette.primary.main}, 0px 2px 1px 0px ${theme.palette.primary.main}, 0px 2px 7px 0px ${theme.palette.primary.main}`,
          opacity: 1,
        },
      }}
    >
      <CardActionArea
        sx={{
          width: '100%',
          height: '140px',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '30px',
        }}
        onClick={handleCardClick}
        className={`plausible-event-name=ScriptCard+Click plausible-event-scriptId=${scriptId}`}
      >
        <CardHeader
          title={index + 1}
          sx={{
            fontWeight: 600,
            ...commonTextProps,
          }}
        />
        <ScriptImage imgUrl={imgUrl} loading={loading} avatarLoading={avatarLoading} />
        <CardContent>
          <Typography
            sx={{
              fontWeight: 700,
              ...commonTextProps,
            }}
          >
            {findTag(scriptTx, 'solutionName') ?? 'Untitled'}
          </Typography>
        </CardContent>
        <Box flexGrow={1}></Box>
        <CardContent
          sx={{
            display: 'flex',
            gap: '30px',
          }}
        >
          <Box display={'flex'} flexDirection='column'>
            <Typography sx={headerTextProps}>{cardData?.totalOperators}</Typography>
          </Box>
          <Box display={'flex'} flexDirection='column'>
            <Typography sx={headerTextProps}>{cardData?.avgFee}</Typography>
          </Box>
          <Box display={'flex'} flexDirection='column'>
            <Typography sx={headerTextProps}>11k</Typography>
          </Box>
          <Box display={'flex'} flexDirection='column'>
            <Typography sx={headerTextProps}>12 Stamps</Typography>
          </Box>
          <Box display={'flex'} flexDirection='column'>
            <Typography sx={headerTextProps}>{getTimePassed()}</Typography>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
};

export default ScriptCard;
