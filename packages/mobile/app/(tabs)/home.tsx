import React, { useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useGameStore } from '../../src/stores/gameStore';
import { useWalletStore } from '../../src/stores/walletStore';

const GAME_ICONS: Record<string, string> = {
    'seven-up-down': '🎲',
    'teen-patti': '🃏',
    'aviator': '✈️',
    'dragon-tiger': '🐉',
    'poker': '♠️',
};

export default function HomeScreen() {
    const { games, isLoading, fetchGames } = useGameStore();
    const { balance, fetchBalance } = useWalletStore();
    const router = useRouter();

    useEffect(() => {
        fetchGames();
        fetchBalance();
    }, []);

    const handleGamePress = (slug: string) => {
        router.push(`/game/${slug}`);
    };

    const renderGame = ({ item }: { item: any }) => {
        const icon = GAME_ICONS[item.slug] || '🎮';
        const isActive = item.isActive;

        return (
            <TouchableOpacity
                style={[styles.gameCard, !isActive && styles.gameCardInactive]}
                onPress={() => isActive && handleGamePress(item.slug)}
                activeOpacity={isActive ? 0.7 : 1}
            >
                <LinearGradient
                    colors={isActive ? ['#1E1E3A', '#2A2A4A'] : ['#1A1A2E', '#1A1A2E']}
                    style={styles.gameGradient}
                >
                    <Text style={styles.gameIcon}>{icon}</Text>
                    <View style={styles.gameInfo}>
                        <Text style={styles.gameName}>{item.name}</Text>
                        <Text style={styles.gameDesc} numberOfLines={1}>
                            {item.description || 'Classic casino game'}
                        </Text>
                        <View style={styles.gameMeta}>
                            <Text style={styles.metaText}>
                                ₹{item.minBet || 10} - ₹{item.maxBet || 10000}
                            </Text>
                            <View style={[styles.statusBadge, isActive ? styles.activeBadge : styles.inactiveBadge]}>
                                <Text style={[styles.statusText, isActive ? styles.activeText : styles.inactiveText]}>
                                    {isActive ? '● LIVE' : 'COMING SOON'}
                                </Text>
                            </View>
                        </View>
                    </View>
                </LinearGradient>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {/* Balance Banner */}
            <LinearGradient
                colors={['#6C5CE7', '#A29BFE']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.balanceBanner}
            >
                <View>
                    <Text style={styles.balanceLabel}>Your Balance</Text>
                    <Text style={styles.balanceAmount}>₹{balance.toFixed(2)}</Text>
                </View>
                <TouchableOpacity
                    style={styles.depositBtn}
                    onPress={() => router.push('/deposit')}
                >
                    <Text style={styles.depositBtnText}>+ Add Money</Text>
                </TouchableOpacity>
            </LinearGradient>

            {/* Games List */}
            {isLoading ? (
                <ActivityIndicator color="#A29BFE" size="large" style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={games}
                    renderItem={renderGame}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={isLoading}
                            onRefresh={() => { fetchGames(); fetchBalance(); }}
                            tintColor="#A29BFE"
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={styles.emptyIcon}>🎮</Text>
                            <Text style={styles.emptyText}>No games available yet</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F0F23' },
    balanceBanner: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginHorizontal: 16,
        marginTop: 8,
        borderRadius: 16,
        padding: 20,
    },
    balanceLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500' },
    balanceAmount: { color: '#FFF', fontSize: 28, fontWeight: '800', marginTop: 2 },
    depositBtn: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    depositBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
    list: { padding: 16, gap: 12, paddingBottom: 20 },
    gameCard: { borderRadius: 16, overflow: 'hidden' },
    gameCardInactive: { opacity: 0.5 },
    gameGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 18,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(162,155,254,0.15)',
    },
    gameIcon: { fontSize: 42, marginRight: 16 },
    gameInfo: { flex: 1 },
    gameName: { color: '#F1F5F9', fontSize: 18, fontWeight: '700' },
    gameDesc: { color: '#94A3B8', fontSize: 13, marginTop: 2 },
    gameMeta: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
    },
    metaText: { color: '#6B7280', fontSize: 12 },
    statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    activeBadge: { backgroundColor: 'rgba(16,185,129,0.15)' },
    inactiveBadge: { backgroundColor: 'rgba(107,114,128,0.15)' },
    statusText: { fontSize: 11, fontWeight: '700' },
    activeText: { color: '#34D399' },
    inactiveText: { color: '#6B7280' },
    empty: { alignItems: 'center', marginTop: 60 },
    emptyIcon: { fontSize: 64 },
    emptyText: { color: '#6B7280', fontSize: 16, marginTop: 12 },
});
