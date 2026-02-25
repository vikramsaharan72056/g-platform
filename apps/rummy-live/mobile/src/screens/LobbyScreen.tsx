import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/Colors';
import { Header } from '../components/Header';
import { TableCard } from '../components/TableCard';
import { Button } from '../components/Button';
import { socketService } from '../api/socketService';
import { ApiClient } from '../api/apiClient';
import { useGameStore } from '../store/useGameStore';

export const LobbyScreen = () => {
    const user = useGameStore((state) => state.user);
    const tableList = useGameStore((state) => state.tableList);
    const setTableList = useGameStore((state) => state.setTableList);
    const [refreshing, setRefreshing] = useState(false);
    const setError = useGameStore((state) => state.setError);

    const loadTables = async () => {
        try {
            const tables = await ApiClient.get<any[]>('/tables');
            setTableList(tables);
            await loadWallet();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const loadWallet = async () => {
        try {
            const wallet = await ApiClient.get<any>('/wallet');
            if (user) {
                useGameStore.getState().setUser({ ...user, wallet });
            }
        } catch (err) {
            console.error('Wallet load failed', err);
        }
    };

    const handleTopUp = async () => {
        try {
            await ApiClient.post('/wallet/recharge', { amount: 500 });
            await loadWallet();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadTables();
        setRefreshing(false);
    };

    useEffect(() => {
        loadTables();
    }, []);

    const handleJoinTable = async (tableId: string) => {
        try {
            await ApiClient.post(`/tables/${tableId}/join`);
            socketService.subscribeTable(tableId);
            useGameStore.getState().setLoading(true);
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleCreateTable = async () => {
        try {
            const table = await ApiClient.post<any>('/tables', {
                name: `${user?.name || 'Guest'}'s Table`,
                maxPlayers: 2,
                betAmount: 100
            });
            await loadTables();
            // Automatically enter the table we just created
            if (table && table.id) {
                await handleJoinTable(table.id);
            }
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <View style={styles.container}>
            <Header
                title="Lobby"
                subtitle={`Welcome back, ${user?.name || 'Guest'}`}
                balance={user?.wallet?.balance}
            />

            <View style={styles.listHeader}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Text style={styles.sectionHeader}>Active Tables</Text>
                    <TouchableOpacity onPress={handleTopUp} style={styles.topUpBadge}>
                        <Text style={styles.topUpText}>+ FREE ₹500</Text>
                    </TouchableOpacity>
                </View>
                <Button
                    title="+ New Table"
                    onPress={handleCreateTable}
                    size="small"
                    variant="outline"
                />
            </View>

            <FlatList
                data={tableList}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <TableCard
                        table={item}
                        onJoin={() => handleJoinTable(item.id)}
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
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
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
    topUpText: {
        color: Colors.success,
        fontSize: 10,
        fontWeight: 'bold',
    },
});
