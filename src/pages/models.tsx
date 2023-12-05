import { AVATAR_ATTACHMENT, DEFAULT_TAGS, MODEL_ATTACHMENT, MODEL_CREATION_PAYMENT, SCRIPT_INFERENCE_REQUEST, TAG_NAMES } from '@/constants';
import { WalletContext } from '@/context/wallet';
import { IEdge } from '@/interfaces/arweave';
import { FIND_BY_TAGS, GET_LATEST_MODEL_ATTACHMENTS } from '@/queries/graphql';
import { commonUpdateQuery, findTag } from '@/utils/common';
import { getBalances, initContract } from '@/utils/warp';
import { useQuery } from '@apollo/client';
import { Box, Button, Card, CardActions, CardContent, CardHeader, CardMedia, Grid, Typography } from '@mui/material';
import { CountResult } from '@permaweb/stampjs';
import _ from 'lodash';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import EditIcon from '@mui/icons-material/Edit';
import FairSDKWeb from '@fair-protocol/sdk/web';
import { useNavigate } from 'react-router-dom';

const CardImage = ({ txid }: { txid: string }) => {
  const [ imgSrc, setImgSrc ] = useState('');
  const { currentAddress } = useContext(WalletContext);

  const { data } = useQuery(GET_LATEST_MODEL_ATTACHMENTS, {
    variables: {
      tags: [
        ...DEFAULT_TAGS,
        { name: TAG_NAMES.operationName, values: [MODEL_ATTACHMENT] },
        { name: TAG_NAMES.attachmentRole, values: [AVATAR_ATTACHMENT] },
        { name: TAG_NAMES.modelTransaction, values: [ txid ] },
      ],
      owner: currentAddress,
    },
    skip: !currentAddress
  });

  useEffect(() => {
    if (data?.transactions?.edges[0]) {
      setImgSrc(`https://arweave.net/${data.transactions.edges[0].node.id}`);
    }
  }, [ data, setImgSrc ]);

  return <CardMedia
    sx={{
      width: '30%',
      height: '100%',
      border: '0.5px solid #6C6C6C',
      borderRadius: '8px'
    }}
    component='img'
    image={imgSrc}
  />;
};

interface StampsCounts {
  [txid: string]: CountResult;
}

const ModelCard = ({ tx, stampsCount }: { tx: IEdge, stampsCount: StampsCounts }) => {
  const [ nInferences, setNinferences ] = useState(0);
  const [ ownedPercentage, setOwnedPercentage ] = useState(0);
  const [ nStamps, setNStamps ] = useState(0);

  const txid = useMemo(() => findTag(tx, 'modelTransaction') as string, [ tx ]);

  const navigate = useNavigate();
  const { currentAddress } = useContext(WalletContext);
  const { data, fetchMore} = useQuery(FIND_BY_TAGS,  {
    variables: {
      tags: [
        ...DEFAULT_TAGS,
        { name: TAG_NAMES.operationName, values: [ SCRIPT_INFERENCE_REQUEST ]},
        { name: TAG_NAMES.modelTransaction, values: [ txid ] }
      ],
      first: 100,
    },
    skip: !txid
  });

  useEffect(() => {
    if (data && data.transactions.pageInfo.hasNextPage) {
      const txs = data.transactions.edges;
      fetchMore({
        variables: {
          after: txs[txs.length - 1].cursor
        },
        updateQuery: commonUpdateQuery        
      });
    } else if (data) {
      setNinferences(data.transactions.edges.length);
    }
  }, [ data ]);

  useEffect(() => {
    // ownership
    (async () => {
      if (txid && currentAddress) {
        const contract = initContract(txid);
        const balances = await getBalances(contract);

        const userBalance = balances[currentAddress];

        // calculate total balance
        const totalBalance = Object.keys(balances).reduce((acc, curr) => acc + Number(balances[curr]), 0);

        const userPercentage = Number(userBalance) /totalBalance * 100;
       setOwnedPercentage(userPercentage);
      }
    })();
  }, [ txid, currentAddress ]);

  useEffect(() => {
    if (!_.isEmpty(stampsCount)) {
      setNStamps((stampsCount as StampsCounts)[txid].total);
    }
  }, [ stampsCount, txid ]);

  const handleEditClick = useCallback(() => {
    localStorage.setItem('model', JSON.stringify(tx));
    navigate('/upload-creator');
  }, [ tx ]);

  return <Card sx={{ display: 'flex', padding: '16px', alignItems: 'center', height: '100%' }}>
    <CardImage txid={txid} />
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <CardHeader title={findTag(tx, 'modelName')} subheader={'Last Updated on ' + new Date(parseInt(findTag(tx, 'unixTime') as string) * 1000).toDateString()} sx={{ paddingTop: 0 }}/>
      <CardContent>
       <Box display={'flex'} gap={'8px'}>
          <Typography sx={{fontWeight: 500 }}>
            Total Inferences: 
          </Typography>
          <Typography>{nInferences}</Typography>
        </Box>
       <Box display={'flex'} gap={'8px'}>
          <Typography sx={{fontWeight: 500 }}>
            Owned Percentage:
          </Typography>
          <Typography>{ownedPercentage.toFixed(2)}%</Typography>
        </Box>
       <Box display={'flex'} gap={'8px'}>
          <Typography sx={{fontWeight: 500 }}>
            Stamps: 
          </Typography>
          <Typography>{nStamps}</Typography>
        </Box>
      </CardContent>
      <CardActions sx={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '8px', padding: 0 }}>
        <Button variant={'outlined'} endIcon={<EditIcon />} sx={{ display: 'flex', alignItems: 'center' }} onClick={handleEditClick}>
          <Typography>Edit Information</Typography>
        </Button>
        <Button variant={'outlined'}>
          <Typography>Trade on BazAR</Typography>
        </Button>
      </CardActions>
    </Box>
  </Card>;
};

const Models = () => {
  const [ stampsCount, setStampsCount ] = useState<StampsCounts>({});
  const [ models, setModels ] = useState<IEdge[]>([]);
  const { currentAddress, stampInstance } = useContext(WalletContext);
  const { data, /* loading, error  */} = useQuery(FIND_BY_TAGS,  {
    variables: {
      tags: [
        ...DEFAULT_TAGS,
        { name: TAG_NAMES.operationName, values: [ MODEL_CREATION_PAYMENT ]},
        { name: TAG_NAMES.sequencerOwner, values: [ currentAddress ]}
      ],
      first: 10,
    },
    skip: !currentAddress
  });

  useEffect(() => {
    if (data) {
      setModels(FairSDKWeb.utils.filterByUniqueModelTxId(data.transactions.edges));
    }
  }, [ data, stampInstance ]);

  useEffect(() => {
    (async () => {
      const txids = models.map((tx: IEdge) => findTag(tx, 'modelTransaction') as string);
      if (stampInstance && txids.length > 0) {
        setStampsCount(await stampInstance.counts(txids) as unknown as StampsCounts);
      }
    })();
  }, [ models, stampInstance ]);

  return <Grid container spacing={2} padding={'16px'}>{
    models.map((tx: IEdge) => <Grid item key={findTag(tx, 'modelTransaction')} xs={12} md={6} xl={4}>
      <ModelCard tx={tx} stampsCount={stampsCount}/>
    </Grid>)
  }</Grid>;
};

export default Models;