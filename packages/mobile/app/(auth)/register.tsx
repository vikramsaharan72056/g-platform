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
    ScrollView,
    StatusBar,
} from 'react-native';
import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../../src/stores/authStore';

export default function RegisterScreen() {
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const { register, isLoading, error, clearError } = useAuthStore();

    const handleRegister = async () => {
        if (!displayName.trim() || !email.trim() || !password.trim()) return;
        if (password !== confirmPassword) {
            useAuthStore.setState({ error: 'Passwords do not match' });
            return;
        }
        await register({
            displayName: displayName.trim(),
            email: email.trim(),
            password,
            phone: phone.trim() || undefined,
        });
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
                    style={styles.keyboardView}
                >
                    <ScrollView
                        contentContainerStyle={styles.content}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Header */}
                        <View style={styles.header}>
                            <Text style={styles.logoIcon}>🎰</Text>
                            <Text style={styles.title}>Create Account</Text>
                            <Text style={styles.subtitle}>Join ABCRummy and start winning</Text>
                        </View>

                        {/* Form */}
                        <View style={styles.form}>
                            {error && (
                                <View style={styles.errorBox}>
                                    <Text style={styles.errorText}>{error}</Text>
                                </View>
                            )}

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Display Name</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Choose a display name"
                                    placeholderTextColor="#6B7280"
                                    value={displayName}
                                    onChangeText={(t) => { setDisplayName(t); clearError(); }}
                                    autoCapitalize="none"
                                />
                            </View>

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
                                />
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Phone (Optional)</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="+91 XXXXX XXXXX"
                                    placeholderTextColor="#6B7280"
                                    value={phone}
                                    onChangeText={setPhone}
                                    keyboardType="phone-pad"
                                />
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Password</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Min 8 chars, 1 upper, 1 number, 1 special"
                                    placeholderTextColor="#6B7280"
                                    value={password}
                                    onChangeText={(t) => { setPassword(t); clearError(); }}
                                    secureTextEntry
                                />
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Confirm Password</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Re-enter your password"
                                    placeholderTextColor="#6B7280"
                                    value={confirmPassword}
                                    onChangeText={(t) => { setConfirmPassword(t); clearError(); }}
                                    secureTextEntry
                                />
                            </View>

                            <TouchableOpacity
                                style={[styles.button, isLoading && styles.buttonDisabled]}
                                onPress={handleRegister}
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
                                        <Text style={styles.buttonText}>Create Account</Text>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>

                            <View style={styles.footer}>
                                <Text style={styles.footerText}>Already have an account? </Text>
                                <Link href="/(auth)/login" asChild>
                                    <TouchableOpacity>
                                        <Text style={styles.linkText}>Sign In</Text>
                                    </TouchableOpacity>
                                </Link>
                            </View>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </LinearGradient>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    gradient: { flex: 1 },
    keyboardView: { flex: 1 },
    content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 48 },
    header: { alignItems: 'center', marginBottom: 32 },
    logoIcon: { fontSize: 48, marginBottom: 8 },
    title: { fontSize: 28, fontWeight: '800', color: '#F1F5F9' },
    subtitle: { fontSize: 14, color: '#94A3B8', marginTop: 4 },
    form: { gap: 14 },
    errorBox: {
        backgroundColor: 'rgba(239,68,68,0.15)',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.3)',
    },
    errorText: { color: '#F87171', fontSize: 13, textAlign: 'center' },
    inputGroup: { gap: 5 },
    label: { color: '#94A3B8', fontSize: 13, fontWeight: '600', marginLeft: 4 },
    input: {
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 14,
        padding: 15,
        fontSize: 15,
        color: '#F1F5F9',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    button: { marginTop: 6, borderRadius: 14, overflow: 'hidden' },
    buttonDisabled: { opacity: 0.7 },
    buttonGradient: {
        paddingVertical: 16,
        alignItems: 'center',
        borderRadius: 14,
    },
    buttonText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
    footerText: { color: '#94A3B8', fontSize: 14 },
    linkText: { color: '#A29BFE', fontSize: 14, fontWeight: '700' },
});
