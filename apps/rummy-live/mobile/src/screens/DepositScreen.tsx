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

interface PaymentQr {
    id: number;
    name: string;
    type: string;
    upiId: string | null;
    qrImageUrl: string | null;
}

interface DepositRecord {
    id: number;
    amount: number;
    utrNumber: string;
    status: string;
    paymentMethod: string;
    createdAt: string;
    remarks?: string;
    rejectionReason?: string;
}

type ScreenMode = 'history' | 'form';

export const DepositScreen = ({ onBack }: { onBack: () => void }) => {
    const user = useGameStore((state) => state.user);
    const [mode, setMode] = useState<ScreenMode>('history');
    const [deposits, setDeposits] = useState<DepositRecord[]>([]);
    const [paymentQrs, setPaymentQrs] = useState<PaymentQr[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Form fields
    const [amount, setAmount] = useState('');
    const [utrNumber, setUtrNumber] = useState('');
    const [selectedQrId, setSelectedQrId] = useState<number | null>(null);

    const loadData = async () => {
        try {
            const [deps, qrs] = await Promise.all([
                ApiClient.get<DepositRecord[]>('/deposits/me'),
                ApiClient.get<PaymentQr[]>('/payment-qrs'),
            ]);
            setDeposits(deps || []);
            setPaymentQrs(qrs || []);
        } catch (err: any) {
            console.error('Failed to load deposits:', err);
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
            Alert.alert('Error', 'Minimum deposit is ₹100');
            return;
        }
        if (!utrNumber || utrNumber.length < 6) {
            Alert.alert('Error', 'Enter a valid UTR number (min 6 characters)');
            return;
        }

        setSubmitting(true);
        try {
            await ApiClient.post('/deposits', {
                amount: parsedAmount,
                utrNumber: utrNumber.trim(),
                paymentMethod: 'UPI',
                paymentQrId: selectedQrId || undefined,
            });
            Alert.alert('Success', 'Deposit submitted! Admin will verify your UTR and credit your wallet.');
            setAmount('');
            setUtrNumber('');
            setSelectedQrId(null);
            setMode('history');
            await loadData();
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to submit deposit');
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

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'APPROVED': return '✓';
            case 'REJECTED': return '✕';
            default: return '⏳';
        }
    };

    return (
        <View style={styles.container}>
            <Header
                title="Deposit"
                subtitle={`Balance: ₹${user?.wallet?.balance?.toLocaleString() || 0}`}
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
                        My Deposits
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, mode === 'form' && styles.tabActive]}
                    onPress={() => setMode('form')}
                >
                    <Text style={[styles.tabText, mode === 'form' && styles.tabTextActive]}>
                        + New Deposit
                    </Text>
                </TouchableOpacity>
            </View>

            {mode === 'form' ? (
                <ScrollView contentContainerStyle={styles.formContainer}>
                    {/* Payment QR Selection */}
                    {paymentQrs.length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Pay to</Text>
                            {paymentQrs.map((qr) => (
                                <TouchableOpacity
                                    key={qr.id}
                                    style={[
                                        styles.qrOption,
                                        selectedQrId === qr.id && styles.qrOptionSelected,
                                    ]}
                                    onPress={() => setSelectedQrId(qr.id)}
                                >
                                    <View style={styles.qrInfo}>
                                        <Text style={styles.qrName}>{qr.name}</Text>
                                        {qr.upiId && <Text style={styles.qrUpi}>{qr.upiId}</Text>}
                                    </View>
                                    <View style={[
                                        styles.qrRadio,
                                        selectedQrId === qr.id && styles.qrRadioSelected,
                                    ]} />
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {/* Amount Input */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Amount (₹)</Text>
                        <TextInput
                            style={styles.input}
                            value={amount}
                            onChangeText={setAmount}
                            keyboardType="numeric"
                            placeholder="Enter amount (min ₹100)"
                            placeholderTextColor={Colors.textMuted}
                        />
                        {/* Quick amount buttons */}
                        <View style={styles.quickAmounts}>
                            {[100, 500, 1000, 5000].map((a) => (
                                <TouchableOpacity
                                    key={a}
                                    style={[styles.quickBtn, amount === String(a) && styles.quickBtnActive]}
                                    onPress={() => setAmount(String(a))}
                                >
                                    <Text style={[styles.quickBtnText, amount === String(a) && styles.quickBtnTextActive]}>
                                        ₹{a.toLocaleString()}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* UTR Input */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>UTR / Transaction Reference</Text>
                        <TextInput
                            style={styles.input}
                            value={utrNumber}
                            onChangeText={setUtrNumber}
                            placeholder="Enter UTR number from your payment app"
                            placeholderTextColor={Colors.textMuted}
                            autoCapitalize="characters"
                        />
                        <Text style={styles.hint}>
                            💡 Find the UTR in your payment app → Transaction history → Details
                        </Text>
                    </View>

                    {/* Submit Button */}
                    <Button
                        title={submitting ? 'Submitting...' : 'Submit Deposit Request'}
                        variant="primary"
                        onPress={handleSubmit}
                        disabled={submitting || !amount || !utrNumber}
                    />

                    <Text style={styles.disclaimer}>
                        Your deposit will be verified by admin. Typically credited within 5-30 minutes.
                    </Text>
                </ScrollView>
            ) : (
                <FlatList
                    data={deposits}
                    keyExtractor={(item) => String(item.id)}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
                    }
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={styles.emptyText}>No deposits yet</Text>
                            <Button
                                title="Make your first deposit"
                                variant="outline"
                                size="small"
                                onPress={() => setMode('form')}
                                style={{ marginTop: 12 }}
                            />
                        </View>
                    }
                    renderItem={({ item }) => (
                        <View style={styles.depositCard}>
                            <View style={styles.depositHeader}>
                                <View style={styles.depositAmountRow}>
                                    <Text style={styles.depositAmount}>₹{item.amount.toLocaleString()}</Text>
                                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '22' }]}>
                                        <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                                            {getStatusIcon(item.status)} {item.status}
                                        </Text>
                                    </View>
                                </View>
                                <Text style={styles.depositDate}>
                                    {new Date(item.createdAt).toLocaleString()}
                                </Text>
                            </View>
                            <View style={styles.depositDetails}>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>UTR:</Text>
                                    <Text style={styles.detailValue}>{item.utrNumber}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Method:</Text>
                                    <Text style={styles.detailValue}>{item.paymentMethod}</Text>
                                </View>
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
    section: { marginBottom: 24 },
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
    hint: { color: Colors.textMuted, fontSize: 12, marginTop: 8, lineHeight: 18 },
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
    depositCard: {
        backgroundColor: Colors.cardBg,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    depositHeader: { marginBottom: 12 },
    depositAmountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    depositAmount: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    statusText: { fontSize: 12, fontWeight: 'bold' },
    depositDate: { color: Colors.textMuted, fontSize: 12, marginTop: 4 },
    depositDetails: {
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        paddingTop: 12,
    },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    detailLabel: { color: Colors.textMuted, fontSize: 13 },
    detailValue: { color: '#fff', fontSize: 13, fontWeight: '500' },
    qrOption: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: Colors.cardBg,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 12,
        padding: 16,
        marginBottom: 8,
    },
    qrOptionSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '11' },
    qrInfo: {},
    qrName: { color: '#fff', fontSize: 15, fontWeight: '600' },
    qrUpi: { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
    qrRadio: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: Colors.border,
    },
    qrRadioSelected: {
        borderColor: Colors.primary,
        backgroundColor: Colors.primary,
    },
});
