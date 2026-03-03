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

// Modular Game Components
import { RoundState, BetOption } from '../../src/components/games/types';
import { AviatorDisplay } from '../../src/components/games/AviatorDisplay';
import { SevenUpDownDisplay } from '../../src/components/games/SevenUpDownDisplay';
import { DragonTigerDisplay } from '../../src/components/games/DragonTigerDisplay';
import { TeenPattiDisplay } from '../../src/components/games/TeenPattiDisplay';
import { RummyDisplay } from '../../src/components/games/RummyDisplay';
import { PokerDisplay } from '../../src/components/games/PokerDisplay';
import { LudoDisplay } from '../../src/components/games/LudoDisplay';
import { BetPanel } from '../../src/components/games/BetPanel';

// ======================== RENDERERS = [STAGE & PERFORMER] ========================
const GAME_RENDERERS: Record<string, React.FC<any>> = {
    'seven-up-down': SevenUpDownDisplay,
    'dragon-tiger': DragonTigerDisplay,
    'teen-patti': TeenPattiDisplay,
    rummy: RummyDisplay,
    aviator: AviatorDisplay,
    poker: PokerDisplay,
    ludo: LudoDisplay,
};

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
    ludo: [
        { type: 'red', label: 'Red Wins', odds: '3.8x', color: '#EF4444', emoji: '🔴' },
        { type: 'blue', label: 'Blue Wins', odds: '3.8x', color: '#3B82F6', emoji: '🔵' },
        { type: 'green', label: 'Green Wins', odds: '3.8x', color: '#10B981', emoji: '🟢' },
        { type: 'yellow', label: 'Yellow Wins', odds: '3.8x', color: '#F59E0B', emoji: '🟡' },
    ],
};

const GAME_TITLES: Record<string, string> = {
    'seven-up-down': '7 Up Down 🎲',
    'dragon-tiger': 'Dragon Tiger 🐉🐯',
    'teen-patti': 'Teen Patti 🃏',
    rummy: 'Rummy 🀄',
    aviator: 'Aviator ✈️',
    poker: 'Poker ♠️',
    ludo: 'Ludo 🎲',
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

    // ======================== THE DYNAMIC RENDERER ========================
    const renderGameContent = () => {
        const Renderer = GAME_RENDERERS[slug || ''];
        if (!Renderer) {
            return <Text style={styles.waitingText}>Game Interface Not Found</Text>;
        }

        return (
            <Renderer
                round={round}
                slug={slug as string}
                extraData={{
                    multiplier: aviatorMultiplier,
                    hasCashedOut,
                    onCashout: handleAviatorCashout,
                    activeBetId,
                    betAmount
                }}
            />
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
                    {renderGameContent()}
                </View>

                {/* Bet Options */}
                {round.status === 'BETTING' && (
                    <BetPanel
                        options={betOptions}
                        selectedBet={selectedBet}
                        onSelectBet={setSelectedBet}
                        betAmount={betAmount}
                        onAmountChange={setBetAmount}
                        onPlaceBet={placeBet}
                    />
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
    settlementBox: {
        backgroundColor: '#1A1A2E', borderRadius: 12, padding: 16, marginTop: 16,
        borderWidth: 1, borderColor: '#2D2D44', alignItems: 'center',
    },
    settlementTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    settlementText: { color: '#9CA3AF', fontSize: 14 },
});
