import React from 'react';
import {TvApp} from '../shared/src/TvApp';
import {API_URL, TOKEN} from './config';

export default function App() {
  return <TvApp api={API_URL} token={TOKEN} />;
}
