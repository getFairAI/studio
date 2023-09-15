import { ExpandMore, ChevronRight } from '@mui/icons-material';
import { Divider, Button, Slide, Box, Autocomplete, TextField, MenuItem } from '@mui/material';
import NumericControl from './numeric-control';
import SelectControl from './select-control';
import TextControl from './text-control';
import { useState, useMemo, useCallback, RefObject } from 'react';
import { FieldValues, useWatch, Control, UseFormReset } from 'react-hook-form';
import { NumberFormatValues } from 'react-number-format';


interface LicenseForm extends FieldValues {
  derivations?: 'With-Credit' | 'With-Indication' | 'With-License-Passthrough' | 'With-Revenue-Share',
  revenueShare?: number,
  commercialUse?: 'Allowed' | 'Allowed-With-Credit',
  licenseFeeInterval?: 'One-Time' | string,
  licenseFee?: number,
  currency?: 'AR' | '$U',
  expires?: number,
  paymentAddress?: string,
  paymentMode?: 'Random-Distribution' | 'Global-Distribution'
}

export const AdvancedConfiguration = ({ licenseRef, licenseControl, resetLicenseForm }: { licenseRef: RefObject<HTMLInputElement>,licenseControl: Control<LicenseForm, unknown>, resetLicenseForm: UseFormReset<LicenseForm>}) => {
  const licenseOptions = [
    'Universal Data License (UDL) Default Public Use',
    // 'Universal Data License (UDL) Restricted Access',
    'Universal Data License (UDL) Commercial - One Time Payment',
    'Universal Data License (UDL) Derivative Works - One Time Payment',
    'Universal Data License (UDL) Custom',
  ];
  const [inputValue, setInputValue] = useState('');
  const [ showAdvanced, setShowAdvanced ] = useState(false);
  const showLicenseConfig = useMemo(() => inputValue === licenseOptions[licenseOptions.length - 1], [ inputValue ]);
  const showLicenseFee = useMemo(() => inputValue === licenseOptions[1] || inputValue === licenseOptions[2], [ inputValue ]);

  const handleAdvancedClick = useCallback(() => {
    setShowAdvanced((previous) => !previous);
    resetLicenseForm();
    setInputValue('');
  }, [ setShowAdvanced ]);

  const isAllowed = useCallback((val: NumberFormatValues) => !val.floatValue || (val?.floatValue)?.toString().length <= 4, []);

  const isAllowedRevenue = useCallback((val: NumberFormatValues) => !val.floatValue || val?.floatValue <= 100, []);

  const derivationsValue = useWatch({ control: licenseControl, name: 'derivations' });
  
  const showRevenueShare = useMemo(() => derivationsValue === 'With-Revenue-Share', [ derivationsValue ]);

  return (<>
    <Divider textAlign='left' sx={{ ml: '24px', mr: '24px', mt: '-32px' }}>
      <Button
        variant='text'
        startIcon={showAdvanced ? <ExpandMore /> : <ChevronRight />}
        sx={{ borderRadius: '8px' }}
        disableRipple={true}
        onClick={handleAdvancedClick}
      >
        Advanced Configuration
      </Button>
    </Divider>
    <Slide direction="up" in={showAdvanced} mountOnEnter unmountOnExit>
      <Box padding='0px 32px' gap='16px' display={'flex'} flexDirection={'column'}>
        <Autocomplete
          freeSolo
          options={licenseOptions}
          renderInput={(params) => <TextField {...params} inputRef={licenseRef} label="License"  placeholder='Choose A license or add your own' />}
          onInputChange={(event, newInputValue) => {
            setInputValue(newInputValue);
          }}
        />
        {showLicenseFee && <Box display={'flex'} gap={'16px'}>
          <NumericControl name='licenseFee' control={licenseControl} mat={{ label: 'License Fee', placeholder: 'License Fee', sx: { flexGrow: 1 } }} isAllowed={isAllowed} />
          <SelectControl name='currency' control={licenseControl} mat={{ label: 'Currency', placeholder: 'Currency',  sx: { width: '25%' } }} defaultValue={'$U'}>
            <MenuItem value='AR'>AR</MenuItem>
            <MenuItem value='$U'>$U</MenuItem>
          </SelectControl>
        </Box>}
        {showLicenseConfig && (
          <Box display={'flex'} flexDirection={'column'} gap={'16px'}>
            <Box display={'flex'} gap={'16px'}>
              <SelectControl name='derivations' control={licenseControl} mat={{ label: 'Derivations', placeholder: 'Derivations' }}>
                <MenuItem value=''>Default</MenuItem>
                <MenuItem value='With-Credit'>With Credit</MenuItem>
                <MenuItem value='With-Indication'>With Indication</MenuItem>
                <MenuItem value='With-License-Passthrough'>With License Passthrough</MenuItem>
                <MenuItem value='With-Revenue-Share'>With Revenue Share</MenuItem>
              </SelectControl>
              { showRevenueShare && <NumericControl name='revenueShare' control={licenseControl} mat={{ label: 'Revenue Share (%)', placeholder: 'Revenue Share', sx: { width: '25%'} }} isAllowed={isAllowedRevenue} />}
            </Box>
            
            <Box display={'flex'} alignItems={'center'} justifyContent={'space-between'}>
              <Box width={'100%'} gap={'16px'} display={'flex'}>
                <SelectControl name='licenseFeeInterval' control={licenseControl} mat={{ label: 'License Fee Payment Interval', placeholder: 'License Fee Payment Interval',  sx: { width: '30%' } }}>
                  <MenuItem value=''>None</MenuItem>
                  <MenuItem value='Daily'>Daily</MenuItem>
                  <MenuItem value='Weekly'>Weekly</MenuItem>
                  <MenuItem value='Monthly'>Monthly</MenuItem>
                  <MenuItem value='Yearly'>Yearly</MenuItem>
                  <MenuItem value='One-Time'>One-Time</MenuItem>
                </SelectControl>
                <NumericControl name='licenseFee' control={licenseControl} mat={{ label: 'License Fee', placeholder: 'License Fee' }} isAllowed={isAllowed} />
              </Box>
              <SelectControl name='currency' control={licenseControl} mat={{ label: 'Currency', placeholder: 'Currency',  sx: { width: '25%' } }} defaultValue={'$U'}>
                <MenuItem value='AR'>AR</MenuItem>
                <MenuItem value='$U'>$U</MenuItem>
              </SelectControl>
            </Box>
            <Box display={'flex'} width={'100%'} gap={'16px'} >
              <SelectControl name='commercialUse' control={licenseControl} mat={{ label: 'Commercial Use', placeholder: 'Commercial Use',  sx: { flexGrow: 1 } }}>
                <MenuItem value=''>Default</MenuItem>
                <MenuItem value='Allowed'>Allowed</MenuItem>
                <MenuItem value='Allowed-With-Credit'>Allowed With Credit</MenuItem>
              </SelectControl>
              <NumericControl name='expires' control={licenseControl} mat={{ label: 'Expires (Years)', sx: { width: '20%', flexGrow: 0 }  }} isAllowed={isAllowed}/>
            </Box>
            
            <Box display={'flex'} gap={'16px'} width={'100%'}>
              <TextControl name='paymentAddress' control={licenseControl} mat={{ label: 'Payment Address', sx: { flexGrow: 1 } }}/>
              <SelectControl name='paymentMode' control={licenseControl} mat={{ label: 'Payment Mode', placeholder: 'Payment Mode',  sx: { width: '30%', flexGrow: 0 }  }}>
                <MenuItem value=''>Default</MenuItem>
                <MenuItem value='Random-Distribution'>Random Distribution</MenuItem>
                <MenuItem value='Global-Distribution'>Global Distribution</MenuItem>
              </SelectControl>
            </Box>
          </Box>
        )}
      </Box>
    </Slide>
  </>);
};