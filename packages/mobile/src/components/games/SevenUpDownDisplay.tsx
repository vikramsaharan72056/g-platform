import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GameComponentProps } from './types';

const diceEmoji = (val: number) => ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][val] || '🎲';

export const SevenUpDownDisplay: React.FC<GameComponentProps> = ({ round }) => {
    const isPlaying = round.status === 'PLAYING';
    const isResult = round.status === 'RESULT' || round.status === 'SETTLED';

    if (isPlaying) {
        return <Text style={styles.waitingText}>🎲 Rolling dice...</Text>;
    }

    if (isResult && round.result) {
        const r = round.result;
        return (
            <View style={styles.resultArea}>
                <Text style={styles.resultEmoji}>{diceEmoji(r.dice1)} {diceEmoji(r.dice2)}</Text>
                <Text style={styles.resultValue}>Total: {r.total}</Text>
                <Text style={[styles.resultOutcome, { color: r.outcome === 'seven' ? '#FFD700' : r.outcome === 'up' ? '#10B981' : '#EF4444' }]}>
                    {r.outcome?.toUpperCase()}
                </Text>
            </View>
        );
    }

    return <Text style={styles.waitingText}>⏳ Preparing Round...</Text>;
};

const styles = StyleSheet.create({
    resultArea: { alignItems: 'center', gap: 8 },
    resultEmoji: { fontSize: 48 },
    resultValue: { color: '#9CA3AF', fontSize: 16 },
    resultOutcome: { fontSize: 24, fontWeight: 'bold' },
    waitingText: { color: '#9CA3AF', fontSize: 18, textAlign: 'center' },
});
