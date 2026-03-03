import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GameComponentProps } from './types';

export const TeenPattiDisplay: React.FC<GameComponentProps> = ({ round }) => {
    const isPlaying = round.status === 'PLAYING';
    const isResult = round.status === 'RESULT' || round.status === 'SETTLED';

    if (isPlaying) {
        return <Text style={styles.waitingText}>🃏 Dealing hands...</Text>;
    }

    if (isResult && round.result) {
        const r = round.result;
        return (
            <View style={styles.resultArea}>
                <View style={styles.vsRow}>
                    <View style={styles.cardBox}>
                        <Text style={styles.cardLabel}>🅰️ Player A</Text>
                        <Text style={styles.cardValue}>{r.playerA?.cards?.join(' ') || '?'}</Text>
                        <Text style={styles.handRank}>{r.playerA?.handName || ''}</Text>
                    </View>
                    <Text style={styles.vsText}>VS</Text>
                    <View style={styles.cardBox}>
                        <Text style={styles.cardLabel}>🅱️ Player B</Text>
                        <Text style={styles.cardValue}>{r.playerB?.cards?.join(' ') || '?'}</Text>
                        <Text style={styles.handRank}>{r.playerB?.handName || ''}</Text>
                    </View>
                </View>
                <Text style={[styles.resultOutcome, { color: '#10B981' }]}>
                    {r.winner === 'TIE' ? "It's a Tie!" : `${r.winner?.replace('_', ' ')} Wins!`}
                </Text>
            </View>
        );
    }

    return <Text style={styles.waitingText}>⏳ Preparing Round...</Text>;
};

const styles = StyleSheet.create({
    resultArea: { alignItems: 'center', gap: 8, width: '100%' },
    resultOutcome: { fontSize: 24, fontWeight: 'bold' },
    waitingText: { color: '#9CA3AF', fontSize: 18, textAlign: 'center' },
    vsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', width: '100%', gap: 8 },
    vsText: { color: '#FFD700', fontSize: 20, fontWeight: 'bold' },
    cardBox: { alignItems: 'center', backgroundColor: '#2D2D44', borderRadius: 12, padding: 12, flex: 1 },
    cardLabel: { color: '#9CA3AF', fontSize: 12, marginBottom: 4 },
    cardValue: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    handRank: { color: '#8B5CF6', fontSize: 11, marginTop: 4, textAlign: 'center' },
});
