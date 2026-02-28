import React, { useEffect } from 'react';
import { StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { socketService } from './src/api/socketService';
import { Colors } from './src/constants/Colors';
import { AviatorScreen } from './src/screens/AviatorScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { useAviatorStore } from './src/store/useAviatorStore';

export default function App() {
  const user = useAviatorStore((state) => state.user);
  const error = useAviatorStore((state) => state.error);
  const setError = useAviatorStore((state) => state.setError);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 4500);
    return () => clearTimeout(timer);
  }, [error, setError]);

  useEffect(() => {
    return () => {
      socketService.disconnect();
    };
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      {user ? <AviatorScreen /> : <LoginScreen />}

      {error ? (
        <TouchableOpacity style={styles.errorToast} onPress={() => setError(null)}>
          <Text style={styles.errorText}>{error}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  errorToast: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#f03a57',
    borderWidth: 1,
    borderColor: '#ff8da0',
  },
  errorText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 13,
  },
});

