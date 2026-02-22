import { useState } from 'react';

export default function SettingsPage() {
    const [settings, setSettings] = useState({
        // Financial
        minDeposit: 100,
        maxDeposit: 100000,
        minWithdrawal: 500,
        maxWithdrawalPerDay: 50000,
        withdrawalCooldownHours: 24,
        // Bonus
        signupBonus: 50,
        referralBonus: 100,
        referralBonusForReferee: 50,
        firstDepositBonusPct: 100,
        firstDepositBonusMax: 500,
        // Platform
        maintenanceMode: false,
        maintenanceMessage: '',
        forceUpdateVersion: '',
        supportEmail: '',
        supportPhone: '',
        // Security
        maxLoginAttempts: 5,
        lockoutDurationMinutes: 30,
        sessionTimeoutMinutes: 60,
        requireKycForWithdrawal: false,
    });

    const [saved, setSaved] = useState(false);

    const handleChange = (key: string, value: any) => {
        setSettings(prev => ({ ...prev, [key]: value }));
        setSaved(false);
    };

    const handleSave = () => {
        // In a real app, POST to /admin/settings
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    const renderInput = (label: string, key: string, type: 'number' | 'text' | 'toggle' = 'number') => (
        <div className="form-group form-row" key={key}>
            <label>{label}</label>
            {type === 'toggle' ? (
                <button
                    className={`toggle-btn ${(settings as any)[key] ? 'active' : ''}`}
                    onClick={() => handleChange(key, !(settings as any)[key])}
                >
                    {(settings as any)[key] ? 'ON' : 'OFF'}
                </button>
            ) : (
                <input
                    type={type}
                    value={(settings as any)[key]}
                    onChange={e => handleChange(key, type === 'number' ? Number(e.target.value) : e.target.value)}
                />
            )}
        </div>
    );

    return (
        <div className="page">
            <div className="page-header">
                <h2>⚙️ System Settings</h2>
                <button className="btn btn-primary" onClick={handleSave}>
                    {saved ? '✓ Saved' : 'Save Changes'}
                </button>
            </div>

            <div className="settings-grid">
                <div className="card">
                    <h3>💰 Financial Settings</h3>
                    {renderInput('Min Deposit (₹)', 'minDeposit')}
                    {renderInput('Max Deposit (₹)', 'maxDeposit')}
                    {renderInput('Min Withdrawal (₹)', 'minWithdrawal')}
                    {renderInput('Max Withdrawal/Day (₹)', 'maxWithdrawalPerDay')}
                    {renderInput('Withdrawal Cooldown (hrs)', 'withdrawalCooldownHours')}
                </div>

                <div className="card">
                    <h3>🎁 Bonus Settings</h3>
                    {renderInput('Signup Bonus (₹)', 'signupBonus')}
                    {renderInput('Referral Bonus (₹)', 'referralBonus')}
                    {renderInput('Referee Bonus (₹)', 'referralBonusForReferee')}
                    {renderInput('1st Deposit Bonus (%)', 'firstDepositBonusPct')}
                    {renderInput('1st Deposit Bonus Max (₹)', 'firstDepositBonusMax')}
                </div>

                <div className="card">
                    <h3>🖥️ Platform Settings</h3>
                    {renderInput('Maintenance Mode', 'maintenanceMode', 'toggle')}
                    {renderInput('Maintenance Message', 'maintenanceMessage', 'text')}
                    {renderInput('Force Update Version', 'forceUpdateVersion', 'text')}
                    {renderInput('Support Email', 'supportEmail', 'text')}
                    {renderInput('Support Phone', 'supportPhone', 'text')}
                </div>

                <div className="card">
                    <h3>🔒 Security Settings</h3>
                    {renderInput('Max Login Attempts', 'maxLoginAttempts')}
                    {renderInput('Lockout Duration (min)', 'lockoutDurationMinutes')}
                    {renderInput('Session Timeout (min)', 'sessionTimeoutMinutes')}
                    {renderInput('Require KYC for Withdrawal', 'requireKycForWithdrawal', 'toggle')}
                </div>
            </div>
        </div>
    );
}
