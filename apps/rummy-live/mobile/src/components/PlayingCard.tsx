import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Colors } from '../constants/Colors';

interface PlayingCardProps {
    card: string; // e.g. "AS", "10H", "PJ1"
    selected?: boolean;
    onPress?: () => void;
    disabled?: boolean;
}

export const PlayingCard: React.FC<PlayingCardProps> = ({
    card,
    selected,
    onPress,
    disabled,
}) => {
    const isJoker = card.startsWith('PJ');
    const suit = isJoker ? 'J' : card.slice(-1);
    const rank = isJoker ? 'PJ' : card.slice(0, -1);

    const getSuitColor = () => {
        if (isJoker) return Colors.warning;
        if (suit === 'H' || suit === 'D') return Colors.danger;
        return '#ffffff';
    };

    const getSuitSymbol = () => {
        switch (suit) {
            case 'S': return '♠';
            case 'H': return '♥';
            case 'D': return '♦';
            case 'C': return '♣';
            case 'J': return '★';
            default: return '';
        }
    };

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            disabled={disabled}
            onPress={onPress}
            style={[
                styles.card,
                selected && styles.selected,
                disabled && styles.disabled,
            ]}
        >
            <View style={styles.topInfo}>
                <Text style={[styles.rank, { color: getSuitColor() }]}>{rank}</Text>
                <Text style={[styles.smallSuit, { color: getSuitColor() }]}>{getSuitSymbol()}</Text>
            </View>
            <View style={styles.centerInfo}>
                <Text style={[styles.largeSuit, { color: getSuitColor() }]}>{getSuitSymbol()}</Text>
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    card: {
        width: 60,
        height: 85,
        backgroundColor: '#ffffff',
        borderRadius: 6,
        padding: 4,
        justifyContent: 'space-between',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.25,
                shadowRadius: 3.84,
            },
            android: {
                elevation: 5,
            },
            web: {
                boxShadow: '0px 2px 3.84px rgba(0,0,0,0.25)',
            },
        }),
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    selected: {
        borderColor: Colors.warning,
        borderWidth: 3,
        transform: [{ translateY: -10 }],
    },
    disabled: {
        opacity: 0.6,
    },
    topInfo: {
        alignItems: 'flex-start',
    },
    rank: {
        fontSize: 16,
        fontWeight: 'bold',
        lineHeight: 16,
    },
    smallSuit: {
        fontSize: 12,
    },
    centerInfo: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    largeSuit: {
        fontSize: 24,
    },
});
