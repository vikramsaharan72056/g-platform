import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useWalletStore } from '../../src/stores/walletStore';

const TX_ICONS: Record<string, { icon: string; color: string }> = {
    DEPOSIT: { icon: 'arrow-down', color: '#34D399' },
    WITHDRAWAL: { icon: 'arrow-up', color: '#F87171' },
    BET_PLACED: { icon: 'minus', color: '#FBBF24' },
    BET_WON: { icon: 'trophy', color: '#34D399' },
    ADMIN_CREDIT: { icon: 'plus', color: '#34D399' },
    ADMIN_DEBIT: { icon: 'minus', color: '#F87171' },
    BONUS: { icon: 'gift', color: '#A29BFE' },
};

export default function WalletScreen() {
    const router = useRouter();
    const {
        balance,
        bonusBalance,
        totalWon,
        totalLost,
        transactions,
        isLoading,
        fetchBalance,
        fetchTransactions,
    } = useWalletStore();

    useEffect(() => {
        fetchBalance();
        fetchTransactions();
    }, []);

    const renderTransaction = ({ item }: { item: any }) => {
        const txStyle = TX_ICONS[item.type] || { icon: 'exchange', color: '#94A3B8' };
        const isCredit = ['DEPOSIT', 'BET_WON', 'ADMIN_CREDIT', 'BONUS'].includes(item.type);

        return (
            <View style={styles.txCard}>
                <View style={[styles.txIconBox, { backgroundColor: `${txStyle.color}15` }]}>
                    <FontAwesome name={txStyle.icon as any} size={16} color={txStyle.color} />
                </View>
                <View style={styles.txInfo}>
                    <Text style={styles.txType}>{item.type?.replace(/_/g, ' ')}</Text>
                    <Text style={styles.txDate}>
                        {new Date(item.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                        })}
                    </Text>
                </View>
                <Text style={[styles.txAmount, { color: isCredit ? '#34D399' : '#F87171' }]}>
                    {isCredit ? '+' : '-'}₹{Math.abs(item.amount).toFixed(2)}
                </Text>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Balance Card */}
            <LinearGradient
                colors={['#6C5CE7', '#A29BFE']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.balanceCard}
            >
                <Text style={styles.balanceLabel}>Total Balance</Text>
                <Text style={styles.balanceAmount}>₹{balance.toFixed(2)}</Text>
                <Text style={styles.bonusText}>Bonus: ₹{bonusBalance.toFixed(2)}</Text>

                <View style={styles.actions}>
                    <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => router.push('/deposit')}
                    >
                        <FontAwesome name="plus" size={14} color="#FFF" />
                        <Text style={styles.actionText}>Deposit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => router.push('/withdraw')}
                    >
                        <FontAwesome name="arrow-up" size={14} color="#FFF" />
                        <Text style={styles.actionText}>Withdraw</Text>
                    </TouchableOpacity>
                </View>
            </LinearGradient>

            {/* Stats Row */}
            <View style={styles.statsRow}>
                <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Total Won</Text>
                    <Text style={[styles.statValue, { color: '#34D399' }]}>₹{totalWon.toFixed(0)}</Text>
                </View>
                <View style={[styles.statBox, styles.statDivider]}>
                    <Text style={styles.statLabel}>Total Lost</Text>
                    <Text style={[styles.statValue, { color: '#F87171' }]}>₹{totalLost.toFixed(0)}</Text>
                </View>
            </View>

            {/* Transactions */}
            <View style={styles.txHeader}>
                <Text style={styles.txTitle}>Recent Transactions</Text>
            </View>

            <FlatList
                data={transactions}
                renderItem={renderTransaction}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.txList}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={isLoading}
                        onRefresh={() => { fetchBalance(); fetchTransactions(); }}
                        tintColor="#A29BFE"
                    />
                }
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Text style={styles.emptyIcon}>📭</Text>
                        <Text style={styles.emptyText}>No transactions yet</Text>
                    </View>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F0F23' },
    balanceCard: {
        margin: 16,
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
    },
    balanceLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
    balanceAmount: { color: '#FFF', fontSize: 38, fontWeight: '800', marginTop: 4 },
    bonusText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 4 },
    actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 12,
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    actionText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
    statsRow: {
        flexDirection: 'row',
        marginHorizontal: 16,
        backgroundColor: '#1A1A2E',
        borderRadius: 14,
        overflow: 'hidden',
    },
    statBox: { flex: 1, alignItems: 'center', paddingVertical: 14 },
    statDivider: { borderLeftWidth: 1, borderLeftColor: '#2D2D44' },
    statLabel: { color: '#6B7280', fontSize: 12 },
    statValue: { fontSize: 18, fontWeight: '700', marginTop: 4 },
    txHeader: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 20, marginBottom: 8 },
    txTitle: { color: '#F1F5F9', fontSize: 17, fontWeight: '700' },
    txList: { paddingHorizontal: 16, paddingBottom: 20 },
    txCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1A1A2E',
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
    },
    txIconBox: {
        width: 38,
        height: 38,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    txInfo: { flex: 1 },
    txType: { color: '#F1F5F9', fontSize: 14, fontWeight: '600' },
    txDate: { color: '#6B7280', fontSize: 12, marginTop: 2 },
    txAmount: { fontSize: 16, fontWeight: '700' },
    empty: { alignItems: 'center', marginTop: 40 },
    emptyIcon: { fontSize: 48 },
    emptyText: { color: '#6B7280', fontSize: 14, marginTop: 8 },
});
