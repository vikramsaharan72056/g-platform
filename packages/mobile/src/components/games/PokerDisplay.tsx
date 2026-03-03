import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { GameComponentProps } from './types';
import { AnimatedCard } from './AnimatedCard';

export const PokerDisplay: React.FC<GameComponentProps> = ({ round }) => {
    const isPlaying = round.status === 'PLAYING';
    const isResult = round.status === 'RESULT' || round.status === 'SETTLED';
    const r = round.result || {};

    const parseCard = (cardStr: string) => {
        if (!cardStr) return { suit: '?', value: '?' };
        const suit = cardStr.slice(-1);
        const value = cardStr.slice(0, -1);
        return { suit, value };
    };

    const renderCardList = (cards: string[] = [], startIdx: number = 0) => {
        return (
            <View style={styles.cardRow}>
                {cards.map((c, i) => {
                    const { suit, value } = parseCard(c);
                    return <AnimatedCard key={`${c}-${i}`} suit={suit} value={value} index={startIdx + i} />;
                })}
            </View>
        );
    };

    if (isPlaying) {
        return (
            <View style={styles.pokerLive}>
                <View style={styles.vsRow}>
                    <View style={styles.playerSection}>
                        <Text style={styles.cardLabel}>🅰️ Player A</Text>
                        {renderCardList(r.holeCards?.playerA, 0)}
                    </View>
                    <View style={styles.playerSection}>
                        <Text style={styles.cardLabel}>🅱️ Player B</Text>
                        {renderCardList(r.holeCards?.playerB, 2)}
                    </View>
                </View>

                {/* Community Cards Section */}
                <View style={styles.boardSection}>
                    <Text style={styles.boardLabel}>COMMUNITY BOARD</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boardRow}>
                        {renderCardList(r.flop, 4)}
                        {r.turn && renderCardList([r.turn], 7)}
                        {r.river && renderCardList([r.river], 8)}
                    </ScrollView>
                </View>
            </View>
        );
    }

    if (isResult && round.result) {
        return (
            <View style={styles.resultArea}>
                <View style={styles.vsRow}>
                    <View style={styles.playerSection}>
                        <Text style={styles.cardLabel}>🅰️ Player A</Text>
                        {renderCardList(r.playerA?.holeCards, 0)}
                        <Text style={styles.handRank}>{r.playerA?.handName || ''}</Text>
                    </View>
                    <Text style={styles.vsText}>VS</Text>
                    <View style={styles.playerSection}>
                        <Text style={styles.cardLabel}>🅱️ Player B</Text>
                        {renderCardList(r.playerB?.holeCards, 2)}
                        <Text style={styles.handRank}>{r.playerB?.handName || ''}</Text>
                    </View>
                </View>

                <View style={styles.boardSection}>
                    <Text style={styles.boardLabel}>FINAL BOARD</Text>
                    <View style={styles.boardRow}>
                        {renderCardList(r.communityCards, 4)}
                    </View>
                </View>

                <View style={styles.outcomeBadge}>
                    <Text style={styles.resultOutcome}>
                        {r.winner === 'TIE' ? "IT'S A DRAW" : `${r.winner?.replace('PLAYER_', 'PLAYER ')} WINS`}
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.waitingArea}>
            <Text style={styles.waitingText}>⏳ Dealing New Round...</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    pokerLive: { width: '100%', alignItems: 'center', gap: 20 },
    resultArea: { alignItems: 'center', gap: 16, width: '100%' },
    vsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingHorizontal: 12 },
    playerSection: { alignItems: 'center', gap: 8 },
    cardLabel: { color: '#9CA3AF', fontSize: 13, fontWeight: 'bold', letterSpacing: 1 },
    cardRow: { flexDirection: 'row', gap: 4 },
    boardSection: { backgroundColor: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 16, width: '100%', alignItems: 'center' },
    boardLabel: { color: '#FFD700', fontSize: 10, fontWeight: 'bold', marginBottom: 12, opacity: 0.8 },
    boardRow: { flexDirection: 'row', justifyContent: 'center', minWidth: '100%' },
    vsText: { color: '#8B5CF6', fontSize: 24, fontWeight: '900', fontStyle: 'italic' },
    handRank: { color: '#10B981', fontSize: 12, fontWeight: 'bold', marginTop: 4, textTransform: 'uppercase' },
    outcomeBadge: { backgroundColor: '#10B981', paddingVertical: 8, paddingHorizontal: 24, borderRadius: 20, marginTop: 8 },
    resultOutcome: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    waitingArea: { padding: 40, alignItems: 'center' },
    waitingText: { color: '#9CA3AF', fontSize: 18, textAlign: 'center' },
});
