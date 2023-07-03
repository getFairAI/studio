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

import { secondInMS } from '@/constants';
import { Button, ButtonProps } from '@mui/material';
import { debounce } from 'lodash';
import { MouseEventHandler } from 'react';

interface DebounceButtonProps extends ButtonProps {
  onClick: MouseEventHandler<HTMLButtonElement>;
}

const DebounceButton = (props: DebounceButtonProps) => {
  const { onClick, children, ...matProps } = props;

  const handleClick = debounce(onClick, secondInMS);

  return (
    <Button {...matProps} onClick={handleClick}>
      {children}
    </Button>
  );
};

export default DebounceButton;
