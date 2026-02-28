import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    SafeAreaView,
    Alert,
    TextInput,
} from 'react-native';
import { Colors } from '../constants/Colors';
import { Header } from '../components/Header';
import { PlayingCard } from '../components/PlayingCard';
import { Seat } from '../components/Seat';
import { Button } from '../components/Button';
import { useGameStore } from '../store/useGameStore';
import { socketService } from '../api/socketService';
import { ApiClient } from '../api/apiClient';
import type { BetChangeProposal } from '../types';

function formatChatTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getProposalStatusText(proposal: BetChangeProposal): string {
    if (proposal.status === 'PENDING_PLAYERS') return 'Waiting for players';
    if (proposal.status === 'PENDING_ADMIN') return 'Waiting for admin';
    if (proposal.status === 'APPROVED') return 'Approved';
    return 'Rejected';
}

export const GameScreen = () => {
    const user = useGameStore((state) => state.user);
    const table = useGameStore((state) => state.currentTable);
    const chatMessages = useGameStore((state) => state.chatMessages);
    const setCurrentTable = useGameStore((state) => state.setCurrentTable);
    const clearChatMessages = useGameStore((state) => state.clearChatMessages);
    const setLoading = useGameStore((state) => state.setLoading);
    const [selectedCard, setSelectedCard] = useState<string | null>(null);
    const [countdown, setCountdown] = useState(0);
    const [startingGame, setStartingGame] = useState(false);
    const [betDraft, setBetDraft] = useState('');
    const [betActionLoading, setBetActionLoading] = useState(false);
    const [chatDraft, setChatDraft] = useState('');

    const myUserId = table?.mySeat?.userId || user?.userId || null;
    const mySeat = useMemo(() => table?.seats.find((s) => s.userId === myUserId) || null, [table, myUserId]);
    const currentTurnUserId = table?.game?.turn.userId || null;
    const isMyTurn = Boolean(currentTurnUserId && myUserId && currentTurnUserId === myUserId);
    const hasDrawn = table?.game?.turn.hasDrawn;
    const isHost = Boolean(myUserId && table?.hostUserId === myUserId);
    const canStartGame = table?.status === 'WAITING' && (table?.currentPlayers || 0) >= 2 && isHost;
    const activeProposal = table?.betControl.activeProposal || null;

    const tableChatMessages = useMemo(() => {
        if (!table) return [];
        return chatMessages.filter((entry) => entry.tableId === table.id);
    }, [chatMessages, table?.id]);

    const participantIds = useMemo(() => {
        if (!table) return [];
        if (table.status !== 'IN_PROGRESS') {
            return table.seats.map((seat) => seat.userId);
        }
        const active = table.seats.filter((seat) => seat.status === 'ACTIVE').map((seat) => seat.userId);
        return active.length > 0 ? active : table.seats.map((seat) => seat.userId);
    }, [table]);

    const participantNames = useMemo(() => {
        if (!table || participantIds.length === 0) return '';
        return participantIds.map((id) => table.seats.find((seat) => seat.userId === id)?.name || id).join(', ');
    }, [table, participantIds]);

    const turnPlayerName = useMemo(() => {
        const turnUserId = table?.game?.turn.userId;
        if (!turnUserId) return null;
        return table?.seats.find((seat) => seat.userId === turnUserId)?.name || null;
    }, [table?.game?.turn.userId, table?.seats]);

    const winnerName = useMemo(() => {
        const winnerUserId = table?.game?.winnerUserId;
        if (!winnerUserId) return null;
        return table?.seats.find((seat) => seat.userId === winnerUserId)?.name || null;
    }, [table?.game?.winnerUserId, table?.seats]);

    const myProposalVote = useMemo(() => {
        if (!activeProposal || !myUserId) return null;
        if (activeProposal.playerApprovals.includes(myUserId)) return 'APPROVED';
        if (activeProposal.playerRejections.includes(myUserId)) return 'REJECTED';
        return null;
    }, [activeProposal, myUserId]);

    const canVoteOnProposal = Boolean(
        activeProposal &&
            activeProposal.status === 'PENDING_PLAYERS' &&
            myUserId &&
            participantIds.includes(myUserId),
    );
    const canProposeBetChange = Boolean(
        table &&
            table.status !== 'FINISHED' &&
            !table.betControl.isBlocked &&
            !activeProposal,
    );

    useEffect(() => {
        if (!table?.game?.turn.expiresAt) return;

        const interval = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((new Date(table.game!.turn.expiresAt).getTime() - Date.now()) / 1000));
            setCountdown(remaining);
        }, 1000);

        return () => clearInterval(interval);
    }, [table?.game?.turn.expiresAt]);

    useEffect(() => {
        if (!table) return;
        setBetDraft(String(table.betAmount));
    }, [table?.id, table?.betAmount]);

    const handleStartGame = async () => {
        if (!table || !canStartGame || startingGame) return;

        setStartingGame(true);
        setLoading(true);
        try {
            await ApiClient.post(`/tables/${table.id}/start`);
        } catch (err: any) {
            Alert.alert('Error', err.message);
        } finally {
            setStartingGame(false);
            setLoading(false);
        }
    };

    const handleBack = async () => {
        if (!table) return;

        setLoading(true);
        let canExit = true;

        if (table.status === 'WAITING') {
            try {
                await ApiClient.post(`/tables/${table.id}/leave`);
            } catch (err: any) {
                canExit = false;
                Alert.alert('Error', err.message);
            }
        }

        if (canExit) {
            socketService.unsubscribeTable(table.id);
            clearChatMessages();
            setCurrentTable(null);
        }

        setLoading(false);
    };

    const handleDrop = () => {
        if (!table || !isMyTurn) return;

        if (hasDrawn) {
            Alert.alert('Confirm Drop', 'You already drew this turn. Full drop penalty will apply.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Full Drop (-80)', style: 'destructive', onPress: () => socketService.drop(table.id, 'full') },
            ]);
            return;
        }

        Alert.alert('Choose Drop Type', 'Select your drop option.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'First Drop (-20)', onPress: () => socketService.drop(table.id, 'first') },
            { text: 'Middle Drop (-40)', onPress: () => socketService.drop(table.id, 'middle') },
            { text: 'Full Drop (-80)', style: 'destructive', onPress: () => socketService.drop(table.id, 'full') },
        ]);
    };

    const handleProposeBetChange = async () => {
        if (!table || !canProposeBetChange) return;

        const requestedAmount = Math.floor(Number(betDraft));
        if (!Number.isFinite(requestedAmount) || requestedAmount < 1) {
            Alert.alert('Invalid Bet', 'Please enter a valid bet amount.');
            return;
        }
        if (requestedAmount === table.betAmount) {
            Alert.alert('No Change', 'Please enter a different bet amount.');
            return;
        }

        setBetActionLoading(true);
        try {
            const updated = await ApiClient.post<any>(`/tables/${table.id}/bet-change/propose`, {
                betAmount: requestedAmount,
            });
            setCurrentTable(updated);
        } catch (err: any) {
            Alert.alert('Bet Change Failed', err.message || 'Could not submit bet change request.');
        } finally {
            setBetActionLoading(false);
        }
    };

    const handleRespondBetChange = async (approve: boolean) => {
        if (!table || !canVoteOnProposal) return;

        setBetActionLoading(true);
        try {
            const updated = await ApiClient.post<any>(`/tables/${table.id}/bet-change/respond`, { approve });
            setCurrentTable(updated);
        } catch (err: any) {
            Alert.alert('Response Failed', err.message || 'Could not submit your response.');
        } finally {
            setBetActionLoading(false);
        }
    };

    const handleSendChat = () => {
        if (!table) return;
        const message = chatDraft.replace(/\s+/g, ' ').trim();
        if (!message) return;
        socketService.sendChat(table.id, message);
        setChatDraft('');
    };

    if (!table) return null;

    return (
        <SafeAreaView style={styles.container}>
            <Header
                title={table.name}
                subtitle={`Bet Amount: Rs ${table.betAmount.toLocaleString()}`}
                showBack
                onBack={handleBack}
            />

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.policyBanner}>
                    <Text style={styles.policyTitle}>Chat Compliance Notice</Text>
                    <Text style={styles.policyText}>
                        Session chat is monitored by admin. Off-platform money settlement can trigger immediate bet lock.
                    </Text>
                </View>

                {table.betControl.isBlocked && (
                    <View style={styles.betLockBanner}>
                        <Text style={styles.betLockTitle}>Bet Change Blocked By Admin</Text>
                        <Text style={styles.betLockText}>
                            {table.betControl.blockedReason || 'Bet amount changes are blocked for this session.'}
                        </Text>
                    </View>
                )}

                <View style={styles.seatsGrid}>
                    {table.seats.map((seat) => (
                        <Seat
                            key={seat.userId}
                            seat={seat}
                            isMe={seat.userId === myUserId}
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
                            {canStartGame && (
                                <Button
                                    title={startingGame ? 'Starting...' : 'Start Game'}
                                    onPress={handleStartGame}
                                    style={styles.startBtn}
                                    disabled={startingGame}
                                />
                            )}
                            {!canStartGame && table.currentPlayers >= 2 && (
                                <Text style={styles.hostHint}>Only the host can start this game.</Text>
                            )}
                        </View>
                    ) : table.status === 'FINISHED' ? (
                        <View style={styles.finishedContainer}>
                            <Text style={styles.winnerText}>
                                {table.game?.winnerUserId === myUserId ? 'You won!' : `Winner: ${winnerName || 'Unknown'}`}
                            </Text>

                            {table.game?.settlement && (
                                <View style={styles.settlementTable}>
                                    {table.game.settlement.entries.map((entry) => (
                                        <View key={entry.userId} style={styles.settlementRow}>
                                            <Text style={styles.settlementName}>{entry.name}</Text>
                                            <Text style={styles.settlementPoints}>{entry.points} pts</Text>
                                            <Text
                                                style={[
                                                    styles.settlementAmount,
                                                    entry.amount > 0 ? { color: Colors.success } : { color: Colors.danger },
                                                ]}
                                            >
                                                {entry.amount > 0 ? '+' : ''}Rs {entry.amount}
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
                                {isMyTurn ? 'Your Turn' : `Waiting for ${turnPlayerName || 'another player'}`}
                            </Text>
                            {isMyTurn && <Text style={styles.countdown}>Ends in {countdown}s</Text>}
                        </View>
                    )}
                </View>

                <View style={styles.betControlCard}>
                    <Text style={styles.sectionTitle}>Bet Control</Text>
                    <Text style={styles.betCurrentText}>Current bet: Rs {table.betAmount.toLocaleString()}</Text>
                    {table.betControl.isBlocked && (
                        <Text style={styles.betBlockedHint}>Admin has blocked bet changes for this session.</Text>
                    )}
                    {!table.betControl.isBlocked && canProposeBetChange && (
                        <View style={styles.betInputRow}>
                            <TextInput
                                style={styles.betInput}
                                value={betDraft}
                                onChangeText={setBetDraft}
                                keyboardType="numeric"
                                placeholder="New bet amount"
                                placeholderTextColor={Colors.textMuted}
                            />
                            <Button
                                title={betActionLoading ? 'Submitting...' : 'Request Change'}
                                onPress={handleProposeBetChange}
                                disabled={betActionLoading}
                                size="small"
                                style={styles.betRequestButton}
                            />
                        </View>
                    )}

                    {activeProposal && (
                        <View style={styles.proposalCard}>
                            <Text style={styles.proposalTitle}>
                                Proposed bet: Rs {activeProposal.requestedAmount.toLocaleString()}
                            </Text>
                            <Text style={styles.proposalMeta}>
                                By {activeProposal.proposedByName} | {getProposalStatusText(activeProposal)}
                            </Text>
                            <Text style={styles.proposalMeta}>
                                Approvals: {activeProposal.playerApprovals.length} / {participantIds.length || 1}
                            </Text>
                            {participantNames ? <Text style={styles.proposalMeta}>Players: {participantNames}</Text> : null}
                            {myProposalVote ? (
                                <Text style={styles.proposalMeta}>Your response: {myProposalVote}</Text>
                            ) : null}
                            {activeProposal.adminDecisionReason ? (
                                <Text style={styles.proposalReason}>Admin note: {activeProposal.adminDecisionReason}</Text>
                            ) : null}

                            {canVoteOnProposal && (
                                <View style={styles.proposalActions}>
                                    <Button
                                        title="Approve"
                                        variant="success"
                                        size="small"
                                        onPress={() => handleRespondBetChange(true)}
                                        disabled={betActionLoading}
                                        style={styles.proposalActionBtn}
                                    />
                                    <Button
                                        title="Reject"
                                        variant="danger"
                                        size="small"
                                        onPress={() => handleRespondBetChange(false)}
                                        disabled={betActionLoading}
                                        style={styles.proposalActionBtn}
                                    />
                                </View>
                            )}
                        </View>
                    )}

                    {!activeProposal && table.betControl.lastResolvedProposal && (
                        <Text style={styles.lastResolvedText}>
                            Last request ({table.betControl.lastResolvedProposal.status}): Rs{' '}
                            {table.betControl.lastResolvedProposal.requestedAmount.toLocaleString()}
                        </Text>
                    )}
                </View>

                {table.status === 'IN_PROGRESS' && mySeat && (
                    <View style={styles.handArea}>
                        <View style={styles.handHeader}>
                            <Text style={styles.sectionTitle}>Your Hand</Text>
                            <View style={styles.handActions}>
                                <Button
                                    title={hasDrawn ? 'Drop (Full)' : 'Drop'}
                                    variant="danger"
                                    size="small"
                                    onPress={handleDrop}
                                    disabled={!isMyTurn}
                                />
                            </View>
                        </View>

                        <View style={styles.cardContainer}>
                            {(mySeat.hand || []).map((card, index) => {
                                const cardKey = `${card}-${index}`;
                                return (
                                    <View key={cardKey} style={styles.cardWrapper}>
                                        <PlayingCard
                                            card={card}
                                            selected={selectedCard === cardKey}
                                            onPress={() => setSelectedCard((prev) => (prev === cardKey ? null : cardKey))}
                                        />
                                    </View>
                                );
                            })}
                        </View>

                        <View style={styles.footerActions}>
                            <Button
                                title="Discard"
                                variant="primary"
                                disabled={!isMyTurn || !hasDrawn || !selectedCard}
                                onPress={() => {
                                    if (!selectedCard) return;
                                    const cardIndex = Number(selectedCard.split('-').pop());
                                    const cardToDiscard = Number.isFinite(cardIndex) ? mySeat.hand?.[cardIndex] : null;
                                    if (!cardToDiscard) {
                                        Alert.alert('Error', 'Selected card is no longer available.');
                                        return;
                                    }
                                    socketService.discardCard(table.id, cardToDiscard);
                                    setSelectedCard(null);
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

                <View style={styles.chatCard}>
                    <Text style={styles.sectionTitle}>Session Chat</Text>
                    <View style={styles.chatPolicyBanner}>
                        <Text style={styles.chatPolicyTitle}>Fixed Compliance Banner</Text>
                        <Text style={styles.chatPolicyText}>
                            Admin monitors this chat. If off-platform settlement is detected, bet amount can be blocked for both players.
                        </Text>
                    </View>

                    <ScrollView
                        style={styles.chatMessages}
                        contentContainerStyle={styles.chatMessagesContent}
                        nestedScrollEnabled
                    >
                        {tableChatMessages.length === 0 ? (
                            <Text style={styles.chatEmptyText}>No session messages yet.</Text>
                        ) : (
                            tableChatMessages.map((message) => {
                                const isMine = Boolean(myUserId && message.userId === myUserId);
                                const bubbleStyle =
                                    message.role === 'SYSTEM'
                                        ? styles.chatBubbleSystem
                                        : message.role === 'ADMIN'
                                            ? styles.chatBubbleAdmin
                                            : isMine
                                                ? styles.chatBubbleMine
                                                : styles.chatBubbleOther;

                                return (
                                    <View
                                        key={message.id}
                                        style={[styles.chatRow, isMine ? styles.chatRowMine : styles.chatRowOther]}
                                    >
                                        <View style={[styles.chatBubble, bubbleStyle]}>
                                            <Text style={styles.chatAuthor}>
                                                {message.role === 'SYSTEM'
                                                    ? 'System'
                                                    : `${message.userName}${isMine ? ' (You)' : ''}`}
                                            </Text>
                                            <Text style={styles.chatText}>{message.message}</Text>
                                            <Text style={styles.chatTime}>{formatChatTime(message.createdAt)}</Text>
                                        </View>
                                    </View>
                                );
                            })
                        )}
                    </ScrollView>

                    <View style={styles.chatComposer}>
                        <TextInput
                            style={styles.chatInput}
                            value={chatDraft}
                            onChangeText={setChatDraft}
                            placeholder="Type a message..."
                            placeholderTextColor={Colors.textMuted}
                            editable={table.status !== 'FINISHED'}
                            maxLength={300}
                        />
                        <Button
                            title="Send"
                            size="small"
                            onPress={handleSendChat}
                            disabled={table.status === 'FINISHED' || chatDraft.trim().length === 0}
                            style={styles.chatSendBtn}
                        />
                    </View>
                </View>
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
    policyBanner: {
        backgroundColor: '#1f2937',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#374151',
        padding: 12,
        marginBottom: 12,
    },
    policyTitle: {
        color: Colors.warning,
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 4,
    },
    policyText: {
        color: '#d1d5db',
        fontSize: 12,
        lineHeight: 18,
    },
    betLockBanner: {
        backgroundColor: '#7f1d1d',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#ef4444',
        padding: 12,
        marginBottom: 12,
    },
    betLockTitle: {
        color: '#fecaca',
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 2,
    },
    betLockText: {
        color: '#fee2e2',
        fontSize: 12,
        lineHeight: 18,
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
    hostHint: {
        marginTop: 10,
        color: Colors.textMuted,
        fontSize: 12,
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
    betControlCard: {
        backgroundColor: Colors.cardBg,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: 14,
        marginBottom: 16,
    },
    betCurrentText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
    },
    betBlockedHint: {
        color: '#fca5a5',
        fontSize: 12,
        marginBottom: 8,
    },
    betInputRow: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
        marginBottom: 8,
    },
    betInput: {
        flex: 1,
        backgroundColor: Colors.surface,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.border,
        color: '#fff',
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 14,
    },
    betRequestButton: {
        minWidth: 120,
    },
    proposalCard: {
        marginTop: 8,
        backgroundColor: Colors.surface,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: 10,
        gap: 4,
    },
    proposalTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
    proposalMeta: {
        color: Colors.textMuted,
        fontSize: 12,
    },
    proposalReason: {
        color: Colors.warning,
        fontSize: 12,
        marginTop: 2,
    },
    proposalActions: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 8,
    },
    proposalActionBtn: {
        flex: 1,
    },
    lastResolvedText: {
        marginTop: 8,
        color: Colors.textMuted,
        fontSize: 12,
    },
    handArea: {
        backgroundColor: Colors.cardBg,
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: Colors.border,
        marginBottom: 16,
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
    chatCard: {
        backgroundColor: Colors.cardBg,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: 14,
    },
    chatPolicyBanner: {
        backgroundColor: '#1f2937',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#374151',
        padding: 10,
        marginTop: 10,
        marginBottom: 10,
    },
    chatPolicyTitle: {
        color: Colors.warning,
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 3,
    },
    chatPolicyText: {
        color: '#d1d5db',
        fontSize: 12,
        lineHeight: 17,
    },
    chatMessages: {
        maxHeight: 220,
        backgroundColor: Colors.surface,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: Colors.border,
        marginBottom: 10,
    },
    chatMessagesContent: {
        padding: 8,
        gap: 8,
    },
    chatEmptyText: {
        color: Colors.textMuted,
        fontSize: 12,
        textAlign: 'center',
        paddingVertical: 10,
    },
    chatRow: {
        flexDirection: 'row',
    },
    chatRowMine: {
        justifyContent: 'flex-end',
    },
    chatRowOther: {
        justifyContent: 'flex-start',
    },
    chatBubble: {
        maxWidth: '88%',
        borderRadius: 8,
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderWidth: 1,
    },
    chatBubbleMine: {
        backgroundColor: '#1d4ed8',
        borderColor: '#2563eb',
    },
    chatBubbleOther: {
        backgroundColor: '#374151',
        borderColor: '#4b5563',
    },
    chatBubbleAdmin: {
        backgroundColor: '#14532d',
        borderColor: '#22c55e',
    },
    chatBubbleSystem: {
        backgroundColor: '#3f3f46',
        borderColor: '#71717a',
    },
    chatAuthor: {
        color: '#e5e7eb',
        fontSize: 11,
        fontWeight: '700',
        marginBottom: 2,
    },
    chatText: {
        color: '#fff',
        fontSize: 13,
        lineHeight: 18,
    },
    chatTime: {
        marginTop: 3,
        color: '#d1d5db',
        fontSize: 10,
        textAlign: 'right',
    },
    chatComposer: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
    },
    chatInput: {
        flex: 1,
        backgroundColor: Colors.surface,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.border,
        paddingHorizontal: 10,
        paddingVertical: 8,
        color: '#fff',
        fontSize: 14,
    },
    chatSendBtn: {
        minWidth: 72,
    },
});
