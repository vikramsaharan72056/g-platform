import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/Colors';
import type { SeatView } from '../types';

interface SeatProps {
    seat: SeatView;
    isCurrentTurn: boolean;
    isMe: boolean;
}

export const Seat: React.FC<SeatProps> = ({ seat, isCurrentTurn, isMe }) => {
    return (
        <View style={[styles.container, isCurrentTurn && styles.activeContainer]}>
            <View style={[styles.avatar, seat.status === 'DROPPED' && styles.droppedAvatar]}>
                <Text style={styles.avatarText}>{seat.name[0].toUpperCase()}</Text>
                {!seat.connected && <View style={styles.offlineDot} />}
            </View>
            <View style={styles.info}>
                <Text style={[styles.name, isMe && styles.meName]} numberOfLines={1}>
                    {seat.name} {isMe ? '(You)' : ''}
                </Text>
                <Text style={styles.status}>
                    {seat.status === 'DROPPED' ? `Dropped (${seat.score})` : `${seat.handCount ?? seat.hand?.length ?? 0} Cards`}
                </Text>
            </View>
            {isCurrentTurn && (
                <View style={styles.turnIndicator}>
                    <Text style={styles.turnText}>TURN</Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: 8,
        borderRadius: 12,
        backgroundColor: Colors.cardBg,
        flexDirection: 'row',
        alignItems: 'center',
        width: '48%',
        marginBottom: 8,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    activeContainer: {
        borderColor: Colors.primary,
        backgroundColor: Colors.cardActive,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: Colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    droppedAvatar: {
        opacity: 0.5,
    },
    avatarText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 18,
    },
    offlineDot: {
        position: 'absolute',
        right: 0,
        bottom: 0,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: Colors.danger,
        borderWidth: 2,
        borderColor: Colors.cardBg,
    },
    info: {
        flex: 1,
    },
    name: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    meName: {
        color: Colors.warning,
    },
    status: {
        color: Colors.textMuted,
        fontSize: 12,
    },
    turnIndicator: {
        backgroundColor: Colors.primary,
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
        position: 'absolute',
        top: -8,
        right: 8,
    },
    turnText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
});
