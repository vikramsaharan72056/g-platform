import { Platform } from 'react-native';

export const API_URL = Platform.select({
    android: 'http://10.0.2.2:3400',
    ios: 'http://localhost:3400',
    default: 'http://localhost:3400',
});
