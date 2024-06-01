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

import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { Link, NavLink, useLocation } from 'react-router-dom';
import ProfileMenu from './profile-menu';
import {
  ChangeEvent,
  Dispatch,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
} from 'react';
import { Button, Icon, InputBase, Tooltip, useTheme } from '@mui/material';
import { WalletContext } from '@/context/wallet';
import { ChooseWalletContext } from '@/context/choose-wallet';
import { Timeout } from 'react-number-format/types/types';
import { defaultDecimalPlaces } from '@/constants';
import { usePollingEffect } from '@/hooks/usePollingEffect';
import Logo from './logo';
import NavigationMenu from './navigation-menu';

const CurrencyMenu = () => {
  const pollingTimeout = 10000;

  const { currentAddress, currentBalance, updateBalance } =
    useContext(WalletContext);

  const pollingFn = () => updateBalance();

  const [startPolling, stopPolling] = usePollingEffect(
    pollingFn,
    [currentAddress],
    pollingTimeout,
  );

  useEffect(() => {
    if (!currentAddress) {
      stopPolling();
    } else {
      // if address changes, restart polling
      startPolling();
    }
  }, [currentAddress]);

  return (
    <Box display={'flex'} alignItems={'center'}>
      <Typography sx={{ paddingRight: '6px', paddingLeft: '8px' }}>
        {currentBalance.toFixed(defaultDecimalPlaces)}
      </Typography>
      <img width='20px' height='20px' src='./arweave-logo-for-light.png' />
    </Box>
  );
};

const WalletState = () => {
  const theme = useTheme();
  const { currentAddress, isWalletVouched } = useContext(WalletContext);

  const { setOpen: connectWallet } = useContext(ChooseWalletContext);

  const handleConnect = useCallback(() => connectWallet(true), [connectWallet]);

  if (!currentAddress || currentAddress === '') {
    return (
      <>
        <Button
          variant='outlined'
          sx={{
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '17px',
            border: 'solid',
            borderColor: theme.palette.terciary.main,
            borderWidth: '0.5px',
            paddingTop: '11px',
            paddingBottom: '11px',
          }}
          onClick={handleConnect}
          className='plausible-event-name=Connect+Wallet+Click'
        >
          <Typography sx={{ lineHeight: '18.9px', fontSize: '14px' }}>Connect</Typography>
        </Button>
        <ProfileMenu />
      </>
    );
  }

  return (
    <>
      <Box
        sx={{
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 0,
          gap: '17px',
          border: 'solid',
          borderColor: theme.palette.terciary.main,
          borderWidth: '0.5px',
        }}
      >
        <Box display={'flex'}>
          <CurrencyMenu />
        </Box>
        <Box
          sx={{
            background: theme.palette.secondary.contrastText,
            borderRadius: '8px',
            padding: '7px 20px 7px 20px',
            alignItems: 'center',
          }}
          display={'flex'}
          gap={'8px'}
        >
          <Tooltip title={currentAddress} placement={'left-start'}>
            <Typography
              sx={{ color: theme.palette.text.primary, lineHeight: '20.25px', fontSize: '15px', textWrap: 'nowrap' }}
            >
              {currentAddress.slice(0, 6)}...{currentAddress.slice(-4)}
            </Typography>
          </Tooltip>
          {isWalletVouched && (
            <Tooltip title={'Wallet is Vouched'}>
              <img src='./vouch.svg' width={'15px'} height={'15px'} />
            </Tooltip>
          )}
        </Box>
        <ProfileMenu />
      </Box>
    </>
  );
};

const Navbar = ({
  setFilterValue,
  isScrolled,
}: {
  setFilterValue: Dispatch<SetStateAction<string>>;
  isScrolled: boolean;
}) => {
  const { pathname } = useLocation();
  const theme = useTheme();
  const extraIndex = 2; // number to add to zIndex to make sure it's above the drawer
  const zIndex = theme.zIndex.drawer + extraIndex; // add 2 to make sure it's above the drawer
  let keyTimeout: Timeout;
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    clearTimeout(keyTimeout);
    keyTimeout = setTimeout(() => {
      setFilterValue(event.target.value);
    }, 500);
  };

  const navbarLinkStyles = {
    fontWeight: 400,
    fontSize: '18px',
    lineHeight: '24px',
    display: { sm: 'none', md: 'flex' },
  };

  const appBarStyle = {
    zIndex,
    alignContent: 'center',
    padding: '10px 20px 10px 20px',
    ...(!isScrolled && { boxShadow: 'none' }),
  };
  const spaceBetween = 'space-between';

  return (
    <>
      <AppBar sx={appBarStyle} color='inherit'>
        <Toolbar sx={{ justifyContent: spaceBetween }}>
          <Box display={'flex'} flexDirection={'row'} alignItems={'center'}>
            <Link to='/'>
              <Logo />
            </Link>
            <Typography
              sx={{
                fontSize: '14px',
                mt: '-18px',
                ml: '8px',
                padding: '0px 8px',
                border: '0.5px solid',
                borderRadius: '8px',
              }}
            >
              EARLY
            </Typography>
          </Box>
          <Box sx={{ flexGrow: 1 }} display={{ sm: 'none', lg: 'flex' }}>
            {' '}
            {/* hide searchbar on small screens */}
            {pathname && pathname === '/' && (
              <>
                <Box
                  sx={{
                    borderRadius: '8px',
                    margin: '0 50px',
                    display: 'flex',
                    justifyContent: spaceBetween,
                    padding: '3px 20px 3px 50px',
                    alignItems: 'center',
                    border: 'solid',
                    borderColor: theme.palette.terciary.main,
                    borderWidth: '0.5px',
                    width: '100%',
                  }}
                >
                  <InputBase
                    sx={{
                      fontStyle: 'normal',
                      fontWeight: 400,
                      fontSize: '18px',
                      lineHeight: '16px',
                      width: '100%',
                    }}
                    onChange={handleChange}
                    placeholder='Search...'
                  />
                  <Icon
                    sx={{
                      height: '30px',
                    }}
                  >
                    <img src='./search-icon.svg'></img>
                  </Icon>
                </Box>
              </>
            )}
          </Box>
          <Box
            className={'navbar-right-content'}
            sx={{
              justifyContent: { sm: 'flex-end', md: 'center' },
              gap: { sm: '16px', md: '34px' },
              flexGrow: { sm: 1, md: 0 },
            }}
          >
            <Typography
              component={NavLink}
              to='/upload-curator'
              className='navbar-links'
              sx={navbarLinkStyles}
            >
              Solutions
            </Typography>
            <Typography component={NavLink} to='/' className='navbar-links' sx={navbarLinkStyles}>
              Operators
            </Typography>
            <Link to='/upload-creator' style={{ border: `0.5px solid ${theme.palette.terciary.main}`, borderRadius: '8px'  }}>
              <Typography padding={'9.5px 15px'} textTransform={'uppercase'} lineHeight={1.3} sx={{ textWrap: 'nowrap' }}>Store on Arweave</Typography>
            </Link>
            <NavigationMenu navStyles={navbarLinkStyles} />
            <WalletState />
          </Box>
        </Toolbar>
      </AppBar>
      <Toolbar />
    </>
  );
};

export default Navbar;
