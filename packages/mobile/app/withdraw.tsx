import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { withdrawalApi } from '../src/services/api';
import { useWalletStore } from '../src/stores/walletStore';

export default function WithdrawScreen() {
    const router = useRouter();
    const { balance } = useWalletStore();
    const [amount, setAmount] = useState('');
    const [bankName, setBankName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [ifscCode, setIfscCode] = useState('');
    const [holderName, setHolderName] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async () => {
        if (!amount || !bankName || !accountNumber || !ifscCode || !holderName) {
            Alert.alert('Error', 'Please fill all fields');
            return;
        }
        if (parseFloat(amount) > balance) {
            Alert.alert('Error', 'Insufficient balance');
            return;
        }
        setIsLoading(true);
        try {
            await withdrawalApi.submitRequest({
                amount: parseFloat(amount),
                bankName,
                accountNumber,
                ifscCode: ifscCode.toUpperCase(),
                holderName,
            });
            Alert.alert('Success', 'Withdrawal request submitted! Admin will process.', [
                { text: 'OK', onPress: () => router.back() },
            ]);
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.message || 'Withdrawal failed');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                {/* Available Balance */}
                <View style={styles.balanceCard}>
                    <Text style={styles.balanceLabel}>Available Balance</Text>
                    <Text style={styles.balanceAmount}>₹{balance.toFixed(2)}</Text>
                </View>

                {/* Amount */}
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Withdrawal Amount</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="₹ Enter amount"
                        placeholderTextColor="#6B7280"
                        value={amount}
                        onChangeText={setAmount}
                        keyboardType="numeric"
                    />
                </View>

                {/* Bank Details */}
                <Text style={styles.sectionTitle}>Bank Details</Text>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Bank Name</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. HDFC Bank"
                        placeholderTextColor="#6B7280"
                        value={bankName}
                        onChangeText={setBankName}
                    />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Account Number</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Enter account number"
                        placeholderTextColor="#6B7280"
                        value={accountNumber}
                        onChangeText={setAccountNumber}
                        keyboardType="numeric"
                    />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>IFSC Code</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. HDFC0001234"
                        placeholderTextColor="#6B7280"
                        value={ifscCode}
                        onChangeText={setIfscCode}
                        autoCapitalize="characters"
                    />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Account Holder Name</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Name as per bank records"
                        placeholderTextColor="#6B7280"
                        value={holderName}
                        onChangeText={setHolderName}
                    />
                </View>

                <TouchableOpacity
                    style={[styles.submitBtn, isLoading && styles.btnDisabled]}
                    onPress={handleSubmit}
                    disabled={isLoading}
                >
                    <LinearGradient
                        colors={['#6C5CE7', '#A29BFE']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.btnGradient}
                    >
                        {isLoading ? (
                            <ActivityIndicator color="#FFF" />
                        ) : (
                            <Text style={styles.btnText}>Request Withdrawal</Text>
                        )}
                    </LinearGradient>
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F0F23' },
    content: { padding: 16, paddingBottom: 40 },
    balanceCard: {
        backgroundColor: '#1A1A2E',
        borderRadius: 14,
        padding: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#2D2D44',
        marginBottom: 20,
    },
    balanceLabel: { color: '#6B7280', fontSize: 13 },
    balanceAmount: { color: '#A29BFE', fontSize: 32, fontWeight: '800', marginTop: 4 },
    sectionTitle: { color: '#F1F5F9', fontSize: 16, fontWeight: '700', marginTop: 12, marginBottom: 8 },
    inputGroup: { marginBottom: 14 },
    label: { color: '#94A3B8', fontSize: 13, fontWeight: '600', marginBottom: 6, marginLeft: 4 },
    input: {
        backgroundColor: '#1A1A2E',
        borderRadius: 14,
        padding: 16,
        fontSize: 15,
        color: '#F1F5F9',
        borderWidth: 1,
        borderColor: '#2D2D44',
    },
    submitBtn: { marginTop: 12, borderRadius: 14, overflow: 'hidden' },
    btnDisabled: { opacity: 0.5 },
    btnGradient: { paddingVertical: 16, alignItems: 'center', borderRadius: 14 },
    btnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
