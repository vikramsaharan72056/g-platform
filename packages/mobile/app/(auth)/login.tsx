import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    StatusBar,
} from 'react-native';
import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../../src/stores/authStore';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login, isLoading, error, clearError } = useAuthStore();

    const handleLogin = async () => {
        if (!email.trim() || !password.trim()) return;
        await login(email.trim(), password);
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <LinearGradient
                colors={['#0F0F23', '#1A1A2E', '#16213E']}
                style={styles.gradient}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.content}
                >
                    {/* Logo */}
                    <View style={styles.logoContainer}>
                        <Text style={styles.logoIcon}>🎰</Text>
                        <Text style={styles.logoText}>ABCRummy</Text>
                        <Text style={styles.tagline}>Play. Win. Repeat.</Text>
                    </View>

                    {/* Form */}
                    <View style={styles.form}>
                        {error && (
                            <View style={styles.errorBox}>
                                <Text style={styles.errorText}>{error}</Text>
                            </View>
                        )}

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Email</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Enter your email"
                                placeholderTextColor="#6B7280"
                                value={email}
                                onChangeText={(t) => { setEmail(t); clearError(); }}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Password</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Enter your password"
                                placeholderTextColor="#6B7280"
                                value={password}
                                onChangeText={(t) => { setPassword(t); clearError(); }}
                                secureTextEntry
                            />
                        </View>

                        <TouchableOpacity
                            style={[styles.button, isLoading && styles.buttonDisabled]}
                            onPress={handleLogin}
                            disabled={isLoading}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={['#6C5CE7', '#A29BFE']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.buttonGradient}
                            >
                                {isLoading ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <Text style={styles.buttonText}>Sign In</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>

                        <View style={styles.footer}>
                            <Text style={styles.footerText}>Don't have an account? </Text>
                            <Link href="/(auth)/register" asChild>
                                <TouchableOpacity>
                                    <Text style={styles.linkText}>Sign Up</Text>
                                </TouchableOpacity>
                            </Link>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </LinearGradient>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    gradient: { flex: 1 },
    content: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
    logoContainer: { alignItems: 'center', marginBottom: 48 },
    logoIcon: { fontSize: 56, marginBottom: 8 },
    logoText: {
        fontSize: 36,
        fontWeight: '800',
        color: '#A29BFE',
        letterSpacing: 2,
    },
    tagline: {
        fontSize: 14,
        color: '#94A3B8',
        marginTop: 4,
        letterSpacing: 3,
        textTransform: 'uppercase',
    },
    form: { gap: 16 },
    errorBox: {
        backgroundColor: 'rgba(239,68,68,0.15)',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.3)',
    },
    errorText: { color: '#F87171', fontSize: 13, textAlign: 'center' },
    inputGroup: { gap: 6 },
    label: { color: '#94A3B8', fontSize: 13, fontWeight: '600', marginLeft: 4 },
    input: {
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14,
        padding: 16,
        fontSize: 16,
        color: '#F1F5F9',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    button: { marginTop: 8, borderRadius: 14, overflow: 'hidden' },
    buttonDisabled: { opacity: 0.7 },
    buttonGradient: {
        paddingVertical: 16,
        alignItems: 'center',
        borderRadius: 14,
    },
    buttonText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
    footerText: { color: '#94A3B8', fontSize: 14 },
    linkText: { color: '#A29BFE', fontSize: 14, fontWeight: '700' },
});
