import React, { useEffect } from 'react';
import { View, StyleSheet, StatusBar, Text, TouchableOpacity } from 'react-native';
import { Colors } from './src/constants/Colors';
import { useGameStore } from './src/store/useGameStore';
import { LoginScreen } from './src/screens/LoginScreen';
import { LobbyScreen } from './src/screens/LobbyScreen';
import { GameScreen } from './src/screens/GameScreen';
import { DepositScreen } from './src/screens/DepositScreen';
import { WithdrawScreen } from './src/screens/WithdrawScreen';
import { socketService } from './src/api/socketService';

export default function App() {
  const user = useGameStore((state) => state.user);
  const currentTable = useGameStore((state) => state.currentTable);
  const screen = useGameStore((state) => state.screen);
  const setScreen = useGameStore((state) => state.setScreen);
  const error = useGameStore((state) => state.error);
  const setError = useGameStore((state) => state.setError);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    return () => {
      socketService.disconnect();
    };
  }, []);

  const renderScreen = () => {
    if (!user) return <LoginScreen />;
    if (currentTable) return <GameScreen />;

    switch (screen) {
      case 'deposit':
        return <DepositScreen onBack={() => setScreen('lobby')} />;
      case 'withdraw':
        return <WithdrawScreen onBack={() => setScreen('lobby')} />;
      default:
        return <LobbyScreen />;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {renderScreen()}

      {error && (
        <TouchableOpacity style={styles.errorToast} onPress={() => setError(null)}>
          <Text style={styles.errorText}>{error}</Text>
        </TouchableOpacity>
      )}
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
    bottom: 50,
    left: 20,
    right: 20,
    backgroundColor: '#ef4444ee',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  errorText: {
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
  },
});
