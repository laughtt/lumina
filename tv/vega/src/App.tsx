import React from 'react';
import {TvApp} from '../../shared/src/TvApp';
import {API_URL, TOKEN} from './config';

export const App = () => <TvApp api={API_URL} token={TOKEN} />;
