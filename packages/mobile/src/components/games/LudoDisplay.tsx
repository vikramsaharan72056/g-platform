import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { GameComponentProps } from './types';

const COLOR_EMOJIS: Record<string, string> = {
    red: '🔴',
    blue: '🔵',
    green: '🟢',
    yellow: '🟡',
};

const COLOR_HEX: Record<string, string> = {
    red: '#EF4444',
    blue: '#3B82F6',
    green: '#10B981',
    yellow: '#F59E0B',
};

export const LudoDisplay: React.FC<GameComponentProps> = ({ round }) => {
    const isPlaying = round.status === 'PLAYING';
    const isResult = round.status === 'RESULT' || round.status === 'SETTLED';

    // Animation for "racing" effect
    const bounceAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (isPlaying) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(bounceAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
                    Animated.timing(bounceAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
                ])
            ).start();
        } else {
            bounceAnim.setValue(0);
        }
    }, [isPlaying]);

    if (isPlaying) {
        return (
            <View style={styles.racingArea}>
                <Text style={styles.waitingText}>🎲 Simulation in Progress...</Text>
                <View style={styles.raceTrack}>
                    {['red', 'blue', 'green', 'yellow'].map((color) => (
                        <Animated.View
                            key={color}
                            style={[
                                styles.token,
                                {
                                    paddingLeft: Math.random() * 20,
                                    transform: [{
                                        translateX: bounceAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [0, 10 + Math.random() * 20]
                                        })
                                    }]
                                }
                            ]}
                        >
                            <Text style={styles.tokenEmoji}>{COLOR_EMOJIS[color]}</Text>
                        </Animated.View>
                    ))}
                </View>
            </View>
        );
    }

    if (isResult && round.result) {
        const winner = round.result.winner as string;
        const colorLower = winner.toLowerCase();

        return (
            <View style={styles.resultArea}>
                <Text style={styles.winTitle}>WINNER</Text>
                <Text style={[styles.winnerEmoji, { color: COLOR_HEX[colorLower] || '#fff' }]}>
                    {COLOR_EMOJIS[colorLower] || '🏆'}
                </Text>
                <Text style={[styles.winnerName, { color: COLOR_HEX[colorLower] || '#fff' }]}>
                    {winner.toUpperCase()}
                </Text>

                {round.result.rankings && (
                    <View style={styles.rankingBox}>
                        {(round.result.rankings as string[]).slice(1, 4).map((color: string, i: number) => (
                            <Text key={color} style={styles.rankingText}>
                                {i + 2}nd: {COLOR_EMOJIS[color.toLowerCase()]}
                            </Text>
                        ))}
                    </View>
                )}
            </View>
        );
    }

    return (
        <View style={styles.center}>
            <Text style={styles.waitingText}>⏳ Preparing Ludo Race...</Text>
            <Text style={styles.ludoLogo}>🎲 🏰 🎲</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    center: { alignItems: 'center' },
    racingArea: { alignItems: 'center', width: '100%' },
    raceTrack: { marginTop: 20, gap: 12, alignItems: 'flex-start', width: '100%', paddingLeft: 20 },
    token: { flexDirection: 'row', alignItems: 'center' },
    tokenEmoji: { fontSize: 32 },
    resultArea: { alignItems: 'center', gap: 4 },
    winTitle: { color: '#9CA3AF', fontSize: 14, fontWeight: 'bold', letterSpacing: 2 },
    winnerEmoji: { fontSize: 72 },
    winnerName: { fontSize: 32, fontWeight: '900' },
    rankingBox: { marginTop: 16, flexDirection: 'row', gap: 16 },
    rankingText: { color: '#9CA3AF', fontSize: 16 },
    waitingText: { color: '#9CA3AF', fontSize: 18, textAlign: 'center' },
    ludoLogo: { fontSize: 48, marginTop: 12 },
});
