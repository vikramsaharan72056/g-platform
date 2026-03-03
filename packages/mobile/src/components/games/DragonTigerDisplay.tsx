import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GameComponentProps } from './types';
import { AnimatedCard } from './AnimatedCard';
import { LinearGradient } from 'expo-linear-gradient';

export const DragonTigerDisplay: React.FC<GameComponentProps> = ({ round }) => {
    const isPlaying = round.status === 'PLAYING';
    const isResult = round.status === 'RESULT' || round.status === 'SETTLED';

    if (isPlaying) {
        return (
            <View style={styles.playingArea}>
                <Text style={styles.waitingText}>🐉 ⚔️ 🐯</Text>
                <Text style={[styles.subText, { color: '#8B5CF6' }]}>Shuffling for the duel...</Text>
            </View>
        );
    }

    if (isResult && round.result) {
        const r = round.result;
        return (
            <View style={styles.resultArea}>
                <View style={styles.vsRow}>
                    <View style={styles.sideSection}>
                        <LinearGradient
                            colors={['rgba(239, 68, 68, 0.1)', 'transparent']}
                            style={styles.labelBg}
                        >
                            <Text style={[styles.cardLabel, { color: '#EF4444' }]}>DRAGON</Text>
                        </LinearGradient>
                        <AnimatedCard
                            suit={r.dragonCard?.suit || '?'}
                            value={r.dragonCard?.value || '?'}
                            index={0}
                        />
                    </View>

                    <View style={styles.vsCircle}>
                        <Text style={styles.vsText}>VS</Text>
                    </View>

                    <View style={styles.sideSection}>
                        <LinearGradient
                            colors={['rgba(245, 158, 11, 0.1)', 'transparent']}
                            style={styles.labelBg}
                        >
                            <Text style={[styles.cardLabel, { color: '#F59E0B' }]}>TIGER</Text>
                        </LinearGradient>
                        <AnimatedCard
                            suit={r.tigerCard?.suit || '?'}
                            value={r.tigerCard?.value || '?'}
                            index={1}
                        />
                    </View>
                </View>

                <View style={[styles.outcomeBadge, { backgroundColor: r.winner === 'TIE' ? '#FFD700' : '#10B981' }]}>
                    <Text style={styles.resultOutcome}>
                        {r.winner === 'TIE' ? "PUSH (TIE)" : `${r.winner} WINS`}
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.waitingArea}>
            <Text style={styles.waitingText}>⏳ Preparing Round...</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    playingArea: { alignItems: 'center', padding: 40 },
    resultArea: { alignItems: 'center', gap: 24, width: '100%', paddingVertical: 10 },
    vsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', width: '100%', gap: 20 },
    sideSection: { alignItems: 'center', gap: 12 },
    labelBg: { paddingHorizontal: 16, paddingVertical: 4, borderRadius: 12, marginBottom: 4 },
    cardLabel: { fontSize: 13, fontWeight: '900', letterSpacing: 2 },
    vsCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1A1A2E', borderWidth: 2, borderColor: '#2D2D44', alignItems: 'center', justifyContent: 'center' },
    vsText: { color: '#8B5CF6', fontSize: 16, fontWeight: 'bold' },
    outcomeBadge: { paddingVertical: 10, paddingHorizontal: 32, borderRadius: 20, marginTop: 12, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
    resultOutcome: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
    waitingArea: { padding: 40, alignItems: 'center' },
    waitingText: { color: '#9CA3AF', fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
    subText: { fontSize: 12, marginTop: 8 },
});
