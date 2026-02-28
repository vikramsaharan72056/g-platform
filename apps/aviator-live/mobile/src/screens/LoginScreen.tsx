import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ApiClient } from '../api/apiClient';
import { socketService } from '../api/socketService';
import { Button } from '../components/Button';
import { Colors } from '../constants/Colors';
import { API_URL } from '../constants/Config';
import { useAviatorStore } from '../store/useAviatorStore';
import type { User } from '../types';

const STORAGE_KEY = 'aviator_user';

export const LoginScreen = () => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const setUser = useAviatorStore((state) => state.setUser);
  const setError = useAviatorStore((state) => state.setError);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const saved = JSON.parse(raw) as User;
      if (!saved?.token) return;
      ApiClient.setToken(saved.token);
      socketService.init(API_URL, saved.token);
      setUser(saved);
      setName(saved.name);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [setUser]);

  const handleLogin = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter your display name');
      return;
    }

    setLoading(true);
    try {
      let rememberedId: string | undefined;
      if (Platform.OS === 'web') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<User>;
          rememberedId = saved.userId;
        }
      }

      const data = await ApiClient.post<{
        token: string;
        user: {
          userId: string;
          name: string;
          role: 'PLAYER' | 'ADMIN';
          balance: number;
        };
      }>('/auth/guest-login', { name: trimmed, userId: rememberedId });

      const user: User = {
        userId: data.user.userId,
        name: data.user.name,
        role: data.user.role,
        token: data.token,
        balance: data.user.balance,
      };

      ApiClient.setToken(user.token);
      socketService.init(API_URL, user.token);
      setUser(user);

      if (Platform.OS === 'web') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      }
    } catch (error: any) {
      setError(error?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <View style={styles.hero}>
          <Text style={styles.logo}>Aviator</Text>
          <Text style={styles.subtitle}>Real-time crash game</Text>
        </View>

        <Pressable style={styles.card}>
          <Text style={styles.label}>Display Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoCorrect={false}
            placeholder="Enter your name"
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
          />
          <Button title="Enter Aviator" onPress={handleLogin} loading={loading} />
        </Pressable>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  keyboard: {
    width: '100%',
  },
  hero: {
    alignItems: 'center',
    marginBottom: 26,
  },
  logo: {
    color: Colors.accent,
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  subtitle: {
    color: Colors.textMuted,
    marginTop: 8,
    fontSize: 14,
  },
  card: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  label: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    backgroundColor: Colors.background,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 12,
    color: Colors.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
});
