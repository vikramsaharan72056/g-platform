import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/Colors';
import { Button } from './Button';

interface TableCardProps {
    table: {
        id: string;
        name: string;
        currentPlayers: number;
        maxPlayers: number;
        betAmount: number;
        status: string;
        playerIds?: string[];
    };
    onJoin: () => void;
    currentUserId?: string;
}

export const TableCard: React.FC<TableCardProps> = ({ table, onJoin, currentUserId }) => {
    const isMember = currentUserId && table.playerIds?.includes(currentUserId);
    const isFull = table.currentPlayers >= table.maxPlayers;
    const inProgress = table.status === 'IN_PROGRESS';

    const getButtonTitle = () => {
        if (isMember) return 'Enter Game';
        if (inProgress) return 'In Progress';
        if (isFull) return 'Full';
        return 'Join Table';
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.name}>{table.name}</Text>
                <View style={[styles.badge, { backgroundColor: inProgress ? Colors.danger : Colors.success }]}>
                    <Text style={styles.badgeText}>{table.status}</Text>
                </View>
            </View>

            <View style={styles.details}>
                <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Players</Text>
                    <Text style={styles.detailValue}>{table.currentPlayers} / {table.maxPlayers}</Text>
                </View>
                <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Bet Amount</Text>
                    <Text style={styles.detailValue}>₹ {(table.betAmount || 0).toFixed(2)}</Text>
                </View>
            </View>

            <Button
                title={getButtonTitle()}
                onPress={onJoin}
                disabled={!isMember && (isFull || inProgress)}
                variant={isMember ? 'success' : (isFull || inProgress ? 'secondary' : 'primary')}
                size="small"
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: Colors.cardBg,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    name: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    badgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    details: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    detailItem: {
        marginRight: 24,
    },
    detailLabel: {
        color: Colors.textMuted,
        fontSize: 12,
        marginBottom: 2,
    },
    detailValue: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
});
