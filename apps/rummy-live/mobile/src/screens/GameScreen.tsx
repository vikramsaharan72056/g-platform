import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { Colors } from '../constants/Colors';
import { Header } from '../components/Header';
import { PlayingCard } from '../components/PlayingCard';
import { Seat } from '../components/Seat';
import { Button } from '../components/Button';
import { useGameStore } from '../store/useGameStore';
import { socketService } from '../api/socketService';
import { ApiClient } from '../api/apiClient';

export const GameScreen = () => {
    const user = useGameStore((state) => state.user);
    const table = useGameStore((state) => state.currentTable);
    const setCurrentTable = useGameStore((state) => state.setCurrentTable);
    const [selectedCard, setSelectedCard] = useState<string | null>(null);
    const [countdown, setCountdown] = useState(0);

    const mySeat = useMemo(
        () => table?.seats.find((s) => s.userId === user?.userId) || null,
        [table, user]
    );

    const isMyTurn = table?.game?.turn.userId === user?.userId;
    const hasDrawn = table?.game?.turn.hasDrawn;

    useEffect(() => {
        if (!table?.game?.turn.expiresAt) return;

        const interval = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((new Date(table.game!.turn.expiresAt).getTime() - Date.now()) / 1000));
            setCountdown(remaining);
        }, 1000);

        return () => clearInterval(interval);
    }, [table?.game?.turn.expiresAt]);

    const handleStartGame = async () => {
        if (!table) return;
        try {
            await ApiClient.post(`/tables/${table.id}/start`);
        } catch (err: any) {
            Alert.alert('Error', err.message);
        }
    };

    const handleBack = () => {
        setCurrentTable(null);
    };

    if (!table) return null;

    return (
        <SafeAreaView style={styles.container}>
            <Header
                title={table.name}
                subtitle={`Bet Amount: ₹${table.betAmount}`}
                showBack
                onBack={handleBack}
            />

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Players Area */}
                <View style={styles.seatsGrid}>
                    {table.seats.map((seat) => (
                        <Seat
                            key={seat.userId}
                            seat={seat}
                            isMe={seat.userId === user?.userId}
                            isCurrentTurn={table.game?.turn.userId === seat.userId}
                        />
                    ))}
                </View>

                {/* Board Pile Area */}
                {table.status === 'IN_PROGRESS' && table.game && (
                    <View style={styles.board}>
                        <View style={styles.pileGroup}>
                            <Text style={styles.pileLabel}>Closed ({table.game.closedCount})</Text>
                            <TouchableOpacity
                                style={styles.deckBack}
                                disabled={!isMyTurn || hasDrawn}
                                onPress={() => socketService.drawCard(table.id, 'closed')}
                            >
                                <Text style={styles.deckBackText}>BACK</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.pileGroup}>
                            <Text style={styles.pileLabel}>Open ({table.game.openTop || '-'})</Text>
                            {table.game.openTop ? (
                                <PlayingCard
                                    card={table.game.openTop}
                                    disabled={!isMyTurn || hasDrawn}
                                    onPress={() => socketService.drawCard(table.id, 'open')}
                                />
                            ) : (
                                <View style={[styles.deckBack, { backgroundColor: Colors.surface }]} />
                            )}
                        </View>

                        <View style={styles.pileGroup}>
                            <Text style={styles.pileLabel}>Wild Joker</Text>
                            {table.game.jokerCard ? (
                                <PlayingCard card={table.game.jokerCard} disabled />
                            ) : (
                                <View style={[styles.deckBack, { backgroundColor: Colors.surface }]} />
                            )}
                        </View>
                    </View>
                )}

                {/* Status / Message Area */}
                <View style={styles.statusArea}>
                    {table.status === 'WAITING' ? (
                        <View style={styles.waitingContainer}>
                            <Text style={styles.statusText}>Waiting for players...</Text>
                            <Text style={styles.playerCount}>{table.currentPlayers} / {table.maxPlayers}</Text>
                            {table.currentPlayers >= 2 && (
                                <Button title="Start Game" onPress={handleStartGame} style={styles.startBtn} />
                            )}
                        </View>
                    ) : table.status === 'FINISHED' ? (
                        <View style={styles.finishedContainer}>
                            <Text style={styles.winnerText}>
                                {table.game?.winnerUserId === user?.userId ? '🎉 You Won!' : `Winner: ${table.game?.winnerUserId}`}
                            </Text>

                            {table.game?.settlement && (
                                <View style={styles.settlementTable}>
                                    {table.game.settlement.entries.map((e) => (
                                        <View key={e.userId} style={styles.settlementRow}>
                                            <Text style={styles.settlementName}>{e.name}</Text>
                                            <Text style={styles.settlementPoints}>{e.points} pts</Text>
                                            <Text style={[styles.settlementAmount, e.amount > 0 ? { color: Colors.success } : { color: Colors.danger }]}>
                                                {e.amount > 0 ? '+' : ''}₹{e.amount}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            )}

                            <View style={{ gap: 12, width: '100%', maxWidth: 200, marginTop: 16 }}>
                                <Button title="Back to Lobby" variant="primary" onPress={handleBack} />
                            </View>
                        </View>
                    ) : (
                        <View style={styles.turnInfo}>
                            <Text style={[styles.turnStatus, isMyTurn && { color: Colors.warning }]}>
                                {isMyTurn ? "Your Turn" : `Waiting for ${table.game?.turn.userId}`}
                            </Text>
                            {isMyTurn && <Text style={styles.countdown}>Ends in {countdown}s</Text>}
                        </View>
                    )}
                </View>

                {/* Hand Area */}
                {table.status === 'IN_PROGRESS' && mySeat && (
                    <View style={styles.handArea}>
                        <View style={styles.handHeader}>
                            <Text style={styles.sectionTitle}>Your Hand</Text>
                            <View style={styles.handActions}>
                                <Button
                                    title="Drop"
                                    variant="danger"
                                    size="small"
                                    onPress={() => socketService.drop(table.id, 'first')}
                                    disabled={!isMyTurn || hasDrawn}
                                />
                            </View>
                        </View>

                        <View style={styles.cardContainer}>
                            {(mySeat.hand || []).map((card, idx) => (
                                <View key={`${card}-${idx}`} style={styles.cardWrapper}>
                                    <PlayingCard
                                        card={card}
                                        selected={selectedCard === card}
                                        onPress={() => setSelectedCard(card === selectedCard ? null : card)}
                                    />
                                </View>
                            ))}
                        </View>

                        <View style={styles.footerActions}>
                            <Button
                                title="Discard"
                                variant="primary"
                                disabled={!isMyTurn || !hasDrawn || !selectedCard}
                                onPress={() => {
                                    if (selectedCard) {
                                        socketService.discardCard(table.id, selectedCard);
                                        setSelectedCard(null);
                                    }
                                }}
                                style={styles.actionBtn}
                            />
                            <Button
                                title="Declare"
                                variant="success"
                                disabled={!isMyTurn || !hasDrawn}
                                onPress={() => socketService.declare(table.id)}
                                style={styles.actionBtn}
                            />
                        </View>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
    },
    seatsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    board: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        backgroundColor: '#064e3b', // Green felt color
        padding: 20,
        borderRadius: 20,
        marginBottom: 24,
        borderWidth: 4,
        borderColor: '#065f46',
    },
    pileGroup: {
        alignItems: 'center',
    },
    pileLabel: {
        color: '#d1fae5',
        fontSize: 10,
        fontWeight: 'bold',
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    deckBack: {
        width: 60,
        height: 85,
        backgroundColor: '#1d4ed8',
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    deckBackText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 10,
        transform: [{ rotate: '-45deg' }],
    },
    statusArea: {
        marginBottom: 24,
        alignItems: 'center',
    },
    waitingContainer: {
        alignItems: 'center',
    },
    statusText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    playerCount: {
        color: Colors.textMuted,
        fontSize: 14,
        marginTop: 4,
        marginBottom: 16,
    },
    startBtn: {
        width: 200,
    },
    finishedContainer: {
        alignItems: 'center',
    },
    winnerText: {
        color: Colors.gold,
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    turnInfo: {
        alignItems: 'center',
    },
    turnStatus: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    countdown: {
        color: Colors.danger,
        fontWeight: 'bold',
        marginTop: 4,
    },
    handArea: {
        backgroundColor: Colors.cardBg,
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    handHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    handActions: {
        flexDirection: 'row',
    },
    cardContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 20,
    },
    cardWrapper: {
        marginBottom: 10,
    },
    footerActions: {
        flexDirection: 'row',
        gap: 12,
    },
    actionBtn: {
        flex: 1,
    },
    settlementTable: {
        width: '100%',
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 12,
        marginVertical: 16,
    },
    settlementRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    settlementName: {
        color: '#fff',
        flex: 2,
        fontSize: 14,
    },
    settlementPoints: {
        color: Colors.textMuted,
        flex: 1,
        textAlign: 'center',
        fontSize: 14,
    },
    settlementAmount: {
        fontWeight: 'bold',
        flex: 1,
        textAlign: 'right',
        fontSize: 14,
    },
});
