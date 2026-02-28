import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Modal, Platform, TextInput } from 'react-native';
import { Colors } from '../constants/Colors';
import { Header } from '../components/Header';
import { TableCard } from '../components/TableCard';
import { Button } from '../components/Button';
import { socketService } from '../api/socketService';
import { ApiClient } from '../api/apiClient';
import { useGameStore } from '../store/useGameStore';
import type { User } from '../types';

interface TableSummary {
    id: string;
    status: string;
    playerIds?: string[];
}

export const LobbyScreen = () => {
    const user = useGameStore((state) => state.user);
    const tableList = useGameStore((state) => state.tableList);
    const currentTable = useGameStore((state) => state.currentTable);
    const setTableList = useGameStore((state) => state.setTableList);
    const setCurrentTable = useGameStore((state) => state.setCurrentTable);
    const setLoading = useGameStore((state) => state.setLoading);
    const setError = useGameStore((state) => state.setError);
    const setScreen = useGameStore((state) => state.setScreen);

    const [refreshing, setRefreshing] = useState(false);
    const [showInviteBonusModal, setShowInviteBonusModal] = useState(false);
    const [claimingInvitationBonus, setClaimingInvitationBonus] = useState(false);
    const [bonusNotification, setBonusNotification] = useState<string | null>(null);
    const [showCreateTableModal, setShowCreateTableModal] = useState(false);
    const [newTableBetAmount, setNewTableBetAmount] = useState('100');

    const invitationBonusAccepted = Boolean(user?.invitationBonusAccepted);

    const syncUser = (nextUser: User) => {
        useGameStore.getState().setUser(nextUser);
        if (Platform.OS === 'web') {
            localStorage.setItem('rummy_user', JSON.stringify(nextUser));
        }
    };

    const loadTables = async () => {
        const tables = await ApiClient.get<any[]>('/tables');
        setTableList(tables);
    };

    const loadWallet = async (markInvitationBonusAccepted = false) => {
        const wallet = await ApiClient.get<NonNullable<User['wallet']>>('/wallet/me');
        const latestUser = useGameStore.getState().user;
        if (latestUser) {
            syncUser({
                ...latestUser,
                wallet,
                invitationBonusAccepted: markInvitationBonusAccepted || latestUser.invitationBonusAccepted,
            });
        }
        return wallet;
    };

    const requireInvitationBonusAcceptance = () => {
        if (invitationBonusAccepted) return true;
        setShowInviteBonusModal(true);
        setError('Accept invitation bonus to unlock wallet actions.');
        return false;
    };

    const handleAcceptInvitationBonus = async () => {
        if (!user) return;
        setClaimingInvitationBonus(true);
        try {
            const wallet = await loadWallet(true);
            const creditedAmount = wallet.bonusBalance ?? wallet.balance;
            setBonusNotification(`Invitation bonus credited: Rs ${creditedAmount.toLocaleString()}`);
            setShowInviteBonusModal(false);
        } catch (err: any) {
            setError(err.message || 'Failed to claim invitation bonus');
        } finally {
            setClaimingInvitationBonus(false);
        }
    };

    const handleTopUp = async () => {
        if (!requireInvitationBonusAcceptance()) return;
        try {
            await ApiClient.post('/wallet/recharge', { amount: 500 });
            await loadWallet();
            setBonusNotification('Free bonus credited: Rs 500');
        } catch (err: any) {
            setError(err.message);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await loadTables();
            if (invitationBonusAccepted) {
                await loadWallet();
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        const bootstrap = async () => {
            try {
                await loadTables();
            } catch (err: any) {
                setError(err.message);
            }
        };

        bootstrap();
    }, []);

    useEffect(() => {
        if (!user) return;

        if (!invitationBonusAccepted) {
            setShowInviteBonusModal(true);
            return;
        }

        setShowInviteBonusModal(false);
        loadWallet().catch((err: any) => {
            setError(err.message || 'Failed to load wallet');
        });
    }, [user?.userId, invitationBonusAccepted]);

    useEffect(() => {
        if (!bonusNotification) return;
        const timer = setTimeout(() => setBonusNotification(null), 4000);
        return () => clearTimeout(timer);
    }, [bonusNotification]);

    const handleJoinTable = async (tableSummary: TableSummary) => {
        if (!requireInvitationBonusAcceptance()) return;

        setLoading(true);
        try {
            if (currentTable?.id && currentTable.id !== tableSummary.id) {
                socketService.unsubscribeTable(currentTable.id);
            }

            const isAlreadySeated = Boolean(user?.userId && tableSummary.playerIds?.includes(user.userId));
            if (tableSummary.status === 'IN_PROGRESS' && isAlreadySeated) {
                const liveState = await ApiClient.get<any>(`/tables/${tableSummary.id}`);
                socketService.subscribeTable(tableSummary.id);
                setCurrentTable(liveState);
                return;
            }

            const joined = await ApiClient.post<any>(`/tables/${tableSummary.id}/join`);
            socketService.subscribeTable(tableSummary.id);
            setCurrentTable(joined);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateTable = async () => {
        if (!requireInvitationBonusAcceptance()) return;

        try {
            const parsedBetAmount = Math.floor(Number(newTableBetAmount));
            if (!Number.isFinite(parsedBetAmount) || parsedBetAmount < 1) {
                setError('Please enter a valid bet amount (minimum 1).');
                return;
            }
            const table = await ApiClient.post<any>('/tables', {
                name: `${user?.name || 'Guest'}'s Table`,
                maxPlayers: 2,
                betAmount: parsedBetAmount,
            });
            await loadTables();
            if (table && table.id) {
                await handleJoinTable({ id: table.id, status: 'WAITING' });
            }
            setShowCreateTableModal(false);
            setNewTableBetAmount(String(parsedBetAmount));
        } catch (err: any) {
            setError(err.message);
        }
    };

    const openCreateTableModal = () => {
        if (!requireInvitationBonusAcceptance()) return;
        setShowCreateTableModal(true);
    };

    const openDeposit = () => {
        if (!requireInvitationBonusAcceptance()) return;
        setScreen('deposit');
    };

    const openWithdraw = () => {
        if (!requireInvitationBonusAcceptance()) return;
        setScreen('withdraw');
    };

    return (
        <View style={styles.container}>
            <Header
                title="Lobby"
                subtitle={
                    invitationBonusAccepted
                        ? `Welcome back, ${user?.name || 'Guest'}`
                        : 'Accept invitation bonus to activate your wallet'
                }
                balance={user?.wallet?.balance}
            />

            {bonusNotification && (
                <TouchableOpacity style={styles.notificationBanner} onPress={() => setBonusNotification(null)}>
                    <Text style={styles.notificationTitle}>Bonus Update</Text>
                    <Text style={styles.notificationText}>{bonusNotification}</Text>
                </TouchableOpacity>
            )}

            <View style={styles.listHeader}>
                <View style={styles.titleRow}>
                    <Text style={styles.sectionHeader}>Active Tables</Text>
                    <TouchableOpacity
                        onPress={handleTopUp}
                        style={[styles.topUpBadge, !invitationBonusAccepted && styles.topUpBadgeDisabled]}
                    >
                        <Text style={styles.topUpText}>+ FREE Rs 500</Text>
                    </TouchableOpacity>
                </View>
                <Button
                    title="+ New Table"
                    onPress={openCreateTableModal}
                    size="small"
                    variant="outline"
                    disabled={!invitationBonusAccepted}
                />
            </View>

            <View style={styles.actionBar}>
                <TouchableOpacity
                    style={[styles.actionBtn, styles.depositBtn, !invitationBonusAccepted && styles.actionBtnDisabled]}
                    onPress={openDeposit}
                >
                    <Text style={styles.actionBtnIcon}>$</Text>
                    <Text style={styles.actionBtnText}>Deposit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.actionBtn, styles.withdrawBtn, !invitationBonusAccepted && styles.actionBtnDisabled]}
                    onPress={openWithdraw}
                >
                    <Text style={styles.actionBtnIcon}>BANK</Text>
                    <Text style={styles.actionBtnText}>Withdraw</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={tableList}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <TableCard
                        table={item}
                        onJoin={() => handleJoinTable(item)}
                        currentUserId={user?.userId}
                    />
                )}
                contentContainerStyle={styles.list}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
                }
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Text style={styles.emptyText}>No active tables found</Text>
                        <Text style={styles.emptySubText}>Create one to get started!</Text>
                    </View>
                }
            />

            <Modal visible={showInviteBonusModal} transparent animationType="fade" onRequestClose={() => undefined}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Invitation Bonus</Text>
                        <Text style={styles.modalMessage}>
                            Accept your invitation bonus to activate your wallet. The balance will appear only after you accept.
                        </Text>
                        <Button
                            title="Accept And Credit Wallet"
                            onPress={handleAcceptInvitationBonus}
                            loading={claimingInvitationBonus}
                            variant="success"
                            style={styles.modalButton}
                        />
                    </View>
                </View>
            </Modal>

            <Modal visible={showCreateTableModal} transparent animationType="fade" onRequestClose={() => setShowCreateTableModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Create New Table</Text>
                        <Text style={styles.modalMessage}>
                            Choose your table bet amount. Other players will see this before joining.
                        </Text>
                        <TextInput
                            style={styles.betInput}
                            value={newTableBetAmount}
                            onChangeText={setNewTableBetAmount}
                            keyboardType="numeric"
                            placeholder="Enter bet amount"
                            placeholderTextColor={Colors.textMuted}
                        />
                        <View style={styles.modalActions}>
                            <Button
                                title="Cancel"
                                variant="secondary"
                                onPress={() => setShowCreateTableModal(false)}
                                style={styles.modalHalfBtn}
                            />
                            <Button
                                title="Create Table"
                                variant="primary"
                                onPress={handleCreateTable}
                                style={styles.modalHalfBtn}
                            />
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    notificationBanner: {
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 4,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: Colors.success,
        backgroundColor: Colors.success + '22',
    },
    notificationTitle: {
        color: Colors.success,
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 2,
    },
    notificationText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
    list: {
        padding: 16,
    },
    listHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginTop: 16,
        marginBottom: 8,
    },
    titleRow: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
    },
    sectionHeader: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    empty: {
        alignItems: 'center',
        marginTop: 48,
    },
    emptyText: {
        color: Colors.textMuted,
        fontSize: 16,
    },
    emptySubText: {
        color: Colors.textMuted,
        fontSize: 12,
        marginTop: 4,
    },
    topUpBadge: {
        backgroundColor: Colors.success + '33',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.success,
        justifyContent: 'center',
    },
    topUpBadgeDisabled: {
        opacity: 0.45,
    },
    topUpText: {
        color: Colors.success,
        fontSize: 10,
        fontWeight: 'bold',
    },
    actionBar: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        gap: 12,
        marginBottom: 16,
    },
    actionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    actionBtnDisabled: {
        opacity: 0.45,
    },
    depositBtn: {
        backgroundColor: Colors.primary + '11',
        borderColor: Colors.primary,
    },
    withdrawBtn: {
        backgroundColor: Colors.gold + '11',
        borderColor: Colors.gold,
    },
    actionBtnIcon: {
        fontSize: 12,
        marginRight: 8,
        color: '#fff',
        fontWeight: '700',
    },
    actionBtnText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: '#000000aa',
        justifyContent: 'center',
        padding: 24,
    },
    modalCard: {
        backgroundColor: Colors.cardBg,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: 20,
    },
    modalTitle: {
        color: '#fff',
        fontSize: 22,
        fontWeight: '700',
    },
    modalMessage: {
        color: Colors.textMuted,
        fontSize: 14,
        lineHeight: 20,
        marginTop: 10,
        marginBottom: 16,
    },
    modalButton: {
        minHeight: 46,
    },
    betInput: {
        backgroundColor: Colors.background,
        borderColor: Colors.border,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: '#fff',
        fontSize: 16,
        marginBottom: 12,
    },
    modalActions: {
        flexDirection: 'row',
        gap: 10,
    },
    modalHalfBtn: {
        flex: 1,
        minHeight: 46,
    },
});
