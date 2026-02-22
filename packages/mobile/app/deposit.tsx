import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Alert,
    ActivityIndicator,
    ScrollView,
    Image,
    Modal,
    Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { depositApi } from '../src/services/api';

export default function DepositScreen() {
    const router = useRouter();
    const [qrCodes, setQrCodes] = useState<any[]>([]);
    const [selectedQr, setSelectedQr] = useState<any>(null);
    const [amount, setAmount] = useState('');
    const [utrNumber, setUtrNumber] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [step, setStep] = useState<'select' | 'confirm'>('select');

    // QR Scanner state
    const [showScanner, setShowScanner] = useState(false);
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);

    useEffect(() => {
        loadQrCodes();
    }, []);

    const loadQrCodes = async () => {
        try {
            const res = await depositApi.getQrCodes();
            setQrCodes(res.data.data || res.data || []);
        } catch {
            // silent
        }
    };

    const quickAmounts = [100, 500, 1000, 2000, 5000];

    const openScanner = async () => {
        if (!permission?.granted) {
            const result = await requestPermission();
            if (!result.granted) {
                Alert.alert(
                    'Camera Permission',
                    'Camera access is required to scan QR codes. Please enable it in Settings.',
                );
                return;
            }
        }
        setScanned(false);
        setShowScanner(true);
    };

    const handleBarCodeScanned = ({ data }: { type: string; data: string }) => {
        if (scanned) return;
        setScanned(true);
        setShowScanner(false);

        // Parse UPI deep link: upi://pay?pa=someone@upi&pn=Name&am=500
        if (data.startsWith('upi://')) {
            try {
                const url = new URL(data);
                const pa = url.searchParams.get('pa'); // payee address
                const am = url.searchParams.get('am'); // amount
                const pn = url.searchParams.get('pn'); // payee name

                if (am) setAmount(am);

                Alert.alert(
                    'QR Scanned ✅',
                    `UPI: ${pa || 'Unknown'}\n${pn ? `Name: ${pn}\n` : ''}${am ? `Amount: ₹${am}` : 'Enter amount manually'}`,
                );
            } catch {
                Alert.alert('QR Scanned', 'Scanned successfully. Enter amount and UTR manually.');
            }
        } else {
            Alert.alert('QR Scanned', 'QR code recognized. Enter amount and UTR after payment.');
        }
    };

    const handleSubmit = async () => {
        if (!amount || !utrNumber || !selectedQr) {
            Alert.alert('Error', 'Please fill all fields');
            return;
        }
        setIsLoading(true);
        try {
            await depositApi.submitRequest({
                amount: parseFloat(amount),
                paymentQrId: selectedQr.id,
                utrNumber,
            });
            Alert.alert('Success', 'Deposit request submitted! Admin will verify.', [
                { text: 'OK', onPress: () => router.back() },
            ]);
        } catch (err: any) {
            Alert.alert('Error', err.response?.data?.message || 'Failed to submit');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
                {step === 'select' ? (
                    <>
                        {/* Amount */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Enter Amount</Text>
                            <TextInput
                                style={styles.amountInput}
                                placeholder="₹ Amount"
                                placeholderTextColor="#6B7280"
                                value={amount}
                                onChangeText={setAmount}
                                keyboardType="numeric"
                            />
                            <View style={styles.quickRow}>
                                {quickAmounts.map((amt) => (
                                    <TouchableOpacity
                                        key={amt}
                                        style={[styles.quickBtn, amount === String(amt) && styles.quickBtnActive]}
                                        onPress={() => setAmount(String(amt))}
                                    >
                                        <Text style={[styles.quickText, amount === String(amt) && styles.quickTextActive]}>
                                            ₹{amt}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* QR Codes */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Select Payment Method</Text>

                            {/* Scan QR Button */}
                            <TouchableOpacity style={styles.scanBtn} onPress={openScanner}>
                                <FontAwesome name="camera" size={18} color="#6C5CE7" />
                                <Text style={styles.scanBtnText}>Scan QR Code</Text>
                            </TouchableOpacity>

                            {qrCodes.map((qr) => (
                                <TouchableOpacity
                                    key={qr.id}
                                    style={[styles.qrCard, selectedQr?.id === qr.id && styles.qrCardActive]}
                                    onPress={() => setSelectedQr(qr)}
                                >
                                    <FontAwesome name="qrcode" size={24} color="#A29BFE" />
                                    <View style={styles.qrInfo}>
                                        <Text style={styles.qrName}>{qr.name || 'UPI Payment'}</Text>
                                        <Text style={styles.qrUpi}>{qr.upiId || 'Scan QR to pay'}</Text>
                                    </View>
                                    {selectedQr?.id === qr.id && (
                                        <FontAwesome name="check-circle" size={20} color="#34D399" />
                                    )}
                                </TouchableOpacity>
                            ))}
                            {qrCodes.length === 0 && (
                                <Text style={styles.noQr}>No payment methods available</Text>
                            )}
                        </View>

                        <TouchableOpacity
                            style={[styles.nextBtn, (!amount || !selectedQr) && styles.btnDisabled]}
                            onPress={() => amount && selectedQr && setStep('confirm')}
                            disabled={!amount || !selectedQr}
                        >
                            <LinearGradient
                                colors={['#6C5CE7', '#A29BFE']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.btnGradient}
                            >
                                <Text style={styles.btnText}>Next — Pay ₹{amount || '0'}</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        {/* Confirmation step */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Payment Confirmation</Text>
                            <View style={styles.confirmCard}>
                                <Text style={styles.confirmLabel}>Amount</Text>
                                <Text style={styles.confirmValue}>₹{amount}</Text>
                                <Text style={styles.confirmHint}>
                                    Pay ₹{amount} to the UPI ID shown above, then enter the UTR number below.
                                </Text>
                            </View>
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>UTR / Reference Number</Text>
                            <TextInput
                                style={styles.amountInput}
                                placeholder="Enter UTR or transaction reference"
                                placeholderTextColor="#6B7280"
                                value={utrNumber}
                                onChangeText={setUtrNumber}
                                autoCapitalize="characters"
                            />
                        </View>

                        <TouchableOpacity
                            style={[styles.nextBtn, (!utrNumber || isLoading) && styles.btnDisabled]}
                            onPress={handleSubmit}
                            disabled={!utrNumber || isLoading}
                        >
                            <LinearGradient
                                colors={['#10B981', '#34D399']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.btnGradient}
                            >
                                {isLoading ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <Text style={styles.btnText}>Submit Deposit Request</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.backLink} onPress={() => setStep('select')}>
                            <Text style={styles.backText}>← Back to amount</Text>
                        </TouchableOpacity>
                    </>
                )}
            </ScrollView>

            {/* QR Scanner Modal */}
            <Modal visible={showScanner} animationType="slide">
                <View style={styles.scannerContainer}>
                    <CameraView
                        style={StyleSheet.absoluteFillObject}
                        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                    />
                    <View style={styles.scannerOverlay}>
                        <View style={styles.scannerFrame} />
                        <Text style={styles.scannerText}>Point camera at UPI QR code</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.scannerClose}
                        onPress={() => setShowScanner(false)}
                    >
                        <FontAwesome name="times" size={24} color="#FFF" />
                    </TouchableOpacity>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F0F23' },
    section: { marginHorizontal: 16, marginTop: 20 },
    sectionTitle: { color: '#F1F5F9', fontSize: 16, fontWeight: '700', marginBottom: 12 },
    amountInput: {
        backgroundColor: '#1A1A2E',
        borderRadius: 14,
        padding: 18,
        fontSize: 20,
        color: '#F1F5F9',
        textAlign: 'center',
        fontWeight: '700',
        borderWidth: 1,
        borderColor: '#2D2D44',
    },
    quickRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
    quickBtn: {
        backgroundColor: '#1A1A2E',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: '#2D2D44',
    },
    quickBtnActive: { borderColor: '#A29BFE', backgroundColor: 'rgba(162,155,254,0.1)' },
    quickText: { color: '#94A3B8', fontWeight: '600' },
    quickTextActive: { color: '#A29BFE' },
    qrCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1A1A2E',
        borderRadius: 14,
        padding: 16,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#2D2D44',
        gap: 14,
    },
    qrCardActive: { borderColor: '#A29BFE' },
    qrInfo: { flex: 1 },
    qrName: { color: '#F1F5F9', fontSize: 15, fontWeight: '600' },
    qrUpi: { color: '#6B7280', fontSize: 13, marginTop: 2 },
    noQr: { color: '#6B7280', textAlign: 'center', marginTop: 20 },
    nextBtn: { marginHorizontal: 16, marginTop: 24, borderRadius: 14, overflow: 'hidden' },
    btnDisabled: { opacity: 0.5 },
    btnGradient: { paddingVertical: 16, alignItems: 'center', borderRadius: 14 },
    btnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
    confirmCard: {
        backgroundColor: '#1A1A2E',
        borderRadius: 14,
        padding: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#2D2D44',
    },
    confirmLabel: { color: '#6B7280', fontSize: 13 },
    confirmValue: { color: '#A29BFE', fontSize: 36, fontWeight: '800', marginTop: 4 },
    confirmHint: { color: '#94A3B8', fontSize: 13, textAlign: 'center', marginTop: 12, lineHeight: 20 },
    backLink: { alignItems: 'center', marginTop: 16 },
    backText: { color: '#A29BFE', fontSize: 14 },
    scanBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        backgroundColor: 'rgba(108, 92, 231, 0.1)',
        borderRadius: 14,
        padding: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#6C5CE7',
        borderStyle: 'dashed',
    },
    scanBtnText: { color: '#A29BFE', fontSize: 15, fontWeight: '600' },
    scannerContainer: {
        flex: 1,
        backgroundColor: '#000',
    },
    scannerOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scannerFrame: {
        width: 250,
        height: 250,
        borderWidth: 2,
        borderColor: '#A29BFE',
        borderRadius: 20,
    },
    scannerText: {
        color: '#FFF',
        fontSize: 14,
        marginTop: 20,
        textAlign: 'center',
    },
    scannerClose: {
        position: 'absolute',
        top: 60,
        right: 20,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
});
