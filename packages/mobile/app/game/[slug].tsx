import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Alert,
    Animated,
    SafeAreaView,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { gamesApi, walletApi } from '../../src/services/api';
import { connectSocket, disconnectSocket } from '../../src/services/socket';

// ======================== TYPES ========================
interface RoundState {
    roundId: string | null;
    roundNumber: number;
    status: 'WAITING' | 'BETTING' | 'LOCKED' | 'PLAYING' | 'RESULT' | 'SETTLED';
    bettingEndsAt: string | null;
    result: any;
    settlement: any;
}

interface BetOption {
    type: string;
    label: string;
    odds: string;
    color: string;
    emoji: string;
}

// ======================== BET OPTIONS ========================
const GAME_BET_OPTIONS: Record<string, BetOption[]> = {
    'seven-up-down': [
        { type: 'down', label: 'Down (2-6)', odds: '2x', color: '#EF4444', emoji: '⬇️' },
        { type: 'seven', label: 'Lucky 7', odds: '5x', color: '#FFD700', emoji: '7️⃣' },
        { type: 'up', label: 'Up (8-12)', odds: '2x', color: '#10B981', emoji: '⬆️' },
    ],
    'dragon-tiger': [
        { type: 'dragon', label: 'Dragon', odds: '1.95x', color: '#EF4444', emoji: '🐉' },
        { type: 'tie', label: 'Tie', odds: '11x', color: '#FFD700', emoji: '🤝' },
        { type: 'tiger', label: 'Tiger', odds: '1.95x', color: '#F59E0B', emoji: '🐯' },
    ],
    'teen-patti': [
        { type: 'player_a', label: 'Player A', odds: '1.95x', color: '#3B82F6', emoji: '🅰️' },
        { type: 'tie', label: 'Tie', odds: '25x', color: '#FFD700', emoji: '🤝' },
        { type: 'player_b', label: 'Player B', odds: '1.95x', color: '#EF4444', emoji: '🅱️' },
    ],
    rummy: [
        { type: 'player_a', label: 'Player A', odds: '1.95x', color: '#3B82F6', emoji: '🅰️' },
        { type: 'tie', label: 'Tie', odds: '8x', color: '#FFD700', emoji: '🤝' },
        { type: 'player_b', label: 'Player B', odds: '1.95x', color: '#EF4444', emoji: '🅱️' },
    ],
    aviator: [
        { type: 'manual', label: 'Bet & Cashout', odds: '∞x', color: '#8B5CF6', emoji: '✈️' },
    ],
    poker: [
        { type: 'player_a', label: 'Player A', odds: '1.95x', color: '#3B82F6', emoji: '🅰️' },
        { type: 'tie', label: 'Tie', odds: '20x', color: '#FFD700', emoji: '🤝' },
        { type: 'player_b', label: 'Player B', odds: '1.95x', color: '#EF4444', emoji: '🅱️' },
    ],
};

const GAME_TITLES: Record<string, string> = {
    'seven-up-down': '7 Up Down 🎲',
    'dragon-tiger': 'Dragon Tiger 🐉🐯',
    'teen-patti': 'Teen Patti 🃏',
    rummy: 'Rummy 🀄',
    aviator: 'Aviator ✈️',
    poker: 'Poker ♠️',
};

// ======================== MAIN COMPONENT ========================
export default function GameScreen() {
    const { slug } = useLocalSearchParams<{ slug: string }>();
    const [round, setRound] = useState<RoundState>({
        roundId: null, roundNumber: 0, status: 'WAITING',
        bettingEndsAt: null, result: null, settlement: null,
    });
    const [selectedBet, setSelectedBet] = useState<string | null>(null);
    const [betAmount, setBetAmount] = useState('100');
    const [countdown, setCountdown] = useState(0);
    const [balance, setBalance] = useState(0);
    const [gameId, setGameId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [aviatorMultiplier, setAviatorMultiplier] = useState(1.0);
    const [hasCashedOut, setHasCashedOut] = useState(false);
    const [activeBetId, setActiveBetId] = useState<string | null>(null);

    const socketRef = useRef<any>(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const countdownRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

    const betOptions = GAME_BET_OPTIONS[slug || ''] || [];
    const gameTitle = GAME_TITLES[slug || ''] || slug || 'Game';

    useEffect(() => {
        loadGame();
        return () => {
            if (socketRef.current) disconnectSocket();
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, []);

    const loadGame = async () => {
        try {
            const [gameRes, walletRes] = await Promise.all([
                gamesApi.getAll(),
                walletApi.getBalance(),
            ]);
            const game = gameRes.data.find((g: any) => g.slug === slug);
            if (game) {
                setGameId(game.id);
                initSocket(game.id);
            }
            setBalance(walletRes.data.balance || 0);
        } catch (err) {
            console.error('Failed to load game:', err);
        } finally {
            setLoading(false);
        }
    };

    const initSocket = async (gId: string) => {
        const socket = await connectSocket();
        socketRef.current = socket;
        socket.emit('join:game', { gameId: gId });

        socket.on('round:created', (data: any) => {
            setRound({
                roundId: data.roundId, roundNumber: data.roundNumber,
                status: 'BETTING', bettingEndsAt: data.bettingEndsAt,
                result: null, settlement: null,
            });
            setSelectedBet(null);
            setHasCashedOut(false);
            setActiveBetId(null);
            setAviatorMultiplier(1.0);
            startCountdown(data.bettingEndsAt);
        });

        socket.on('round:locked', () => {
            setRound((prev) => ({ ...prev, status: 'LOCKED' }));
            setCountdown(0);
        });

        socket.on('round:result', (data: any) => {
            setRound((prev) => ({ ...prev, status: 'RESULT', result: data.result }));
        });

        socket.on('round:settled', (data: any) => {
            setRound((prev) => ({ ...prev, status: 'SETTLED', settlement: data.settlement }));
            refreshBalance();
        });

        // Aviator-specific events
        socket.on('aviator:takeoff', () => {
            setRound((prev) => ({ ...prev, status: 'PLAYING' }));
            setAviatorMultiplier(1.0);
        });

        socket.on('aviator:multiplier', (data: any) => {
            setAviatorMultiplier(data.multiplier);
        });

        socket.on('aviator:crash', (data: any) => {
            setRound((prev) => ({
                ...prev, status: 'RESULT',
                result: { crashPoint: data.crashPoint },
            }));
        });

        socket.on('aviator:cashout:success', (data: any) => {
            setHasCashedOut(true);
            Alert.alert('Cashed Out! 💰', `You cashed out at ${data.multiplier}x!\nPayout: ₹${data.payout}`);
            refreshBalance();
        });

        // Poker-specific events
        socket.on('poker:hole_cards', (data: any) => {
            setRound((prev) => ({ ...prev, status: 'PLAYING', result: { ...prev.result, holeCards: data } }));
        });
        socket.on('poker:flop', (data: any) => {
            setRound((prev) => ({ ...prev, result: { ...prev.result, flop: data.cards } }));
        });
        socket.on('poker:turn', (data: any) => {
            setRound((prev) => ({ ...prev, result: { ...prev.result, turn: data.card } }));
        });
        socket.on('poker:river', (data: any) => {
            setRound((prev) => ({ ...prev, result: { ...prev.result, river: data.card } }));
        });
    };

    const startCountdown = (endTime: string) => {
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((new Date(endTime).getTime() - Date.now()) / 1000));
            setCountdown(remaining);
            if (remaining <= 0 && countdownRef.current) clearInterval(countdownRef.current);
        }, 1000);
    };

    const refreshBalance = async () => {
        try {
            const res = await walletApi.getBalance();
            setBalance(res.data.balance || 0);
        } catch { }
    };

    const placeBet = async () => {
        if (!round.roundId || !selectedBet || round.status !== 'BETTING') return;
        const amount = parseFloat(betAmount);
        if (isNaN(amount) || amount <= 0) {
            Alert.alert('Invalid Amount', 'Please enter a valid bet amount');
            return;
        }
        try {
            const res = await gamesApi.placeBet({
                roundId: round.roundId,
                betType: selectedBet,
                amount,
            });
            setActiveBetId(res.data?.bet?.id || null);
            Alert.alert('Bet Placed! ✅', `₹${amount} on ${selectedBet}`);
            refreshBalance();
            startPulse();
        } catch (err: any) {
            Alert.alert('Bet Failed', err?.response?.data?.message || 'Could not place bet');
        }
    };

    const handleAviatorCashout = () => {
        if (!socketRef.current || !gameId || !activeBetId || hasCashedOut) return;
        socketRef.current.emit('aviator:cashout', {
            gameId,
            betId: activeBetId,
            userId: '', // Will be resolved from JWT on server
        });
    };

    const startPulse = () => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.05, duration: 500, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            ])
        ).start();
    };

    // ======================== RESULT RENDERERS ========================
    const renderResult = () => {
        if (!round.result) return null;

        switch (slug) {
            case 'seven-up-down':
                return renderDiceResult();
            case 'dragon-tiger':
                return renderDragonTigerResult();
            case 'teen-patti':
                return renderTeenPattiResult();
            case 'rummy':
                return renderRummyResult();
            case 'aviator':
                return renderAviatorResult();
            case 'poker':
                return renderPokerResult();
            default:
                return <Text style={styles.resultText}>Result: {JSON.stringify(round.result)}</Text>;
        }
    };

    const diceEmoji = (val: number) => ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][val] || '🎲';

    const renderDiceResult = () => {
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
    };

    const renderDragonTigerResult = () => {
        const r = round.result;
        const cardDisplay = (card: any) => `${card?.value || '?'}${(card?.suit || '?')[0]}`;
        return (
            <View style={styles.resultArea}>
                <View style={styles.vsRow}>
                    <View style={styles.cardBox}>
                        <Text style={styles.cardLabel}>🐉 Dragon</Text>
                        <Text style={styles.cardValue}>{cardDisplay(r.dragonCard)}</Text>
                    </View>
                    <Text style={styles.vsText}>VS</Text>
                    <View style={styles.cardBox}>
                        <Text style={styles.cardLabel}>🐯 Tiger</Text>
                        <Text style={styles.cardValue}>{cardDisplay(r.tigerCard)}</Text>
                    </View>
                </View>
                <Text style={[styles.resultOutcome, { color: r.winner === 'TIE' ? '#FFD700' : '#10B981' }]}>
                    {r.winner === 'TIE' ? "It's a Tie!" : `${r.winner} Wins!`}
                </Text>
            </View>
        );
    };

    const renderTeenPattiResult = () => {
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
    };

    const formatRummyCards = (cards?: string[]) => {
        if (!cards || cards.length === 0) return '?';
        const firstLine = cards.slice(0, 7).join(' ');
        const secondLine = cards.slice(7).join(' ');
        return secondLine ? `${firstLine}\n${secondLine}` : firstLine;
    };

    const renderRummyResult = () => {
        const r = round.result;
        return (
            <View style={styles.resultArea}>
                <View style={styles.vsRow}>
                    <View style={styles.cardBox}>
                        <Text style={styles.cardLabel}>🅰️ Player A</Text>
                        <Text style={styles.cardValue}>{formatRummyCards(r.playerA?.cards)}</Text>
                        <Text style={styles.handRank}>
                            Valid: {r.playerA?.isValid ? 'Yes' : 'No'} | Deadwood: {r.playerA?.deadwood ?? '-'}
                        </Text>
                    </View>
                    <Text style={styles.vsText}>VS</Text>
                    <View style={styles.cardBox}>
                        <Text style={styles.cardLabel}>🅱️ Player B</Text>
                        <Text style={styles.cardValue}>{formatRummyCards(r.playerB?.cards)}</Text>
                        <Text style={styles.handRank}>
                            Valid: {r.playerB?.isValid ? 'Yes' : 'No'} | Deadwood: {r.playerB?.deadwood ?? '-'}
                        </Text>
                    </View>
                </View>
                <Text style={[styles.resultOutcome, { color: '#10B981' }]}>
                    {r.winner === 'TIE' ? "It's a Tie!" : `${r.winner?.replace('_', ' ')} Wins!`}
                </Text>
                <Text style={styles.resultValue}>{r.winningReason || ''}</Text>
            </View>
        );
    };

    const renderAviatorResult = () => {
        const r = round.result;
        return (
            <View style={styles.resultArea}>
                <Text style={styles.resultEmoji}>💥</Text>
                <Text style={styles.resultValue}>Crashed at</Text>
                <Text style={[styles.multiplierText, { color: '#EF4444' }]}>{r.crashPoint}x</Text>
            </View>
        );
    };

    const renderPokerResult = () => {
        const r = round.result;
        return (
            <View style={styles.resultArea}>
                <View style={styles.vsRow}>
                    <View style={styles.cardBox}>
                        <Text style={styles.cardLabel}>🅰️ Player A</Text>
                        <Text style={styles.cardValue}>{r.playerA?.holeCards?.join(' ') || '?'}</Text>
                        <Text style={styles.handRank}>{r.playerA?.handName || ''}</Text>
                    </View>
                    <Text style={styles.vsText}>VS</Text>
                    <View style={styles.cardBox}>
                        <Text style={styles.cardLabel}>🅱️ Player B</Text>
                        <Text style={styles.cardValue}>{r.playerB?.holeCards?.join(' ') || '?'}</Text>
                        <Text style={styles.handRank}>{r.playerB?.handName || ''}</Text>
                    </View>
                </View>
                {r.communityCards && (
                    <Text style={styles.communityCards}>Board: {r.communityCards.join(' ')}</Text>
                )}
                <Text style={[styles.resultOutcome, { color: '#10B981' }]}>
                    {r.winner === 'TIE' ? "It's a Tie!" : `${r.winner?.replace('_', ' ')} Wins!`}
                </Text>
            </View>
        );
    };

    // ======================== AVIATOR LIVE DISPLAY ========================
    const renderAviatorLive = () => {
        if (slug !== 'aviator' || round.status !== 'PLAYING') return null;
        return (
            <View style={styles.aviatorLive}>
                <Text style={styles.planeEmoji}>✈️</Text>
                <Text style={[styles.multiplierText, { color: aviatorMultiplier > 2 ? '#10B981' : '#fff' }]}>
                    {aviatorMultiplier.toFixed(2)}x
                </Text>
                {activeBetId && !hasCashedOut && (
                    <TouchableOpacity style={styles.cashoutBtn} onPress={handleAviatorCashout}>
                        <Text style={styles.cashoutText}>💰 CASH OUT</Text>
                    </TouchableOpacity>
                )}
                {hasCashedOut && (
                    <Text style={styles.cashedOutText}>✅ Cashed Out!</Text>
                )}
            </View>
        );
    };

    // ======================== POKER LIVE DISPLAY ========================
    const renderPokerLive = () => {
        if (slug !== 'poker' || round.status !== 'PLAYING') return null;
        const r = round.result || {};
        return (
            <View style={styles.pokerLive}>
                {r.holeCards && (
                    <View style={styles.vsRow}>
                        <View style={styles.cardBox}>
                            <Text style={styles.cardLabel}>🅰️ Player A</Text>
                            <Text style={styles.cardValue}>{r.holeCards.playerA?.join(' ') || '...'}</Text>
                        </View>
                        <View style={styles.cardBox}>
                            <Text style={styles.cardLabel}>🅱️ Player B</Text>
                            <Text style={styles.cardValue}>{r.holeCards.playerB?.join(' ') || '...'}</Text>
                        </View>
                    </View>
                )}
                <View style={styles.communityRow}>
                    {r.flop && <Text style={styles.communityCards}>Flop: {r.flop.join(' ')}</Text>}
                    {r.turn && <Text style={styles.communityCards}>Turn: {r.turn}</Text>}
                    {r.river && <Text style={styles.communityCards}>River: {r.river}</Text>}
                </View>
            </View>
        );
    };

    // ======================== STATUS BADGE ========================
    const statusColors: Record<string, string> = {
        WAITING: '#6B7280', BETTING: '#10B981', LOCKED: '#F59E0B',
        PLAYING: '#8B5CF6', RESULT: '#3B82F6', SETTLED: '#6B7280',
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color="#8B5CF6" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scroll}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Text style={styles.backBtn}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>{gameTitle}</Text>
                    <Text style={styles.balance}>₹{Number(balance).toFixed(2)}</Text>
                </View>

                {/* Round Info */}
                <View style={styles.roundInfo}>
                    <Text style={styles.roundNumber}>Round #{round.roundNumber}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusColors[round.status] }]}>
                        <Text style={styles.statusText}>{round.status}</Text>
                    </View>
                    {round.status === 'BETTING' && countdown > 0 && (
                        <Text style={styles.countdown}>{countdown}s</Text>
                    )}
                </View>

                {/* Game Display Area */}
                <View style={styles.gameArea}>
                    {(round.status === 'RESULT' || round.status === 'SETTLED') && renderResult()}
                    {renderAviatorLive()}
                    {renderPokerLive()}
                    {round.status === 'WAITING' && (
                        <Text style={styles.waitingText}>⏳ Next round starting soon...</Text>
                    )}
                    {round.status === 'LOCKED' && slug !== 'aviator' && (
                        <Text style={styles.waitingText}>🔒 Bets Locked! Preparing result...</Text>
                    )}
                    {round.status === 'PLAYING' && slug === 'seven-up-down' && (
                        <Text style={styles.waitingText}>🎲 Rolling dice...</Text>
                    )}
                    {round.status === 'PLAYING' && slug === 'dragon-tiger' && (
                        <Text style={styles.waitingText}>🃏 Dealing cards...</Text>
                    )}
                    {round.status === 'PLAYING' && slug === 'teen-patti' && (
                        <Text style={styles.waitingText}>🃏 Dealing hands...</Text>
                    )}
                    {round.status === 'PLAYING' && slug === 'rummy' && (
                        <Text style={styles.waitingText}>🀄 Evaluating rummy hands...</Text>
                    )}
                </View>

                {/* Bet Options */}
                {round.status === 'BETTING' && (
                    <View style={styles.betSection}>
                        <Text style={styles.sectionTitle}>Place Your Bet</Text>

                        <View style={styles.betOptions}>
                            {betOptions.map((opt) => (
                                <TouchableOpacity
                                    key={opt.type}
                                    style={[
                                        styles.betCard,
                                        { borderColor: opt.color },
                                        selectedBet === opt.type && { backgroundColor: opt.color + '30', borderWidth: 2 },
                                    ]}
                                    onPress={() => setSelectedBet(opt.type)}
                                >
                                    <Text style={styles.betEmoji}>{opt.emoji}</Text>
                                    <Text style={styles.betLabel}>{opt.label}</Text>
                                    <Text style={[styles.betOdds, { color: opt.color }]}>{opt.odds}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Amount Input */}
                        <View style={styles.amountRow}>
                            <TextInput
                                style={styles.amountInput}
                                value={betAmount}
                                onChangeText={setBetAmount}
                                keyboardType="numeric"
                                placeholder="Amount"
                                placeholderTextColor="#666"
                            />
                            {[50, 100, 500, 1000].map((val) => (
                                <TouchableOpacity key={val} style={styles.quickBtn} onPress={() => setBetAmount(val.toString())}>
                                    <Text style={styles.quickBtnText}>₹{val}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TouchableOpacity
                            style={[styles.placeBetBtn, !selectedBet && styles.disabledBtn]}
                            onPress={placeBet}
                            disabled={!selectedBet}
                        >
                            <Text style={styles.placeBetText}>
                                Place Bet — ₹{betAmount} on {selectedBet || '...'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Settlement Info */}
                {round.settlement && (
                    <View style={styles.settlementBox}>
                        <Text style={styles.settlementTitle}>Round Settled</Text>
                        <Text style={styles.settlementText}>
                            Total Bets: {round.settlement.totalBets} | Payout: ₹{round.settlement.totalPayout}
                        </Text>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

// ======================== STYLES ========================
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F0F23' },
    scroll: { padding: 16 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    backBtn: { color: '#8B5CF6', fontSize: 16, fontWeight: '600' },
    title: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
    balance: { color: '#10B981', fontSize: 16, fontWeight: '600' },
    roundInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    roundNumber: { color: '#9CA3AF', fontSize: 14 },
    statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
    statusText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
    countdown: { color: '#FFD700', fontSize: 24, fontWeight: 'bold', marginLeft: 'auto' },
    gameArea: {
        backgroundColor: '#1A1A2E', borderRadius: 16, padding: 24,
        minHeight: 180, justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: '#2D2D44', marginBottom: 16,
    },
    waitingText: { color: '#9CA3AF', fontSize: 18, textAlign: 'center' },
    resultArea: { alignItems: 'center', gap: 8 },
    resultEmoji: { fontSize: 48 },
    resultValue: { color: '#9CA3AF', fontSize: 16 },
    resultOutcome: { fontSize: 24, fontWeight: 'bold' },
    resultText: { color: '#fff', fontSize: 14 },
    vsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', width: '100%', gap: 8 },
    vsText: { color: '#FFD700', fontSize: 20, fontWeight: 'bold' },
    cardBox: { alignItems: 'center', backgroundColor: '#2D2D44', borderRadius: 12, padding: 12, flex: 1 },
    cardLabel: { color: '#9CA3AF', fontSize: 12, marginBottom: 4 },
    cardValue: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
    handRank: { color: '#8B5CF6', fontSize: 11, marginTop: 4, textAlign: 'center' },
    communityCards: { color: '#FFD700', fontSize: 16, textAlign: 'center', marginTop: 8 },
    multiplierText: { fontSize: 48, fontWeight: 'bold', color: '#fff' },
    aviatorLive: { alignItems: 'center', gap: 12 },
    planeEmoji: { fontSize: 64 },
    cashoutBtn: {
        backgroundColor: '#10B981', paddingVertical: 16, paddingHorizontal: 40,
        borderRadius: 12, marginTop: 8,
    },
    cashoutText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
    cashedOutText: { color: '#10B981', fontSize: 18, fontWeight: 'bold' },
    pokerLive: { width: '100%', gap: 12 },
    communityRow: { alignItems: 'center', gap: 4 },
    betSection: { gap: 12 },
    sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    betOptions: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    betCard: {
        flex: 1, backgroundColor: '#1A1A2E', borderRadius: 12, padding: 14,
        alignItems: 'center', borderWidth: 1, gap: 4,
    },
    betEmoji: { fontSize: 28 },
    betLabel: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },
    betOdds: { fontSize: 14, fontWeight: 'bold' },
    amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    amountInput: {
        flex: 1, backgroundColor: '#1A1A2E', borderRadius: 10, padding: 12,
        color: '#fff', fontSize: 16, borderWidth: 1, borderColor: '#2D2D44',
    },
    quickBtn: { backgroundColor: '#2D2D44', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8 },
    quickBtnText: { color: '#8B5CF6', fontSize: 13, fontWeight: '600' },
    placeBetBtn: {
        backgroundColor: '#8B5CF6', borderRadius: 12, paddingVertical: 16,
        alignItems: 'center',
    },
    disabledBtn: { opacity: 0.5 },
    placeBetText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    settlementBox: {
        backgroundColor: '#1A1A2E', borderRadius: 12, padding: 16, marginTop: 16,
        borderWidth: 1, borderColor: '#2D2D44', alignItems: 'center',
    },
    settlementTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    settlementText: { color: '#9CA3AF', fontSize: 14 },
});
