import { Dimensions } from 'react-native';

export const colors = {
  bg: '#151515',
  panel: '#202020',
  panel2: '#2a2926',
  line: '#3c3a34',
  text: '#f2f0e9',
  muted: '#a8a39a',
  lime: '#c8ff3d',
  coral: '#ff6b4a',
  amber: '#ffb84a',
  green: '#46d989',
  danger: '#ff4e68',
};

export const { width: deviceWidth, height: deviceHeight } = Dimensions.get('window');
export const narrowPhone = deviceWidth <= 390;
export const compactPhone = deviceHeight <= 844;
export const roomyPhone = deviceHeight >= 900;
export const unit = narrowPhone ? 0.9 : compactPhone ? 0.95 : 1;
export const topSafe = deviceHeight >= 812 ? 48 : 24;

export function size(value: number) {
  return Math.round(value * unit);
}
