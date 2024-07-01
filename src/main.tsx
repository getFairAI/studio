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

import React from 'react';
import ReactDOM from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import Root from '@/root';
import '@/styles/main.css';
import ErrorDisplay from '@/pages/error-display';
import Operators from '@/pages/operators';
import Register from '@/pages/script/register';
import { getScriptAttachments } from '@/pages/script/script';
import UploadCreator from '@/pages/upload-creator';
import UploadCurator from '@/pages/upload-curator';
import Registrations from '@/pages/registrations';
import Terms from './pages/terms';
import PrivacyPolicy from './pages/privacy-policy';
import TermsAgreement from './guards/terms-agreement';

const router = createHashRouter([
  {
    path: '/',
    element: <Root />,
    errorElement: <ErrorDisplay />,
    children: [
      {
        path: '',
        element: (
          <TermsAgreement>
            <Operators />
          </TermsAgreement>
        ),
        children: [
          {
            path: 'register/:txid/',
            id: 'register',
            loader: getScriptAttachments,
            element: <Register />,
          },
        ],
      },
      {
        path: 'upload-creator',
        element: (
          <TermsAgreement>
            <UploadCreator />
          </TermsAgreement>
        ),
      },
      {
        path: 'upload-curator',
        element: (
          <TermsAgreement>
            <UploadCurator />
          </TermsAgreement>
        ),
      },
      {
        path: 'registrations',
        element: <Registrations />,
      },
      {
        path: 'terms',
        element: <Terms />,
      },
      {
        path: 'privacy-policy',
        element: <PrivacyPolicy />,
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
