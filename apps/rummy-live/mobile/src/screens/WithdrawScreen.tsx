import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    ScrollView, Alert, FlatList, RefreshControl,
} from 'react-native';
import { Colors } from '../constants/Colors';
import { Header } from '../components/Header';
import { Button } from '../components/Button';
import { ApiClient } from '../api/apiClient';
import { useGameStore } from '../store/useGameStore';

interface WithdrawalRecord {
    id: number;
    amount: number;
    status: string;
    bankName: string | null;
    accountNumber: string | null;
    ifscCode: string | null;
    upiId: string | null;
    paymentRef: string | null;
    rejectionReason: string | null;
    createdAt: string;
}

type ScreenMode = 'history' | 'form';

export const WithdrawScreen = ({ onBack }: { onBack: () => void }) => {
    const user = useGameStore((state) => state.user);
    const balance = user?.wallet?.balance || 0;
    const [mode, setMode] = useState<ScreenMode>('history');
    const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Form fields
    const [amount, setAmount] = useState('');
    const [payoutMethod, setPayoutMethod] = useState<'UPI' | 'BANK'>('UPI');
    const [upiId, setUpiId] = useState('');
    const [bankName, setBankName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [ifscCode, setIfscCode] = useState('');

    const loadData = async () => {
        try {
            const data = await ApiClient.get<WithdrawalRecord[]>('/withdrawals/me');
            setWithdrawals(data || []);
        } catch (err: any) {
            console.error('Failed to load withdrawals:', err);
        }
    };

    useEffect(() => { loadData(); }, []);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const handleSubmit = async () => {
        const parsedAmount = parseInt(amount);
        if (!parsedAmount || parsedAmount < 100) {
            Alert.alert('Error', 'Minimum withdrawal is ₹100');
            return;
        }
        if (parsedAmount > balance) {
            Alert.alert('Error', `Insufficient balance. You have ₹${balance.toLocaleString()}`);
            return;
        }
        if (payoutMethod === 'UPI' && !upiId.trim()) {
            Alert.alert('Error', 'Enter your UPI ID');
            return;
        }
        if (payoutMethod === 'BANK') {
            if (!accountNumber.trim() || !ifscCode.trim()) {
                Alert.alert('Error', 'Enter bank account number and IFSC code');
                return;
            }
        }

        setSubmitting(true);
        try {
            await ApiClient.post('/withdrawals', {
                amount: parsedAmount,
                bankName: payoutMethod === 'BANK' ? bankName.trim() : undefined,
                accountNumber: payoutMethod === 'BANK' ? accountNumber.trim() : undefined,
                ifscCode: payoutMethod === 'BANK' ? ifscCode.trim() : undefined,
                upiId: payoutMethod === 'UPI' ? upiId.trim() : undefined,
            });
            Alert.alert('Success', 'Withdrawal request submitted! Amount has been held from your balance.');
            setAmount('');
            setUpiId('');
            setBankName('');
            setAccountNumber('');
            setIfscCode('');
            setMode('history');
            await loadData();
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to submit withdrawal');
        } finally {
            setSubmitting(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'APPROVED': return Colors.success;
            case 'REJECTED': return Colors.danger;
            default: return Colors.warning;
        }
    };

    return (
        <View style={styles.container}>
            <Header
                title="Withdraw"
                subtitle={`Balance: ₹${balance.toLocaleString()}`}
                showBack
                onBack={onBack}
            />

            {/* Tab Switch */}
            <View style={styles.tabs}>
                <TouchableOpacity
                    style={[styles.tab, mode === 'history' && styles.tabActive]}
                    onPress={() => setMode('history')}
                >
                    <Text style={[styles.tabText, mode === 'history' && styles.tabTextActive]}>
                        My Withdrawals
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, mode === 'form' && styles.tabActive]}
                    onPress={() => setMode('form')}
                >
                    <Text style={[styles.tabText, mode === 'form' && styles.tabTextActive]}>
                        + New Request
                    </Text>
                </TouchableOpacity>
            </View>

            {mode === 'form' ? (
                <ScrollView contentContainerStyle={styles.formContainer}>
                    {/* Amount */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Amount (₹)</Text>
                        <TextInput
                            style={styles.input}
                            value={amount}
                            onChangeText={setAmount}
                            keyboardType="numeric"
                            placeholder={`Enter amount (max ₹${balance.toLocaleString()})`}
                            placeholderTextColor={Colors.textMuted}
                        />
                        <View style={styles.quickAmounts}>
                            {[100, 500, 1000].map((a) => (
                                <TouchableOpacity
                                    key={a}
                                    style={[styles.quickBtn, amount === String(a) && styles.quickBtnActive]}
                                    onPress={() => setAmount(String(Math.min(a, balance)))}
                                >
                                    <Text style={[styles.quickBtnText, amount === String(a) && styles.quickBtnTextActive]}>
                                        ₹{a.toLocaleString()}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                            <TouchableOpacity
                                style={[styles.quickBtn, amount === String(balance) && styles.quickBtnActive]}
                                onPress={() => setAmount(String(balance))}
                            >
                                <Text style={[styles.quickBtnText, amount === String(balance) && styles.quickBtnTextActive]}>
                                    MAX
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Payout Method Selection */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Payout Method</Text>
                        <View style={styles.methodTabs}>
                            <TouchableOpacity
                                style={[styles.methodTab, payoutMethod === 'UPI' && styles.methodTabActive]}
                                onPress={() => setPayoutMethod('UPI')}
                            >
                                <Text style={[styles.methodTabText, payoutMethod === 'UPI' && styles.methodTabTextActive]}>
                                    UPI
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.methodTab, payoutMethod === 'BANK' && styles.methodTabActive]}
                                onPress={() => setPayoutMethod('BANK')}
                            >
                                <Text style={[styles.methodTabText, payoutMethod === 'BANK' && styles.methodTabTextActive]}>
                                    Bank Transfer
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Payout Details */}
                    {payoutMethod === 'UPI' ? (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>UPI ID</Text>
                            <TextInput
                                style={styles.input}
                                value={upiId}
                                onChangeText={setUpiId}
                                placeholder="yourname@upi"
                                placeholderTextColor={Colors.textMuted}
                                autoCapitalize="none"
                            />
                        </View>
                    ) : (
                        <>
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Bank Name</Text>
                                <TextInput
                                    style={styles.input}
                                    value={bankName}
                                    onChangeText={setBankName}
                                    placeholder="e.g. State Bank of India"
                                    placeholderTextColor={Colors.textMuted}
                                />
                            </View>
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Account Number</Text>
                                <TextInput
                                    style={styles.input}
                                    value={accountNumber}
                                    onChangeText={setAccountNumber}
                                    keyboardType="numeric"
                                    placeholder="Enter account number"
                                    placeholderTextColor={Colors.textMuted}
                                />
                            </View>
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>IFSC Code</Text>
                                <TextInput
                                    style={styles.input}
                                    value={ifscCode}
                                    onChangeText={setIfscCode}
                                    placeholder="e.g. SBIN0001234"
                                    placeholderTextColor={Colors.textMuted}
                                    autoCapitalize="characters"
                                />
                            </View>
                        </>
                    )}

                    <Button
                        title={submitting ? 'Submitting...' : 'Submit Withdrawal Request'}
                        variant="primary"
                        onPress={handleSubmit}
                        disabled={submitting || !amount}
                    />

                    <Text style={styles.disclaimer}>
                        Amount will be held from your balance immediately. If rejected, funds will be refunded.
                        Usually processed within 24 hours.
                    </Text>
                </ScrollView>
            ) : (
                <FlatList
                    data={withdrawals}
                    keyExtractor={(item) => String(item.id)}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
                    }
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={styles.emptyText}>No withdrawals yet</Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <View style={styles.withdrawCard}>
                            <View style={styles.cardHeader}>
                                <Text style={styles.cardAmount}>₹{item.amount.toLocaleString()}</Text>
                                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '22' }]}>
                                    <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                                        {item.status}
                                    </Text>
                                </View>
                            </View>
                            <Text style={styles.cardDate}>{new Date(item.createdAt).toLocaleString()}</Text>
                            <View style={styles.cardDetails}>
                                {item.upiId && (
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>UPI:</Text>
                                        <Text style={styles.detailValue}>{item.upiId}</Text>
                                    </View>
                                )}
                                {item.accountNumber && (
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>A/C:</Text>
                                        <Text style={styles.detailValue}>{item.bankName} - {item.accountNumber}</Text>
                                    </View>
                                )}
                                {item.paymentRef && (
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Ref:</Text>
                                        <Text style={[styles.detailValue, { color: Colors.success }]}>{item.paymentRef}</Text>
                                    </View>
                                )}
                                {item.rejectionReason && (
                                    <View style={styles.detailRow}>
                                        <Text style={[styles.detailLabel, { color: Colors.danger }]}>Reason:</Text>
                                        <Text style={[styles.detailValue, { color: Colors.danger }]}>{item.rejectionReason}</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    )}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    tabs: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginTop: 12,
        borderRadius: 12,
        backgroundColor: Colors.cardBg,
        padding: 4,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 10,
    },
    tabActive: { backgroundColor: Colors.primary },
    tabText: { color: Colors.textMuted, fontSize: 14, fontWeight: '600' },
    tabTextActive: { color: '#fff' },
    formContainer: { padding: 16, paddingBottom: 40 },
    section: { marginBottom: 20 },
    sectionTitle: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginBottom: 10 },
    input: {
        backgroundColor: Colors.cardBg,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        color: '#fff',
        fontSize: 16,
    },
    quickAmounts: { flexDirection: 'row', gap: 8, marginTop: 10 },
    quickBtn: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.border,
        alignItems: 'center',
    },
    quickBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '22' },
    quickBtnText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
    quickBtnTextActive: { color: Colors.primary },
    methodTabs: { flexDirection: 'row', gap: 12 },
    methodTab: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.border,
        alignItems: 'center',
    },
    methodTabActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '22' },
    methodTabText: { color: Colors.textMuted, fontSize: 14, fontWeight: '600' },
    methodTabTextActive: { color: Colors.primary },
    disclaimer: {
        color: Colors.textMuted,
        fontSize: 11,
        textAlign: 'center',
        marginTop: 16,
        lineHeight: 16,
    },
    listContent: { padding: 16 },
    empty: { alignItems: 'center', marginTop: 48 },
    emptyText: { color: Colors.textMuted, fontSize: 16 },
    withdrawCard: {
        backgroundColor: Colors.cardBg,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardAmount: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    statusText: { fontSize: 12, fontWeight: 'bold' },
    cardDate: { color: Colors.textMuted, fontSize: 12, marginTop: 4, marginBottom: 12 },
    cardDetails: {
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        paddingTop: 12,
    },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    detailLabel: { color: Colors.textMuted, fontSize: 13 },
    detailValue: { color: '#fff', fontSize: 13, fontWeight: '500' },
});
