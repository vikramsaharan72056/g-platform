import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

/**
 * Admin Dashboard Game Card
 */
export const GameOverview = ({ name, activePlayers, totalPot, status }: { name: string; activePlayers: number; totalPot: number; status: string }) => {
    return (
        <View style={styles.card}>
            <View style={styles.header}>
                <Text style={styles.gameName}>{name}</Text>
                <View style={[styles.statusBadge, status === 'ONLINE' ? styles.online : styles.offline]}>
                    <Text style={styles.statusText}>{status}</Text>
                </View>
            </View>
            <View style={styles.stats}>
                <View style={styles.statItem}>
                    <Text style={styles.label}>Players</Text>
                    <Text style={styles.value}>{activePlayers}</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.label}>Pot</Text>
                    <Text style={styles.value}>₹{totalPot.toLocaleString()}</Text>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 20,
        marginVertical: 10,
        elevation: 4,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
    },
    gameName: {
        fontSize: 20,
        fontWeight: '800',
        color: '#1a1a1a',
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
    },
    online: { backgroundColor: '#e6fffa', borderWidth: 1, borderColor: '#38b2ac' },
    offline: { backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#feb2b2' },
    statusText: { fontSize: 12, fontWeight: '700', color: '#1a1a1a' },
    stats: { flexDirection: 'row', gap: 20 },
    statItem: { flex: 1 },
    label: { fontSize: 12, color: '#666', marginBottom: 4 },
    value: { fontSize: 18, fontWeight: '700', color: '#333' }
});
