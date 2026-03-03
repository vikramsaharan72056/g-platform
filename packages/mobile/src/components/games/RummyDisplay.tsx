import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { GameComponentProps } from './types';
import { AnimatedCard } from './AnimatedCard';

export const RummyDisplay: React.FC<GameComponentProps> = ({ round }) => {
    const isPlaying = round.status === 'PLAYING';
    const isResult = round.status === 'RESULT' || round.status === 'SETTLED';
    const r = round.result || {};

    const parseCard = (cardStr: string) => {
        if (!cardStr) return { suit: '?', value: '?' };
        const suit = cardStr.slice(-1);
        const value = cardStr.slice(0, -1);
        return { suit, value };
    };

    const renderCardFan = (cards: string[] = [], startIdx: number = 0) => {
        return (
            <View style={styles.fanContainer}>
                {cards.map((c, i) => {
                    const { suit, value } = parseCard(c);
                    // Use overlap for Rummy fan effect
                    return (
                        <View key={`${c}-${i}`} style={i > 0 && { marginLeft: -50 }}>
                            <AnimatedCard suit={suit} value={value} index={startIdx + i} delay={50} />
                        </View>
                    );
                })}
            </View>
        );
    };

    if (isPlaying) {
        return (
            <View style={styles.rummyLive}>
                <View style={styles.loadingBox}>
                    <Text style={styles.waitingText}>🀄 Evaluating hands...</Text>
                    <Text style={styles.subText}>Dealer is calculating deadwood points</Text>
                </View>
            </View>
        );
    }

    if (isResult && round.result) {
        return (
            <ScrollView horizontal={false} contentContainerStyle={styles.resultArea}>
                <View style={styles.playerSection}>
                    <View style={styles.playerHeader}>
                        <Text style={styles.cardLabel}>🅰️ PLAYER A</Text>
                        <View style={[styles.statusTag, r.playerA?.isValid ? styles.validBg : styles.invalidBg]}>
                            <Text style={styles.statusText}>{r.playerA?.isValid ? 'VALID' : 'INVALID'}</Text>
                        </View>
                        <Text style={styles.pointsText}>Pts: {r.playerA?.deadwood ?? 80}</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fanScroll}>
                        {renderCardFan(r.playerA?.cards, 0)}
                    </ScrollView>
                </View>

                <View style={styles.vsSeparator}>
                    <View style={styles.line} />
                    <Text style={styles.vsText}>VS</Text>
                    <View style={styles.line} />
                </View>

                <View style={styles.playerSection}>
                    <View style={styles.playerHeader}>
                        <Text style={styles.cardLabel}>🅱️ PLAYER B</Text>
                        <View style={[styles.statusTag, r.playerB?.isValid ? styles.validBg : styles.invalidBg]}>
                            <Text style={styles.statusText}>{r.playerB?.isValid ? 'VALID' : 'INVALID'}</Text>
                        </View>
                        <Text style={styles.pointsText}>Pts: {r.playerB?.deadwood ?? 80}</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fanScroll}>
                        {renderCardFan(r.playerB?.cards, 13)}
                    </ScrollView>
                </View>

                <View style={styles.outcomeBadge}>
                    <Text style={styles.resultOutcome}>
                        {r.winner === 'TIE' ? "IT'S A DRAW" : `${r.winner?.replace('PLAYER_', 'PLAYER ')} WINS`}
                    </Text>
                    <Text style={styles.reasonText}>{r.winningReason || 'Lower points'}</Text>
                </View>
            </ScrollView>
        );
    }

    return (
        <View style={styles.waitingArea}>
            <Text style={styles.waitingText}>⏳ Shuffling Decks...</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    rummyLive: { width: '100%', alignItems: 'center', padding: 20 },
    loadingBox: { backgroundColor: '#1A1A2E', padding: 24, borderRadius: 16, borderWidth: 1, borderColor: '#2D2D44', alignItems: 'center' },
    resultArea: { alignItems: 'center', gap: 24, width: '100%', paddingBottom: 20 },
    playerSection: { width: '100%', gap: 12 },
    playerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12 },
    cardLabel: { color: '#9CA3AF', fontSize: 13, fontWeight: 'bold' },
    fanScroll: { width: '100%', height: 120 },
    fanContainer: { flexDirection: 'row', paddingRight: 60, paddingLeft: 4 },
    statusTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
    validBg: { backgroundColor: 'rgba(16, 185, 129, 0.2)' },
    invalidBg: { backgroundColor: 'rgba(239, 68, 68, 0.2)' },
    statusText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
    pointsText: { color: '#8B5CF6', fontSize: 13, fontWeight: 'bold' },
    vsSeparator: { flexDirection: 'row', alignItems: 'center', width: '50%', gap: 12 },
    line: { flex: 1, height: 1, backgroundColor: '#2D2D44' },
    vsText: { color: '#FFD700', fontSize: 16, fontWeight: '900', fontStyle: 'italic' },
    outcomeBadge: { backgroundColor: '#10B981', paddingVertical: 12, paddingHorizontal: 40, borderRadius: 16, marginTop: 8, alignItems: 'center' },
    resultOutcome: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
    reasonText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
    subText: { color: '#6B7280', fontSize: 12, marginTop: 4 },
    waitingArea: { padding: 40, alignItems: 'center' },
    waitingText: { color: '#9CA3AF', fontSize: 18, textAlign: 'center' },
});
