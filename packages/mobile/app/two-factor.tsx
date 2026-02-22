import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Image, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { authApi } from '../src/services/api';

export default function TwoFactorScreen() {
    const router = useRouter();
    const [step, setStep] = useState<'idle' | 'setup' | 'verify'>('idle');
    const [qrCode, setQrCode] = useState('');
    const [secret, setSecret] = useState('');
    const [verifyCode, setVerifyCode] = useState('');
    const [backupCodes, setBackupCodes] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const handleSetup = async () => {
        setLoading(true);
        try {
            const res = await authApi.setup2FA();
            setQrCode(res.data.qrCode);
            setSecret(res.data.secret);
            setStep('setup');
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.message || 'Failed to setup 2FA');
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async () => {
        if (verifyCode.length !== 6) {
            Alert.alert('Error', 'Enter a 6-digit code');
            return;
        }
        setLoading(true);
        try {
            const res = await authApi.verify2FA(verifyCode);
            setBackupCodes(res.data.backupCodes || []);
            setStep('verify');
            Alert.alert('Success', '2FA enabled! Save your backup codes.');
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.message || 'Invalid code');
        } finally {
            setLoading(false);
        }
    };

    const handleDisable = async () => {
        Alert.prompt('Disable 2FA', 'Enter your password to disable 2FA', async (password) => {
            if (!password) return;
            try {
                await authApi.disable2FA(password);
                Alert.alert('Success', '2FA disabled');
                router.back();
            } catch (err: any) {
                Alert.alert('Error', err.response?.data?.message || 'Failed to disable');
            }
        });
    };

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={styles.backBtn}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Two-Factor Authentication</Text>
                <Text style={styles.subtitle}>Add an extra layer of security to your account</Text>
            </View>

            {step === 'idle' && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>🔐 Protect your account</Text>
                    <Text style={styles.cardDesc}>
                        Two-factor authentication adds an extra layer of security.
                        You'll need a code from your authenticator app each time you log in.
                    </Text>
                    <TouchableOpacity style={styles.primaryBtn} onPress={handleSetup} disabled={loading}>
                        <Text style={styles.primaryBtnText}>{loading ? 'Setting up...' : 'Enable 2FA'}</Text>
                    </TouchableOpacity>
                </View>
            )}

            {step === 'setup' && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>📱 Scan QR Code</Text>
                    <Text style={styles.cardDesc}>
                        Open your authenticator app (Google Authenticator, Authy, etc.)
                        and scan this QR code:
                    </Text>
                    {qrCode ? (
                        <Image source={{ uri: qrCode }} style={styles.qrImage} resizeMode="contain" />
                    ) : null}
                    <Text style={styles.secretLabel}>Manual entry code:</Text>
                    <Text style={styles.secretCode}>{secret}</Text>

                    <Text style={styles.inputLabel}>Enter the 6-digit code from your app:</Text>
                    <TextInput
                        style={styles.input}
                        value={verifyCode}
                        onChangeText={setVerifyCode}
                        placeholder="000000"
                        placeholderTextColor="#666"
                        keyboardType="number-pad"
                        maxLength={6}
                        textAlign="center"
                    />
                    <TouchableOpacity style={styles.primaryBtn} onPress={handleVerify} disabled={loading}>
                        <Text style={styles.primaryBtnText}>{loading ? 'Verifying...' : 'Verify & Enable'}</Text>
                    </TouchableOpacity>
                </View>
            )}

            {step === 'verify' && backupCodes.length > 0 && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>✅ 2FA Enabled!</Text>
                    <Text style={styles.cardDesc}>
                        Save these backup codes in a safe place. You can use them if you lose access to your authenticator app.
                    </Text>
                    <View style={styles.codesGrid}>
                        {backupCodes.map((code, i) => (
                            <View key={i} style={styles.codeBox}>
                                <Text style={styles.codeText}>{code}</Text>
                            </View>
                        ))}
                    </View>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.back()}>
                        <Text style={styles.secondaryBtnText}>Done</Text>
                    </TouchableOpacity>
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0A0E17' },
    header: { padding: 20, paddingTop: 60 },
    backBtn: { color: '#7C5CFC', fontSize: 16, marginBottom: 12 },
    title: { color: '#fff', fontSize: 24, fontWeight: '800' },
    subtitle: { color: '#8E95A9', fontSize: 14, marginTop: 4 },
    card: {
        margin: 20,
        backgroundColor: '#141824',
        borderRadius: 16,
        padding: 24,
        borderWidth: 1,
        borderColor: '#1E2236',
    },
    cardTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
    cardDesc: { color: '#8E95A9', fontSize: 14, lineHeight: 20, marginBottom: 20 },
    qrImage: { width: 220, height: 220, alignSelf: 'center', marginVertical: 16, borderRadius: 12 },
    secretLabel: { color: '#8E95A9', fontSize: 12, marginTop: 8 },
    secretCode: {
        color: '#7C5CFC',
        fontSize: 14,
        fontFamily: 'monospace',
        backgroundColor: '#0D1117',
        padding: 12,
        borderRadius: 8,
        marginVertical: 8,
        textAlign: 'center',
    },
    inputLabel: { color: '#C8CDD8', fontSize: 14, marginBottom: 8, marginTop: 16 },
    input: {
        backgroundColor: '#0D1117',
        borderWidth: 1,
        borderColor: '#1E2236',
        borderRadius: 12,
        padding: 16,
        color: '#fff',
        fontSize: 24,
        fontWeight: '700',
        letterSpacing: 8,
        marginBottom: 16,
    },
    primaryBtn: {
        backgroundColor: '#7C5CFC',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
    },
    primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    secondaryBtn: {
        borderWidth: 1,
        borderColor: '#2A2E3F',
        borderRadius: 12,
        padding: 14,
        alignItems: 'center',
        marginTop: 12,
    },
    secondaryBtnText: { color: '#8E95A9', fontSize: 15, fontWeight: '600' },
    codesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginVertical: 16,
    },
    codeBox: {
        backgroundColor: '#0D1117',
        borderRadius: 8,
        padding: 10,
        width: '48%',
        alignItems: 'center',
    },
    codeText: { color: '#7C5CFC', fontSize: 14, fontFamily: 'monospace', fontWeight: '700' },
});
