import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform, Pressable, Keyboard } from 'react-native';
import { Colors } from '../constants/Colors';
import { Button } from '../components/Button';
import { ApiClient } from '../api/apiClient';
import { useGameStore } from '../store/useGameStore';
import { socketService } from '../api/socketService';
import { API_URL } from '../constants/Config';
import type { User } from '../types';

export const LoginScreen = () => {
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const setUser = useGameStore((state) => state.setUser);
    const setError = useGameStore((state) => state.setError);

    React.useEffect(() => {
        if (Platform.OS === 'web') {
            const savedUser = localStorage.getItem('rummy_user');
            if (savedUser) {
                try {
                    const user = JSON.parse(savedUser);
                    setUser(user);
                    if (user.token) {
                        ApiClient.setToken(user.token);
                        socketService.init(API_URL!, user.token);
                    }
                } catch (e) {
                    localStorage.removeItem('rummy_user');
                }
            }
        }
    }, []);

    const handleLogin = async () => {
        if (!name.trim()) {
            setError('Please enter your name');
            return;
        }

        setLoading(true);
        try {
            const data = await ApiClient.post<{ token: string, user: { userId: string, name: string } }>('/auth/guest-login', { name: name.trim() });
            console.log('Login successful:', data);

            if (!data.user || !data.user.name) {
                console.error('Invalid user data received:', data);
                setError('Login failed: Invalid server response');
                return;
            }

            const newUser: User = {
                userId: data.user.userId,
                name: data.user.name,
                token: data.token
            };

            if (Platform.OS === 'web') {
                localStorage.setItem('rummy_user', JSON.stringify(newUser));
            }

            ApiClient.setToken(data.token);
            socketService.init(API_URL!, data.token);
            setUser(newUser);
        } catch (err: any) {
            console.error('Login error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const content = (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'web' ? undefined : 'height'}
            style={styles.keyboardView}
        >
            <View style={styles.content}>
                <View style={styles.logoContainer}>
                    <View style={styles.logoBadge}>
                        <Text style={styles.logoIcon}>♠</Text>
                    </View>
                    <Text style={styles.title}>Rummy Live</Text>
                    <Text style={styles.subtitle}>Premium 13-Card Rummy Experience</Text>
                </View>

                <View style={styles.form}>
                    <Text style={styles.label}>Display Name</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Enter your name"
                        placeholderTextColor={Colors.textMuted}
                        value={name}
                        onChangeText={setName}
                        autoCapitalize="words"
                        autoCorrect={false}
                        autoFocus={Platform.OS === 'web'}
                    />
                    <Button
                        title="Enter Lobby"
                        onPress={handleLogin}
                        loading={loading}
                        style={styles.loginBtn}
                    />
                    <Text style={styles.disclaimer}>
                        By entering, you agree to our Terms and Fair Play Policy.
                    </Text>
                </View>
            </View>
        </KeyboardAvoidingView>
    );

    if (Platform.OS === 'web') {
        return <View style={styles.container}>{content}</View>;
    }

    return (
        <Pressable
            onPress={Keyboard.dismiss}
            style={styles.container}
            accessible={false}
        >
            {content}
        </Pressable>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    keyboardView: {
        flex: 1,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        padding: 24,
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: 48,
    },
    logoBadge: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    logoIcon: {
        fontSize: 40,
        color: '#fff',
    },
    title: {
        color: '#fff',
        fontSize: 32,
        fontWeight: 'bold',
    },
    subtitle: {
        color: Colors.textMuted,
        fontSize: 16,
        marginTop: 8,
    },
    form: {
        backgroundColor: Colors.cardBg,
        padding: 24,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    label: {
        color: Colors.textMuted,
        fontSize: 14,
        marginBottom: 8,
    },
    input: {
        backgroundColor: Colors.background,
        borderColor: Colors.border,
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
        color: '#fff',
        fontSize: 16,
        marginBottom: 20,
    },
    loginBtn: {
        height: 50,
    },
    disclaimer: {
        color: Colors.textMuted,
        fontSize: 12,
        textAlign: 'center',
        marginTop: 16,
    },
});
