/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('@pdftron/react-native-pdf', () => ({
  DocumentView: require('react-native').View,
  RNPdftron: {initialize: jest.fn()},
}));

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
