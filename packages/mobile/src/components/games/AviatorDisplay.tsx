import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    interpolate,
    Extrapolate
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { GameComponentProps } from './types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PLOT_WIDTH = SCREEN_WIDTH - 48;
const PLOT_HEIGHT = 200;

export const AviatorDisplay: React.FC<GameComponentProps> = ({ round, extraData }) => {
    const isPlaying = round.status === 'PLAYING';
    const isResult = round.status === 'RESULT' || round.status === 'SETTLED';
    const multiplier = extraData?.multiplier || 1.0;
    const hasCashedOut = extraData?.hasCashedOut || false;

    // Shared values for smooth transition
    const mValue = useSharedValue(1.0);
    const crashScale = useSharedValue(1);

    useEffect(() => {
        if (isPlaying) {
            mValue.value = withTiming(multiplier, { duration: 100 });
            crashScale.value = 1;
        } else if (isResult) {
            crashScale.value = withSpring(1.5);
        }
    }, [isPlaying, isResult, multiplier]);

    const planeStyle = useAnimatedStyle(() => {
        // Map multiplier to coordinates (curved path)
        const x = interpolate(mValue.value, [1, 5, 10, 50], [0, PLOT_WIDTH * 0.4, PLOT_WIDTH * 0.7, PLOT_WIDTH], Extrapolate.CLAMP);
        const y = interpolate(mValue.value, [1, 5, 10, 50], [0, PLOT_HEIGHT * 0.3, PLOT_HEIGHT * 0.6, PLOT_HEIGHT], Extrapolate.CLAMP);

        return {
            transform: [
                { translateX: x },
                { translateY: -y },
                { scale: crashScale.value }
            ],
        };
    });

    const pathStyle = useAnimatedStyle(() => {
        const x = interpolate(mValue.value, [1, 5, 10, 50], [0, PLOT_WIDTH * 0.4, PLOT_WIDTH * 0.7, PLOT_WIDTH], Extrapolate.CLAMP);
        const y = interpolate(mValue.value, [1, 5, 10, 50], [0, PLOT_HEIGHT * 0.3, PLOT_HEIGHT * 0.6, PLOT_HEIGHT], Extrapolate.CLAMP);

        return {
            width: x,
            height: y,
            transform: [
                { translateY: -y }
            ]
        };
    });

    if (isPlaying) {
        return (
            <View style={styles.container}>
                {/* Visual Flight Area */}
                <View style={styles.plotArea}>
                    {/* Grid Lines (Conceptual Background) */}
                    <View style={styles.gridContainer}>
                        {[...Array(5)].map((_, i) => (
                            <View key={`h-${i}`} style={[styles.gridLineH, { bottom: i * 40 }]} />
                        ))}
                        {[...Array(8)].map((_, i) => (
                            <View key={`v-${i}`} style={[styles.gridLineV, { left: i * 40 }]} />
                        ))}
                    </View>

                    {/* The Flight Path Line */}
                    <Animated.View style={[styles.flightPath, pathStyle]}>
                        <LinearGradient
                            colors={['rgba(139, 92, 246, 0.1)', 'rgba(139, 92, 246, 0.6)']}
                            style={StyleSheet.absoluteFill}
                            start={{ x: 0, y: 1 }}
                            end={{ x: 1, y: 0 }}
                        />
                    </Animated.View>

                    {/* The Plane */}
                    <Animated.View style={[styles.planeContainer, planeStyle]}>
                        <Text style={styles.planeEmoji}>✈️</Text>
                        <View style={styles.planeGlow} />
                    </Animated.View>
                </View>

                {/* Multiplier Central Text */}
                <View style={styles.multiplierBadge}>
                    <Text style={[styles.multiplierText, { color: multiplier > 2 ? '#10B981' : '#fff' }]}>
                        {multiplier.toFixed(2)}x
                    </Text>
                </View>

                {/* Cashout Controls */}
                <View style={styles.controls}>
                    {extraData?.activeBetId && !hasCashedOut && (
                        <TouchableOpacity style={styles.cashoutBtn} onPress={extraData.onCashout}>
                            <Text style={styles.cashoutText}>💰 CASH OUT</Text>
                            <Text style={styles.payoutEstimate}>Win: ₹{(parseFloat(extraData.betAmount || '100') * multiplier).toFixed(2)}</Text>
                        </TouchableOpacity>
                    )}
                    {hasCashedOut && (
                        <View style={styles.cashedOutBadge}>
                            <Text style={styles.cashedOutText}>✅ Cashed Out!</Text>
                        </View>
                    )}
                </View>
            </View>
        );
    }

    if (isResult && round.result) {
        return (
            <View style={styles.container}>
                <View style={styles.resultArea}>
                    <Text style={styles.resultEmoji}>💥</Text>
                    <Text style={styles.resultValue}>Crashed at</Text>
                    <Text style={[styles.multiplierText, { color: '#EF4444' }]}>{round.result.crashPoint}x</Text>
                    <Text style={styles.waitingText}>Next round starting soon...</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.waitingArea}>
                <LinearGradient
                    colors={['#1F1F3D', '#1A1A2E']}
                    style={styles.loadingCircle}
                >
                    <Text style={styles.waitingText}>⏳ Preparing...</Text>
                </LinearGradient>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { width: '100%', alignItems: 'center', height: 300, justifyContent: 'center' },
    plotArea: {
        width: PLOT_WIDTH,
        height: PLOT_HEIGHT,
        backgroundColor: '#1E1E2E',
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#2D2D44'
    },
    gridContainer: { ...StyleSheet.absoluteFillObject, opacity: 0.1 },
    gridLineH: { height: 1, backgroundColor: '#fff', width: '100%', position: 'absolute' },
    gridLineV: { width: 1, backgroundColor: '#fff', height: '100%', position: 'absolute' },
    flightPath: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        backgroundColor: 'rgba(139, 92, 246, 0.3)',
        borderTopRightRadius: 40,
    },
    planeContainer: {
        position: 'absolute',
        bottom: -10,
        left: -10,
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    planeEmoji: { fontSize: 32, zIndex: 2 },
    planeGlow: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#8B5CF6',
        borderRadius: 20,
        opacity: 0.3,
        transform: [{ scale: 1.5 }],
    },
    multiplierBadge: {
        position: 'absolute',
        top: '30%',
        alignItems: 'center',
        zIndex: 5,
    },
    multiplierText: { fontSize: 56, fontWeight: '900', color: '#fff', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 4 },
    controls: { position: 'absolute', bottom: 10, width: '100%', alignItems: 'center' },
    cashoutBtn: {
        backgroundColor: '#10B981', paddingVertical: 12, paddingHorizontal: 32,
        borderRadius: 12, alignItems: 'center', shadowColor: '#10B981', shadowOpacity: 0.5, shadowRadius: 10, elevation: 5
    },
    cashoutText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
    payoutEstimate: { color: '#fff', fontSize: 12, opacity: 0.8 },
    cashedOutBadge: { backgroundColor: 'rgba(16, 185, 129, 0.2)', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#10B981' },
    cashedOutText: { color: '#10B981', fontSize: 18, fontWeight: 'bold' },
    resultArea: { alignItems: 'center', gap: 4 },
    resultEmoji: { fontSize: 64 },
    resultValue: { color: '#9CA3AF', fontSize: 16 },
    waitingArea: { alignItems: 'center' },
    loadingCircle: { padding: 32, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
    waitingText: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginTop: 8 },
});
