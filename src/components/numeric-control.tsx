

import { TextField, TextFieldProps } from '@mui/material';
import { CSSProperties } from 'react';
import { useController, UseControllerProps } from 'react-hook-form';
import { NumericFormat, NumericFormatProps } from 'react-number-format';

type NumericControlProps = UseControllerProps & NumericFormatProps & { mat: TextFieldProps; style?: CSSProperties };

const NumericControl = (props: NumericControlProps) => {
  const { field, fieldState } = useController(props);

  const showError = () => {
    if (fieldState.invalid) {
      return 'This Field is Required';
    } else {
      return '';
    }
  };

  return (
    <NumericFormat
      customInput={TextField}
      allowNegative={false}
      decimalScale={0}
      isAllowed={props.isAllowed}
      disabled={props.mat.disabled}
      onChange={field.onChange} // send value to hook form
      onBlur={field.onBlur} // notify when input is touched/blur
      value={field.value}
      name={field.name} // send down the input name
      inputRef={field.ref} // send input ref, so we can focus on input when error appear
      {...props.mat}
      defaultValue={0}
      maxLength={3}
      type='text'
      style={props.style}
      error={fieldState.invalid}
      helperText={showError()}
    />
  );
};

export default NumericControl;
        