import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
const API_URL = import.meta.env.VITE_RUMMY_API_URL || 'http://localhost:3400';
async function api(path, opts = {}, token) {
    const headers = new Headers(opts.headers || {});
    headers.set('Content-Type', 'application/json');
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
    const json = await res.json();
    if (!res.ok) {
        throw new Error(json?.message || 'Request failed');
    }
    return json.data;
}
function toErrorMessage(error) {
    if (error instanceof Error)
        return error.message;
    if (typeof error === 'string')
        return error;
    return 'Unknown error';
}
function toDateLabel(iso) {
    if (!iso)
        return '-';
    const time = new Date(iso).getTime();
    if (Number.isNaN(time))
        return iso;
    return new Date(time).toLocaleString();
}
function toInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}
function queryString(params) {
    const urlParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === '')
            continue;
        urlParams.set(key, String(value));
    }
    const qs = urlParams.toString();
    return qs ? `?${qs}` : '';
}
export default function App() {
    const [name, setName] = useState('Admin Operator');
    const [auth, setAuth] = useState(null);
    const [tables, setTables] = useState([]);
    const [selectedTableId, setSelectedTableId] = useState(null);
    const [tableState, setTableState] = useState(null);
    const [socket, setSocket] = useState(null);
    const [log, setLog] = useState([]);
    const [newTableName, setNewTableName] = useState('Rummy Live Table');
    const [newTablePlayers, setNewTablePlayers] = useState(2);
    const [newTablePointValue, setNewTablePointValue] = useState(10);
    const [wallet, setWallet] = useState(null);
    const [walletTxns, setWalletTxns] = useState([]);
    const [reclaimCodeInput, setReclaimCodeInput] = useState('');
    const [replaySinceId, setReplaySinceId] = useState(0);
    const [replayLimit, setReplayLimit] = useState(200);
    const [replay, setReplay] = useState(null);
    const [ledgerRows, setLedgerRows] = useState([]);
    const [ledgerVerify, setLedgerVerify] = useState(null);
    const [disputeReason, setDisputeReason] = useState('');
    const [disputeEvidence, setDisputeEvidence] = useState('');
    const [disputes, setDisputes] = useState([]);
    const [resolveDisputeId, setResolveDisputeId] = useState('');
    const [resolveStatus, setResolveStatus] = useState('REVIEWED');
    const [resolveNote, setResolveNote] = useState('');
    const [auditActionFilter, setAuditActionFilter] = useState('');
    const [auditRows, setAuditRows] = useState([]);
    const canManage = !!auth?.token;
    const selectedSummary = useMemo(() => tables.find((t) => t.id === selectedTableId) || null, [tables, selectedTableId]);
    const pushLog = (line) => {
        setLog((prev) => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev.slice(0, 39)]);
    };
    const loadTables = async () => {
        const data = await api('/tables');
        setTables(data);
    };
    const loadWallet = async () => {
        if (!auth)
            return;
        const [walletData, txnData] = await Promise.all([
            api('/wallet/me', {}, auth.token),
            api('/wallet/me/transactions?limit=20', {}, auth.token),
        ]);
        setWallet(walletData);
        setWalletTxns(txnData);
    };
    const loadTableState = async (tableId) => {
        if (!auth)
            return;
        const state = await api(`/tables/${tableId}`, {}, auth.token);
        setTableState(state);
        if (state.mySeat?.reclaimCode) {
            setReclaimCodeInput(state.mySeat.reclaimCode);
        }
    };
    const loadReplay = async (tableId, sinceId = replaySinceId, limit = replayLimit) => {
        if (!auth)
            return;
        const data = await api(`/tables/${tableId}/replay${queryString({ sinceId, limit })}`, {}, auth.token);
        setReplay(data);
    };
    const loadLedger = async (tableId) => {
        if (!auth)
            return;
        const data = await api(`/tables/${tableId}/ledger?limit=50`, {}, auth.token);
        setLedgerRows(data);
    };
    const loadDisputes = async (tableId) => {
        if (!auth)
            return;
        const data = await api(`/tables/${tableId}/disputes?limit=100`, {}, auth.token);
        setDisputes(data);
    };
    const loadAudit = async (tableId) => {
        if (!auth)
            return;
        const data = await api(`/audit${queryString({
            limit: 100,
            tableId,
            action: auditActionFilter.trim() || undefined,
        })}`, {}, auth.token);
        setAuditRows(data);
    };
    useEffect(() => {
        loadTables().catch((error) => pushLog(`load tables failed: ${toErrorMessage(error)}`));
    }, []);
    useEffect(() => {
        if (!auth)
            return;
        const s = io(API_URL, {
            transports: ['websocket'],
            auth: { token: auth.token },
        });
        s.on('connect', () => pushLog('socket connected'));
        s.on('disconnect', () => pushLog('socket disconnected'));
        s.on('table:list', (data) => setTables(data));
        s.on('table:state', (data) => {
            setTableState(data);
            if (data.mySeat?.reclaimCode) {
                setReclaimCodeInput(data.mySeat.reclaimCode);
            }
        });
        s.on('table:replay', (data) => {
            setReplay(data);
            pushLog(`replay received events=${data.events.length} latest=${data.latestEventId}`);
        });
        s.on('table:error', (err) => pushLog(`socket error: ${err.message}`));
        s.on('table:timeout', (evt) => pushLog(`timeout table=${evt.tableId} user=${evt.userId}`));
        setSocket(s);
        loadWallet().catch((error) => pushLog(`wallet load failed: ${toErrorMessage(error)}`));
        return () => {
            s.disconnect();
        };
    }, [auth]);
    useEffect(() => {
        if (!auth || !selectedTableId)
            return;
        loadTableState(selectedTableId).catch((error) => pushLog(`table load failed: ${toErrorMessage(error)}`));
        loadReplay(selectedTableId).catch((error) => pushLog(`replay load failed: ${toErrorMessage(error)}`));
        loadLedger(selectedTableId).catch((error) => pushLog(`ledger load failed: ${toErrorMessage(error)}`));
        loadDisputes(selectedTableId).catch((error) => pushLog(`disputes load failed: ${toErrorMessage(error)}`));
        loadAudit(selectedTableId).catch((error) => pushLog(`audit load failed: ${toErrorMessage(error)}`));
    }, [auth, selectedTableId]);
    useEffect(() => {
        if (!socket || !selectedTableId)
            return;
        socket.emit('table:subscribe', { tableId: selectedTableId });
        return () => {
            socket.emit('table:unsubscribe', { tableId: selectedTableId });
        };
    }, [socket, selectedTableId]);
    const login = async (e) => {
        e.preventDefault();
        try {
            const data = await api('/auth/guest-login', {
                method: 'POST',
                body: JSON.stringify({ name }),
            });
            setAuth(data);
            pushLog(`logged in as ${data.user.name}`);
        }
        catch (error) {
            pushLog(`login failed: ${toErrorMessage(error)}`);
        }
    };
    const createTable = async (e) => {
        e.preventDefault();
        if (!auth)
            return;
        try {
            const view = await api('/tables', {
                method: 'POST',
                body: JSON.stringify({
                    name: newTableName,
                    maxPlayers: Number(newTablePlayers),
                    pointValue: Number(newTablePointValue),
                }),
            }, auth.token);
            setSelectedTableId(view.id);
            setTableState(view);
            if (view.mySeat?.reclaimCode) {
                setReclaimCodeInput(view.mySeat.reclaimCode);
            }
            pushLog(`created table ${view.name}`);
            await loadWallet();
        }
        catch (error) {
            pushLog(`create table failed: ${toErrorMessage(error)}`);
        }
    };
    const joinTable = async (tableId) => {
        if (!auth)
            return;
        try {
            const view = await api(`/tables/${tableId}/join`, { method: 'POST' }, auth.token);
            setSelectedTableId(view.id);
            setTableState(view);
            if (view.mySeat?.reclaimCode) {
                setReclaimCodeInput(view.mySeat.reclaimCode);
            }
            pushLog(`joined table ${view.name}`);
            await loadWallet();
        }
        catch (error) {
            pushLog(`join failed: ${toErrorMessage(error)}`);
        }
    };
    const startTable = async () => {
        if (!auth || !selectedTableId)
            return;
        try {
            const view = await api(`/tables/${selectedTableId}/start`, { method: 'POST' }, auth.token);
            setTableState(view);
            if (view.mySeat?.reclaimCode) {
                setReclaimCodeInput(view.mySeat.reclaimCode);
            }
            pushLog('game started');
        }
        catch (error) {
            pushLog(`start failed: ${toErrorMessage(error)}`);
        }
    };
    const reclaimSeat = async () => {
        if (!auth || !selectedTableId || !reclaimCodeInput.trim())
            return;
        try {
            const data = await api(`/tables/${selectedTableId}/reclaim`, {
                method: 'POST',
                body: JSON.stringify({
                    reclaimCode: reclaimCodeInput.trim(),
                    sinceId: replaySinceId,
                    limit: replayLimit,
                }),
            }, auth.token);
            setTableState(data.table);
            setReplay(data.replay);
            if (data.table.mySeat?.reclaimCode) {
                setReclaimCodeInput(data.table.mySeat.reclaimCode);
            }
            pushLog(`seat reclaimed on table ${selectedTableId}`);
            await Promise.all([loadWallet(), loadAudit(selectedTableId)]);
        }
        catch (error) {
            pushLog(`reclaim failed: ${toErrorMessage(error)}`);
        }
    };
    const verifyLedger = async (ledgerId) => {
        if (!auth)
            return;
        try {
            const data = await api(`/ledger/${ledgerId}/verify`, {}, auth.token);
            setLedgerVerify(data);
            pushLog(`ledger verified #${ledgerId} valid=${data.valid}`);
        }
        catch (error) {
            pushLog(`ledger verify failed: ${toErrorMessage(error)}`);
        }
    };
    const createDispute = async () => {
        if (!auth || !selectedTableId)
            return;
        if (disputeReason.trim().length < 5) {
            pushLog('dispute reason must be at least 5 chars');
            return;
        }
        try {
            const dispute = await api(`/tables/${selectedTableId}/disputes`, {
                method: 'POST',
                body: JSON.stringify({
                    reason: disputeReason.trim(),
                    evidence: disputeEvidence.trim() || undefined,
                }),
            }, auth.token);
            setDisputeReason('');
            setDisputeEvidence('');
            pushLog(`dispute created #${dispute.id}`);
            await Promise.all([loadDisputes(selectedTableId), loadAudit(selectedTableId)]);
        }
        catch (error) {
            pushLog(`dispute create failed: ${toErrorMessage(error)}`);
        }
    };
    const resolveDispute = async () => {
        if (!auth || !selectedTableId)
            return;
        const disputeId = toInt(resolveDisputeId, 0);
        if (!disputeId || resolveNote.trim().length < 3) {
            pushLog('provide dispute id and resolution note (3+ chars)');
            return;
        }
        try {
            await api(`/disputes/${disputeId}/resolve`, {
                method: 'POST',
                body: JSON.stringify({
                    status: resolveStatus,
                    resolutionNote: resolveNote.trim(),
                }),
            }, auth.token);
            setResolveNote('');
            pushLog(`dispute resolved #${disputeId} -> ${resolveStatus}`);
            await Promise.all([loadDisputes(selectedTableId), loadAudit(selectedTableId)]);
        }
        catch (error) {
            pushLog(`dispute resolve failed: ${toErrorMessage(error)}`);
        }
    };
    return (_jsxs("div", { className: "layout", children: [_jsxs("header", { className: "topbar", children: [_jsx("h1", { children: "Rummy Live Admin" }), _jsx("span", { className: "api-tag", children: API_URL })] }), _jsxs("div", { className: "grid", children: [_jsxs("section", { className: "panel", children: [_jsx("h2", { children: "Session" }), !auth ? (_jsxs("form", { onSubmit: login, className: "stack", children: [_jsx("input", { value: name, onChange: (e) => setName(e.target.value) }), _jsx("button", { type: "submit", children: "Login Guest" })] })) : (_jsxs("p", { className: "muted", children: ["Logged in: ", _jsx("strong", { children: auth.user.name }), " (", auth.user.userId, ")"] })), _jsx("h3", { children: "Wallet" }), !wallet ? (_jsx("p", { className: "muted", children: "Wallet unavailable." })) : (_jsxs("div", { className: "stack", children: [_jsxs("div", { className: "kv", children: [_jsx("span", { children: "Balance" }), _jsx("strong", { children: wallet.balance })] }), _jsxs("div", { className: "kv", children: [_jsx("span", { children: "Updated" }), _jsx("strong", { children: toDateLabel(wallet.updatedAt) })] }), _jsx("button", { onClick: () => loadWallet().catch((error) => pushLog(toErrorMessage(error))), children: "Refresh Wallet" })] })), _jsx("h3", { children: "Create Table" }), _jsxs("form", { onSubmit: createTable, className: "stack", children: [_jsx("input", { value: newTableName, onChange: (e) => setNewTableName(e.target.value), placeholder: "Table name", disabled: !canManage }), _jsx("input", { type: "number", min: 2, max: 6, value: newTablePlayers, onChange: (e) => setNewTablePlayers(toInt(e.target.value, 2)), disabled: !canManage }), _jsx("input", { type: "number", min: 1, max: 1000, value: newTablePointValue, onChange: (e) => setNewTablePointValue(toInt(e.target.value, 10)), disabled: !canManage }), _jsx("button", { type: "submit", disabled: !canManage, children: "Create" })] })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-row", children: [_jsx("h2", { children: "Tables" }), _jsx("button", { onClick: () => loadTables().catch((error) => pushLog(toErrorMessage(error))), children: "Refresh" })] }), _jsxs("div", { className: "table-list", children: [tables.map((t) => (_jsxs("button", { className: `table-card ${selectedTableId === t.id ? 'active' : ''}`, onClick: () => {
                                            setSelectedTableId(t.id);
                                            setTableState(null);
                                            setReplay(null);
                                            setLedgerVerify(null);
                                        }, children: [_jsx("strong", { children: t.name }), _jsxs("span", { children: [t.currentPlayers, "/", t.maxPlayers] }), _jsx("span", { children: t.status })] }, t.id))), tables.length === 0 && _jsx("p", { className: "muted", children: "No tables yet." })] }), _jsxs("div", { className: "actions", children: [_jsx("button", { disabled: !selectedSummary || !canManage, onClick: () => selectedSummary && joinTable(selectedSummary.id), children: "Join" }), _jsx("button", { disabled: !selectedSummary || !canManage, onClick: startTable, children: "Start" })] }), _jsx("h3", { children: "Reconnect" }), _jsxs("div", { className: "stack", children: [_jsx("input", { placeholder: "Reclaim code", value: reclaimCodeInput, onChange: (e) => setReclaimCodeInput(e.target.value), disabled: !selectedSummary || !canManage }), _jsxs("div", { className: "inline", children: [_jsx("label", { className: "muted small", children: "Since" }), _jsx("input", { type: "number", value: replaySinceId, onChange: (e) => setReplaySinceId(toInt(e.target.value, 0)) }), _jsx("label", { className: "muted small", children: "Limit" }), _jsx("input", { type: "number", value: replayLimit, onChange: (e) => setReplayLimit(Math.max(1, toInt(e.target.value, 200))) })] }), _jsxs("div", { className: "actions", children: [_jsx("button", { disabled: !selectedSummary || !canManage, onClick: reclaimSeat, children: "Reclaim Seat" }), _jsx("button", { disabled: !selectedSummary || !canManage, onClick: () => selectedSummary &&
                                                    loadReplay(selectedSummary.id).catch((error) => pushLog(`replay failed: ${toErrorMessage(error)}`)), children: "Pull Replay" })] })] })] }), _jsxs("section", { className: "panel", children: [_jsx("h2", { children: "Live Table State" }), !tableState ? (_jsx("p", { className: "muted", children: "Select a table to view details." })) : (_jsxs("div", { className: "stack", children: [_jsxs("div", { className: "kv", children: [_jsx("span", { children: "Status" }), _jsx("strong", { children: tableState.status })] }), _jsxs("div", { className: "kv", children: [_jsx("span", { children: "Players" }), _jsxs("strong", { children: [tableState.currentPlayers, "/", tableState.maxPlayers] })] }), _jsxs("div", { className: "kv", children: [_jsx("span", { children: "Point Value" }), _jsx("strong", { children: tableState.pointValue })] }), _jsxs("div", { className: "kv", children: [_jsx("span", { children: "Host" }), _jsx("strong", { children: tableState.hostUserId })] }), _jsxs("div", { className: "kv", children: [_jsx("span", { children: "My Seat" }), _jsx("strong", { children: tableState.mySeat ? `#${tableState.mySeat.seatNo}` : '-' })] }), _jsxs("div", { className: "kv", children: [_jsx("span", { children: "My Reclaim Code" }), _jsx("strong", { className: "mono", children: tableState.mySeat?.reclaimCode || '-' })] }), tableState.game && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "kv", children: [_jsx("span", { children: "Turn User" }), _jsx("strong", { children: tableState.game.turn.userId })] }), _jsxs("div", { className: "kv", children: [_jsx("span", { children: "Turn No" }), _jsx("strong", { children: tableState.game.turn.turnNo })] }), _jsxs("div", { className: "kv", children: [_jsx("span", { children: "Open Top" }), _jsx("strong", { children: tableState.game.openTop || '-' })] }), _jsxs("div", { className: "kv", children: [_jsx("span", { children: "Closed Count" }), _jsx("strong", { children: tableState.game.closedCount })] }), _jsxs("div", { className: "kv", children: [_jsx("span", { children: "Joker" }), _jsx("strong", { children: tableState.game.jokerCard || '-' })] }), _jsxs("div", { className: "kv", children: [_jsx("span", { children: "Active" }), _jsx("strong", { children: tableState.game.activePlayers })] }), _jsxs("div", { className: "kv", children: [_jsx("span", { children: "Winner" }), _jsx("strong", { children: tableState.game.winnerUserId || '-' })] }), _jsxs("div", { className: "kv", children: [_jsx("span", { children: "Finished" }), _jsx("strong", { children: toDateLabel(tableState.game.finishedAt) })] }), _jsxs("div", { className: "kv", children: [_jsx("span", { children: "Ledger" }), _jsx("strong", { children: tableState.game.resultLedger?.ledgerId || '-' })] })] })), _jsx("h3", { children: "Seats" }), tableState.seats.map((s) => (_jsxs("div", { className: "seat", children: [_jsxs("span", { children: ["#", s.seatNo, " ", s.name] }), _jsxs("span", { children: [s.status, " | score ", s.score] }), _jsx("span", { children: s.hand ? `${s.hand.length} cards` : `${s.handCount || 0} cards` }), _jsx("span", { className: `chip ${s.connected ? 'ok' : 'warn'}`, children: s.connected ? 'connected' : 'offline' }), _jsx("span", { className: "muted small", children: toDateLabel(s.lastSeenAt) })] }, `${s.userId}-${s.seatNo}`))), tableState.game?.settlement && (_jsxs(_Fragment, { children: [_jsx("h3", { children: "Settlement" }), tableState.game.settlement.entries.map((entry) => (_jsxs("div", { className: "seat", children: [_jsx("span", { children: entry.name }), _jsx("span", { children: entry.result }), _jsxs("span", { children: [entry.points, " pts / ", entry.amount] }), _jsxs("span", { children: [entry.walletBefore, " -> ", entry.walletAfter] })] }, entry.userId)))] }))] }))] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-row", children: [_jsx("h2", { children: "Replay" }), _jsx("button", { disabled: !selectedSummary || !canManage, onClick: () => selectedSummary &&
                                            loadReplay(selectedSummary.id).catch((error) => pushLog(`replay failed: ${toErrorMessage(error)}`)), children: "Reload" })] }), !replay ? (_jsx("p", { className: "muted", children: "No replay loaded." })) : (_jsxs("div", { className: "stack", children: [_jsxs("div", { className: "kv", children: [_jsx("span", { children: "Since" }), _jsx("strong", { children: replay.sinceId })] }), _jsxs("div", { className: "kv", children: [_jsx("span", { children: "Latest" }), _jsx("strong", { children: replay.latestEventId })] }), _jsxs("div", { className: "kv", children: [_jsx("span", { children: "Events" }), _jsx("strong", { children: replay.events.length })] }), _jsx("div", { className: "scroll mono", children: replay.events.map((event) => (_jsxs("div", { children: ["#", event.id, " ", event.eventType, " ", toDateLabel(event.createdAt)] }, event.id))) })] }))] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-row", children: [_jsx("h2", { children: "Ledger" }), _jsx("button", { disabled: !selectedSummary || !canManage, onClick: () => selectedSummary &&
                                            loadLedger(selectedSummary.id).catch((error) => pushLog(`ledger failed: ${toErrorMessage(error)}`)), children: "Reload" })] }), _jsxs("div", { className: "scroll", children: [ledgerRows.map((entry) => (_jsxs("div", { className: "seat", children: [_jsxs("span", { children: ["#", entry.id] }), _jsx("span", { children: entry.winnerUserId }), _jsx("span", { className: "muted small", children: toDateLabel(entry.createdAt) }), _jsx("button", { onClick: () => verifyLedger(entry.id), children: "Verify" })] }, entry.id))), ledgerRows.length === 0 && _jsx("p", { className: "muted", children: "No ledger rows yet." })] }), ledgerVerify && (_jsxs("div", { className: "stack", children: [_jsx("h3", { children: "Verify Result" }), _jsxs("div", { className: "kv", children: [_jsx("span", { children: "Ledger" }), _jsxs("strong", { children: ["#", ledgerVerify.ledgerId] })] }), _jsxs("div", { className: "kv", children: [_jsx("span", { children: "Valid" }), _jsx("strong", { children: ledgerVerify.valid ? 'YES' : 'NO' })] }), _jsxs("div", { className: "kv", children: [_jsx("span", { children: "Payload Hash" }), _jsx("strong", { children: ledgerVerify.checks.payloadHashValid ? 'OK' : 'FAIL' })] }), _jsxs("div", { className: "kv", children: [_jsx("span", { children: "Signature" }), _jsx("strong", { children: ledgerVerify.checks.signatureValid ? 'OK' : 'FAIL' })] }), _jsxs("div", { className: "kv", children: [_jsx("span", { children: "Chain" }), _jsx("strong", { children: ledgerVerify.checks.chainValid ? 'OK' : 'FAIL' })] })] }))] }), _jsxs("section", { className: "panel", children: [_jsx("h2", { children: "Disputes" }), _jsxs("div", { className: "stack", children: [_jsx("textarea", { placeholder: "Reason", value: disputeReason, onChange: (e) => setDisputeReason(e.target.value), rows: 3, disabled: !selectedSummary || !canManage }), _jsx("textarea", { placeholder: "Evidence (optional)", value: disputeEvidence, onChange: (e) => setDisputeEvidence(e.target.value), rows: 2, disabled: !selectedSummary || !canManage }), _jsxs("div", { className: "actions", children: [_jsx("button", { disabled: !selectedSummary || !canManage, onClick: createDispute, children: "Raise Dispute" }), _jsx("button", { disabled: !selectedSummary || !canManage, onClick: () => selectedSummary &&
                                                    loadDisputes(selectedSummary.id).catch((error) => pushLog(`dispute load failed: ${toErrorMessage(error)}`)), children: "Reload" })] }), _jsx("h3", { children: "Resolve Dispute" }), _jsx("input", { placeholder: "Dispute id", value: resolveDisputeId, onChange: (e) => setResolveDisputeId(e.target.value) }), _jsxs("select", { value: resolveStatus, onChange: (e) => setResolveStatus(e.target.value), children: [_jsx("option", { value: "REVIEWED", children: "REVIEWED" }), _jsx("option", { value: "RESOLVED", children: "RESOLVED" }), _jsx("option", { value: "REJECTED", children: "REJECTED" })] }), _jsx("textarea", { placeholder: "Resolution note", value: resolveNote, onChange: (e) => setResolveNote(e.target.value), rows: 2 }), _jsx("button", { disabled: !selectedSummary || !canManage, onClick: resolveDispute, children: "Resolve" })] }), _jsxs("div", { className: "scroll", children: [disputes.map((entry) => (_jsxs("div", { className: "seat", children: [_jsxs("span", { children: ["#", entry.id] }), _jsx("span", { children: entry.status }), _jsx("span", { className: "muted small", children: entry.raisedBy }), _jsx("span", { className: "muted small", children: toDateLabel(entry.createdAt) })] }, entry.id))), disputes.length === 0 && _jsx("p", { className: "muted", children: "No disputes yet." })] })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-row", children: [_jsx("h2", { children: "Audit" }), _jsx("button", { disabled: !canManage, onClick: () => loadAudit(selectedTableId || undefined).catch((error) => pushLog(`audit failed: ${toErrorMessage(error)}`)), children: "Reload" })] }), _jsxs("div", { className: "inline", children: [_jsx("input", { placeholder: "Action filter (optional)", value: auditActionFilter, onChange: (e) => setAuditActionFilter(e.target.value) }), _jsx("button", { disabled: !canManage, onClick: () => loadAudit(selectedTableId || undefined).catch((error) => pushLog(`audit failed: ${toErrorMessage(error)}`)), children: "Apply" })] }), _jsxs("div", { className: "scroll mono", children: [auditRows.map((row) => (_jsxs("div", { children: ["#", row.id, " ", row.action, " actor=", row.actorUserId || '-', " ", toDateLabel(row.createdAt)] }, row.id))), auditRows.length === 0 && _jsx("p", { className: "muted", children: "No audit rows." })] }), _jsx("h3", { children: "Wallet Transactions" }), _jsxs("div", { className: "scroll mono", children: [walletTxns.map((txn) => (_jsxs("div", { children: ["#", txn.id, " ", txn.type, " ", txn.amount, " (", txn.balanceBefore, " -> ", txn.balanceAfter, ")"] }, txn.id))), walletTxns.length === 0 && _jsx("p", { className: "muted", children: "No wallet transactions." })] })] }), _jsxs("section", { className: "panel", children: [_jsx("h2", { children: "Activity" }), _jsxs("div", { className: "log", children: [log.map((line, idx) => (_jsx("div", { children: line }, `${idx}-${line}`))), log.length === 0 && _jsx("p", { className: "muted", children: "No activity yet." })] })] })] })] }));
}
