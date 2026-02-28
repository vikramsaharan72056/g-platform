import React, { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ApiClient } from '../api/apiClient';
import { socketService } from '../api/socketService';
import { Button } from '../components/Button';
import { Colors } from '../constants/Colors';
import { useAviatorStore } from '../store/useAviatorStore';
import type { AviatorBet, RoundHistoryItem, RoundStatus, User } from '../types';

const STORAGE_KEY = 'aviator_user';

function formatMoney(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function getStatusColor(status: RoundStatus | undefined): string {
  switch (status) {
    case 'BETTING':
      return Colors.warning;
    case 'LOCKED':
      return '#7d8bb0';
    case 'PLAYING':
      return Colors.accent;
    case 'RESULT':
      return '#7a6af3';
    case 'SETTLED':
      return Colors.success;
    case 'CANCELLED':
      return Colors.danger;
    default:
      return Colors.textMuted;
  }
}

function parsePositive(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
}

export const AviatorScreen = () => {
  const user = useAviatorStore((state) => state.user);
  const round = useAviatorStore((state) => state.round);
  const bets = useAviatorStore((state) => state.bets);
  const history = useAviatorStore((state) => state.history);
  const multiplier = useAviatorStore((state) => state.multiplier);
  const lastCrashPoint = useAviatorStore((state) => state.lastCrashPoint);
  const isConnected = useAviatorStore((state) => state.isConnected);
  const isLoading = useAviatorStore((state) => state.isLoading);
  const setHistory = useAviatorStore((state) => state.setHistory);
  const setRoundSnapshot = useAviatorStore((state) => state.setRoundSnapshot);
  const setBalance = useAviatorStore((state) => state.setBalance);
  const setLoading = useAviatorStore((state) => state.setLoading);
  const setError = useAviatorStore((state) => state.setError);
  const setUser = useAviatorStore((state) => state.setUser);
  const updateBet = useAviatorStore((state) => state.updateBet);
  const upsertBet = useAviatorStore((state) => state.upsertBet);
  const resetSession = useAviatorStore((state) => state.resetSession);

  const [manualAmount, setManualAmount] = useState('100');
  const [autoAmount, setAutoAmount] = useState('100');
  const [autoTarget, setAutoTarget] = useState('2.00');
  const [placingManual, setPlacingManual] = useState(false);
  const [placingAuto, setPlacingAuto] = useState(false);
  const [refreshTick, setRefreshTick] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setRefreshTick(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [wallet, roundState, roundHistory] = await Promise.all([
        ApiClient.get<{ userId: string; balance: number }>('/wallet/me'),
        ApiClient.get<{ round: any; userBets: AviatorBet[] }>('/aviator/round/current'),
        ApiClient.get<RoundHistoryItem[]>('/aviator/round/history?limit=20'),
      ]);
      setBalance(wallet.balance);
      setRoundSnapshot(roundState);
      setHistory(roundHistory);
      socketService.requestRoundState();
    } catch (error: any) {
      setError(error?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const currentRoundBets = useMemo(
    () => (round ? bets.filter((bet) => bet.roundId === round.id) : []),
    [bets, round],
  );

  const canBet = round?.status === 'BETTING';
  const canCashout = round?.status === 'PLAYING';

  const bettingCountdownMs = useMemo(() => {
    if (!round || round.status !== 'BETTING') return 0;
    return Math.max(0, new Date(round.bettingEndAt).getTime() - refreshTick);
  }, [round, refreshTick]);

  const bettingCountdownLabel =
    round?.status === 'BETTING' ? `${Math.ceil(bettingCountdownMs / 1000)}s` : '--';

  const placeManualBet = async () => {
    const amount = parsePositive(manualAmount);
    if (!amount) {
      setError('Enter a valid manual bet amount');
      return;
    }
    setPlacingManual(true);
    try {
      const result = await ApiClient.post<{
        betId: string;
        roundId: string;
        amount: number;
        balanceAfter: number;
      }>('/aviator/bets', {
        amount,
        betType: 'manual',
      });
      upsertBet({
        id: result.betId,
        roundId: result.roundId,
        amount: result.amount,
        betType: 'manual',
        autoCashoutAt: null,
        status: 'PLACED',
        payout: 0,
        cashoutMultiplier: null,
      });
      setBalance(result.balanceAfter);
    } catch (error: any) {
      setError(error?.message || 'Unable to place manual bet');
    } finally {
      setPlacingManual(false);
    }
  };

  const placeAutoBet = async () => {
    const amount = parsePositive(autoAmount);
    const target = parsePositive(autoTarget);
    if (!amount) {
      setError('Enter a valid auto bet amount');
      return;
    }
    if (!target || target < 1.01 || target > 100) {
      setError('Auto cashout must be between 1.01 and 100');
      return;
    }

    setPlacingAuto(true);
    try {
      const result = await ApiClient.post<{
        betId: string;
        roundId: string;
        amount: number;
        autoCashoutAt: number;
        balanceAfter: number;
      }>('/aviator/bets', {
        amount,
        betType: 'auto_cashout',
        autoCashoutAt: target,
      });
      upsertBet({
        id: result.betId,
        roundId: result.roundId,
        amount: result.amount,
        betType: 'auto_cashout',
        autoCashoutAt: result.autoCashoutAt,
        status: 'PLACED',
        payout: 0,
        cashoutMultiplier: null,
      });
      setBalance(result.balanceAfter);
    } catch (error: any) {
      setError(error?.message || 'Unable to place auto bet');
    } finally {
      setPlacingAuto(false);
    }
  };

  const handleCashout = (betId: string) => {
    updateBet(betId, { status: 'PLACED' });
    socketService.requestCashout(betId);
  };

  const handleRefresh = async () => {
    await loadDashboard();
  };

  const handleLogout = () => {
    ApiClient.setToken(null);
    socketService.disconnect();
    resetSession();
    setUser(null);
    if (Platform.OS === 'web') {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Aviator Live</Text>
          <Text style={styles.subTitle}>
            {user?.name} | Balance Rs {formatMoney(user?.balance || 0)}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Text style={[styles.connectionBadge, { color: isConnected ? Colors.success : Colors.danger }]}>
            {isConnected ? 'Live' : 'Offline'}
          </Text>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.roundCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>
              Round #{round?.roundNumber ?? '--'}
            </Text>
            <Text style={[styles.statusTag, { borderColor: getStatusColor(round?.status), color: getStatusColor(round?.status) }]}>
              {round?.status || 'WAITING'}
            </Text>
          </View>

          <Text style={styles.meta}>Betting Timer: {bettingCountdownLabel}</Text>
          <Text style={styles.meta}>
            Hash: {round?.hash ? `${round.hash.slice(0, 10)}...` : '--'}
          </Text>

          <View style={styles.multiplierWrap}>
            <Text style={styles.multiplierValue}>{multiplier.toFixed(2)}x</Text>
            <Text style={styles.multiplierLabel}>
              {round?.status === 'PLAYING'
                ? 'Flight in progress'
                : lastCrashPoint
                  ? `Last crash ${lastCrashPoint.toFixed(2)}x`
                  : 'Waiting for next takeoff'}
            </Text>
          </View>

          <Button
            title={isLoading ? 'Refreshing...' : 'Refresh State'}
            onPress={handleRefresh}
            disabled={isLoading}
            variant="outline"
          />
        </View>

        <View style={styles.betGrid}>
          <View style={styles.betCard}>
            <Text style={styles.betTitle}>Manual Bet</Text>
            <TextInput
              value={manualAmount}
              onChangeText={setManualAmount}
              keyboardType="numeric"
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor={Colors.textMuted}
            />
            <Button
              title="Place Manual"
              onPress={placeManualBet}
              loading={placingManual}
              disabled={!canBet || placingManual}
            />
          </View>

          <View style={styles.betCard}>
            <Text style={styles.betTitle}>Auto Cashout Bet</Text>
            <TextInput
              value={autoAmount}
              onChangeText={setAutoAmount}
              keyboardType="numeric"
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor={Colors.textMuted}
            />
            <TextInput
              value={autoTarget}
              onChangeText={setAutoTarget}
              keyboardType="decimal-pad"
              style={styles.input}
              placeholder="Auto target (e.g. 2.5)"
              placeholderTextColor={Colors.textMuted}
            />
            <Button
              title="Place Auto"
              onPress={placeAutoBet}
              loading={placingAuto}
              disabled={!canBet || placingAuto}
              variant="secondary"
              textStyle={{ color: Colors.text }}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Your Current Round Bets</Text>
          {currentRoundBets.length === 0 ? (
            <Text style={styles.emptyText}>No bets in this round yet.</Text>
          ) : (
            currentRoundBets.map((bet) => (
              <View key={bet.id} style={styles.betRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.betRowTitle}>
                    Rs {formatMoney(bet.amount)} | {bet.betType === 'manual' ? 'Manual' : `Auto ${bet.autoCashoutAt}x`}
                  </Text>
                  <Text style={styles.betRowMeta}>
                    Status: {bet.status}
                    {bet.status === 'WON' ? ` | Won Rs ${formatMoney(bet.payout)}` : ''}
                  </Text>
                </View>
                {canCashout && bet.status === 'PLACED' ? (
                  <Button
                    title="Cashout"
                    onPress={() => handleCashout(bet.id)}
                    variant="success"
                    style={styles.cashoutBtn}
                  />
                ) : null}
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recent Crash History</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyRow}>
            {history.length === 0 ? (
              <Text style={styles.emptyText}>No round history yet.</Text>
            ) : (
              history.map((item) => {
                const color =
                  item.crashPoint < 2 ? Colors.danger : item.crashPoint >= 10 ? Colors.accent : Colors.warning;
                return (
                  <View key={item.id} style={[styles.historyChip, { borderColor: color }]}>
                    <Text style={[styles.historyMultiplier, { color }]}>{item.crashPoint.toFixed(2)}x</Text>
                    <Text style={styles.historyMeta}>#{item.roundNumber}</Text>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingTop: 48,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  title: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  subTitle: {
    color: Colors.textMuted,
    marginTop: 4,
    fontSize: 12,
  },
  headerActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  connectionBadge: {
    fontSize: 12,
    fontWeight: '700',
  },
  logoutBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  logoutText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  roundCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 10,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: Colors.text,
    fontWeight: '800',
    fontSize: 16,
  },
  statusTag: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    fontWeight: '700',
    fontSize: 11,
    overflow: 'hidden',
  },
  meta: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  multiplierWrap: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: Colors.surfaceSoft,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  multiplierValue: {
    color: Colors.accent,
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  multiplierLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 6,
  },
  betGrid: {
    gap: 12,
  },
  betCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 8,
  },
  betTitle: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  input: {
    backgroundColor: Colors.background,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 15,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 10,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  betRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  betRowTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  betRowMeta: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  cashoutBtn: {
    minWidth: 92,
  },
  historyRow: {
    gap: 8,
  },
  historyChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.chip,
    minWidth: 70,
    alignItems: 'center',
  },
  historyMultiplier: {
    fontWeight: '800',
    fontSize: 16,
  },
  historyMeta: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
});
