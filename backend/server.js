/**
 * EquiPulse - Financial Resilience Engine for Gig and Informal Workers
 * Express API Server running on port 5000
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files if accessed directly on port 5000
app.use(express.static(path.join(__dirname, '../frontend')));

// Load initial 30-day time-series records
const rawDataPath = path.join(__dirname, 'data.json');
let historicalData = [];

try {
  historicalData = JSON.parse(fs.readFileSync(rawDataPath, 'utf8'));
} catch (err) {
  console.error('Error reading data.json, initializing empty array', err);
  historicalData = [];
}

// In-Memory Fintech State (Simulating Core Banking & Platform Vault)
const DEFAULT_STATE = {
  workerProfile: {
    name: 'Kumaravel S. (குமார்)',
    id: 'GP-CHE-8942',
    city: 'Chennai, Tamil Nadu',
    hub: 'T. Nagar / Central Hub',
    platforms: ['Swiggy Delivery Partner', 'Uber Auto Premier'],
    tier: 'Diamond Super-Partner',
    completedShifts: 1428,
    rating: 4.89,
    joinedDate: '2024-03-15'
  },
  targetBaseline: 1000, // Daily living baseline in INR
  vaultBalance: 4250,   // Accumulated emergency safety buffer in INR
  mainBalance: 1850,    // Current liquid UPI wallet balance in INR
  vaultCapacity: 10000, // 10-day safety reserve target
  activeAdvances: [
    {
      id: 'ADV-2026-0801',
      amount: 2000,
      disbursedDate: '2026-08-01',
      status: 'REPAID',
      installments: 4,
      repaidInstallments: 4,
      purpose: 'Two-wheeler servicing'
    }
  ],
  transactions: [
    {
      id: 'TXN-001',
      date: '2026-09-02',
      type: 'SWEEP',
      amount: 120,
      description: 'Daily surplus auto-swept to Safety Vault',
      vaultBalanceAfter: 4250,
      mainBalanceAfter: 1850
    }
  ]
};

let appState = JSON.parse(JSON.stringify(DEFAULT_STATE));

/**
 * Calculates work-based GIG-Score (300 - 800)
 * Weights:
 * - Active Hours consistency: 35%
 * - Platform Customer Rating: 35%
 * - Income regularity across 30 days: 30%
 */
function computeGigScore(data) {
  if (!data || data.length === 0) {
    return {
      gig_score: 550,
      risk_category: 'Moderate Regularity (Medium Risk)',
      max_eligible_credit: 3500,
      breakdown: { hours_score: 0.5, rating_score: 0.5, regularity_score: 0.5 }
    };
  }

  const n = data.length;

  // 1. Active Hours consistency (35% weight)
  const hours = data.map(d => d.active_hours);
  const meanHours = hours.reduce((a, b) => a + b, 0) / n;
  const varianceHours = hours.reduce((a, b) => a + Math.pow(b - meanHours, 2), 0) / n;
  const stdDevHours = Math.sqrt(varianceHours);
  
  const hoursConsistency = Math.max(0, 1 - (stdDevHours / (meanHours || 1)));
  const hoursIntensity = Math.min(1, meanHours / 8.5);
  const hoursScoreNormalized = Math.min(1, Math.max(0, (hoursConsistency * 0.6) + (hoursIntensity * 0.4)));

  // 2. Platform Customer Rating (35% weight)
  const ratings = data.map(d => d.platform_rating);
  const meanRating = ratings.reduce((a, b) => a + b, 0) / n;
  const ratingScoreNormalized = Math.min(1, Math.max(0, (meanRating - 4.2) / 0.8));

  // 3. Income Regularity across 30 days (30% weight)
  const incomes = data.map(d => d.daily_income);
  const meanIncome = incomes.reduce((a, b) => a + b, 0) / n;
  const varianceIncome = incomes.reduce((a, b) => a + Math.pow(b - meanIncome, 2), 0) / n;
  const stdDevIncome = Math.sqrt(varianceIncome);
  const coefficientOfVariation = stdDevIncome / (meanIncome || 1);
  
  const incomeRegularityNormalized = Math.min(1, Math.max(0, 1 - (coefficientOfVariation / 0.9)));

  // Final Composite GIG-Score computation (Range: 300 to 800)
  const compositeRatio = (0.35 * hoursScoreNormalized) + (0.35 * ratingScoreNormalized) + (0.30 * incomeRegularityNormalized);
  const gigScore = Math.round(300 + (compositeRatio * 500));

  let riskCategory = '';
  let maxEligibleCredit = 0;

  if (gigScore >= 720) {
    riskCategory = 'Prime Gig Partner (Ultra-Low Risk)';
    maxEligibleCredit = 15000;
  } else if (gigScore >= 650) {
    riskCategory = 'Consistent Worker (Low Risk / Instant Loan Eligible)';
    maxEligibleCredit = 8000;
  } else if (gigScore >= 550) {
    riskCategory = 'Moderate Regularity (Medium Risk)';
    maxEligibleCredit = 3500;
  } else {
    riskCategory = 'Volatile Earner (High Risk / Micro-Advance Only)';
    maxEligibleCredit = 1000;
  }

  return {
    gig_score: gigScore,
    risk_category: riskCategory,
    max_eligible_credit: maxEligibleCredit,
    breakdown: {
      hours_score: Math.round(hoursScoreNormalized * 100),
      rating_score: Math.round(ratingScoreNormalized * 100),
      regularity_score: Math.round(incomeRegularityNormalized * 100),
      mean_hours: parseFloat(meanHours.toFixed(1)),
      mean_rating: parseFloat(meanRating.toFixed(2)),
      mean_income: Math.round(meanIncome)
    }
  };
}

/**
 * 1. GET /api/dashboard-data
 * Returns the 30-day data history, total income, current Safety Vault balance, and active GIG-Score.
 */
app.get('/api/dashboard-data', (req, res) => {
  const gigScoreData = computeGigScore(historicalData);
  const totalIncome = historicalData.reduce((acc, curr) => acc + curr.daily_income, 0);
  const totalExpenses = historicalData.reduce((acc, curr) => acc + curr.expenses, 0);
  const netEarnings = totalIncome - totalExpenses;

  // Compute Smoothed Series for visual comparison:
  let runningVault = 2500;
  const smoothedSeries = historicalData.map(record => {
    let smoothedWallet = record.daily_income;
    let vaultDelta = 0;
    if (record.daily_income > appState.targetBaseline) {
      vaultDelta = record.daily_income - appState.targetBaseline;
      runningVault += vaultDelta;
      smoothedWallet = appState.targetBaseline;
    } else if (record.daily_income < appState.targetBaseline) {
      const shortfall = appState.targetBaseline - record.daily_income;
      const disbursed = Math.min(shortfall, runningVault);
      runningVault -= disbursed;
      smoothedWallet = record.daily_income + disbursed;
      vaultDelta = -disbursed;
    }
    return {
      date: record.date,
      raw_income: record.daily_income,
      smoothed_income: smoothedWallet,
      expenses: record.expenses,
      vault_delta: vaultDelta,
      weather: record.weather_condition
    };
  });

  res.json({
    success: true,
    worker: appState.workerProfile,
    target_baseline: appState.targetBaseline,
    main_balance: appState.mainBalance,
    vault_balance: appState.vaultBalance,
    vault_capacity: appState.vaultCapacity,
    total_income_30d: totalIncome,
    total_expenses_30d: totalExpenses,
    net_earnings_30d: netEarnings,
    gig_score_details: gigScoreData,
    active_advances: appState.activeAdvances,
    recent_transactions: appState.transactions,
    history: historicalData,
    smoothed_comparison: smoothedSeries,
    weather_alert: {
      location: 'Chennai South & OMR IT Corridor',
      condition: 'Heavy Rain & Northeast Monsoon Surge',
      temperature: '28°C',
      surge_multiplier: '1.45x',
      projected_extra_earnings: 650,
      recommended_shift: '17:00 - 22:00 IST',
      ai_recommendation: 'High customer demand expected in Velachery & T. Nagar. Work 5 peak evening hours to bank ₹750+ surplus into your Safety Vault!'
    }
  });
});

/**
 * 2. POST /api/update-profile
 * Updates the active logged-in worker profile dynamically
 */
app.post('/api/update-profile', (req, res) => {
  const { name, platform, city, hub, phone } = req.body;
  if (name && name.trim()) appState.workerProfile.name = name.trim();
  if (platform) {
    appState.workerProfile.platforms = Array.isArray(platform) ? platform : [platform];
  }
  if (city) appState.workerProfile.city = city;
  if (hub) appState.workerProfile.hub = hub;
  if (phone) appState.workerProfile.phone = phone;

  res.json({
    success: true,
    message: 'Worker profile updated successfully.',
    worker: appState.workerProfile
  });
});

/**
 * 3. POST /api/smooth-income
 * Takes { daily_income, target_baseline = 1000 }
 * - If daily_income > target_baseline: Auto-sweeps difference into vault_balance
 * - If daily_income < target_baseline: Disburses shortfall from vault_balance into main_balance
 * Returns updated main_balance, vault_balance, and transaction status.
 */
app.post('/api/smooth-income', (req, res) => {
  const dailyIncome = parseFloat(req.body.daily_income);
  const targetBaseline = parseFloat(req.body.target_baseline) || appState.targetBaseline;

  if (isNaN(dailyIncome) || dailyIncome < 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid daily_income provided. Must be a non-negative number.'
    });
  }

  appState.targetBaseline = targetBaseline;
  let action = 'BALANCED';
  let sweepAmount = 0;
  let disburseAmount = 0;
  let statusMessage = '';
  let statusMessageTa = '';

  if (dailyIncome > targetBaseline) {
    sweepAmount = Math.round(dailyIncome - targetBaseline);
    appState.vaultBalance += sweepAmount;
    appState.mainBalance += targetBaseline;
    action = 'AUTO_SWEPT_TO_VAULT';
    statusMessage = `Surplus of ₹${sweepAmount.toLocaleString('en-IN')} automatically swept into Safety Vault buffer.`;
    statusMessageTa = `உபரி தொகை ₹${sweepAmount.toLocaleString('en-IN')} தானாகவே பாதுகாப்பு சேமிப்பு பெட்டகத்தில் சேர்க்கப்பட்டது.`;
  } else if (dailyIncome < targetBaseline) {
    const shortfall = Math.round(targetBaseline - dailyIncome);
    disburseAmount = Math.min(shortfall, appState.vaultBalance);
    appState.vaultBalance -= disburseAmount;
    appState.mainBalance += (dailyIncome + disburseAmount);
    action = 'DISBURSED_FROM_VAULT';
    statusMessage = `Shortfall of ₹${disburseAmount.toLocaleString('en-IN')} disbursed from Safety Vault to guarantee ₹${(dailyIncome + disburseAmount).toLocaleString('en-IN')} baseline living income.`;
    statusMessageTa = `வருமான இடைவெளி ₹${disburseAmount.toLocaleString('en-IN')} பாதுகாப்பு சேமிப்பிலிருந்து வழங்கப்பட்டு ₹${(dailyIncome + disburseAmount).toLocaleString('en-IN')} சமப்படுத்தப்பட்டது.`;
  } else {
    appState.mainBalance += dailyIncome;
    action = 'BALANCED';
    statusMessage = 'Daily income exactly matched your target baseline. No buffer adjustment needed.';
    statusMessageTa = 'இன்றைய வருமானம் இலக்கை சரியாக எட்டியுள்ளது. பெட்டக மாற்றம் தேவையில்லை.';
  }

  // Record transaction
  const txn = {
    id: 'TXN-' + Date.now().toString().slice(-5),
    date: new Date().toISOString().split('T')[0],
    time: new Date().toLocaleTimeString('en-IN'),
    action: action,
    daily_income: dailyIncome,
    target_baseline: targetBaseline,
    amount: sweepAmount || disburseAmount,
    vault_balance_after: appState.vaultBalance,
    main_balance_after: appState.mainBalance,
    message: statusMessage,
    message_ta: statusMessageTa
  };

  appState.transactions.unshift(txn);
  if (appState.transactions.length > 20) appState.transactions.pop();

  return res.json({
    success: true,
    action: action,
    daily_income: dailyIncome,
    target_baseline: targetBaseline,
    swept_amount: sweepAmount,
    disbursed_amount: disburseAmount,
    main_balance: appState.mainBalance,
    vault_balance: appState.vaultBalance,
    transaction: txn,
    status_message: statusMessage,
    status_message_ta: statusMessageTa
  });
});

/**
 * 4. POST /api/calculate-gigscore
 * Calculates work-based credit rating (300 to 800)
 */
app.post('/api/calculate-gigscore', (req, res) => {
  const customData = req.body.data && Array.isArray(req.body.data) ? req.body.data : historicalData;
  const result = computeGigScore(customData);
  res.json({
    success: true,
    ...result
  });
});

/**
 * 5. POST /api/request-advance
 * Takes { requested_amount }, verifies eligibility against gig_score,
 * and credits funds instantly into main_balance with automated repayment schedule against upcoming shifts.
 */
app.post('/api/request-advance', (req, res) => {
  const requestedAmount = parseFloat(req.body.requested_amount);
  const gigScoreInfo = computeGigScore(historicalData);

  if (isNaN(requestedAmount) || requestedAmount <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid requested_amount. Please enter a valid positive amount.'
    });
  }

  if (requestedAmount > gigScoreInfo.max_eligible_credit) {
    return res.status(403).json({
      success: false,
      error: `Requested amount ₹${requestedAmount.toLocaleString('en-IN')} exceeds your GIG-Score limit of ₹${gigScoreInfo.max_eligible_credit.toLocaleString('en-IN')}.`,
      max_eligible: gigScoreInfo.max_eligible_credit
    });
  }

  // Credit funds instantly to main liquid balance
  appState.mainBalance += requestedAmount;

  // Generate 4-shift micro-repayment schedule (anti-predatory, 0% interest)
  const installmentCount = 4;
  const perShiftDeduction = Math.round(requestedAmount / installmentCount);
  const repaymentSchedule = [];
  const today = new Date();

  for (let i = 1; i <= installmentCount; i++) {
    const shiftDate = new Date(today);
    shiftDate.setDate(today.getDate() + i);
    repaymentSchedule.push({
      shift_number: i,
      deduction_date: shiftDate.toISOString().split('T')[0],
      amount: i === installmentCount ? (requestedAmount - (perShiftDeduction * (installmentCount - 1))) : perShiftDeduction,
      source: 'Auto-deducted from daily platform settlement',
      status: 'SCHEDULED'
    });
  }

  const advanceRecord = {
    id: 'ADV-' + Date.now().toString().slice(-6),
    amount: requestedAmount,
    interest_rate: '0% (Shift-Backed Ethical Micro-Advance)',
    processing_fee: 0,
    timestamp: new Date().toISOString(),
    status: 'DISBURSED',
    disbursed_to: `UPI / ${appState.workerProfile.name} Wallet`,
    installments: installmentCount,
    per_shift_deduction: perShiftDeduction,
    repayment_schedule: repaymentSchedule
  };

  appState.activeAdvances.unshift(advanceRecord);

  // Record audit transaction
  appState.transactions.unshift({
    id: 'TXN-' + Date.now().toString().slice(-5),
    date: new Date().toISOString().split('T')[0],
    time: new Date().toLocaleTimeString('en-IN'),
    action: 'MICRO_ADVANCE_CREDITED',
    amount: requestedAmount,
    vault_balance_after: appState.vaultBalance,
    main_balance_after: appState.mainBalance,
    message: `Instant shift-backed advance of ₹${requestedAmount.toLocaleString('en-IN')} credited to ${appState.workerProfile.name}'s Wallet.`,
    message_ta: `₹${requestedAmount.toLocaleString('en-IN')} உடனடி பணி முன்பணம் ${appState.workerProfile.name} பணப்பையில் சேர்க்கப்பட்டது.`
  });

  res.json({
    success: true,
    message: `Instant approval! ₹${requestedAmount.toLocaleString('en-IN')} credited to your wallet.`,
    message_ta: `உடனடி ஒப்புதல்! ₹${requestedAmount.toLocaleString('en-IN')} உங்கள் முதன்மை கணக்கில் வரவு வைக்கப்பட்டது.`,
    new_main_balance: appState.mainBalance,
    vault_balance: appState.vaultBalance,
    advance: advanceRecord
  });
});

/**
 * 6. GET /api/weather-surge
 */
app.get('/api/weather-surge', (req, res) => {
  res.json({
    success: true,
    city: 'Chennai',
    zones: [
      { name: 'OMR - Sholinganallur IT Expressway', demand: 'High Surge', surge_rate: '1.5x', reason: 'Evening IT Shift Logout + Rain' },
      { name: 'T. Nagar & Pondy Bazaar', demand: 'Very High', surge_rate: '1.6x', reason: 'Shopping & Dining Peak' },
      { name: 'Velachery & Phoenix Marketcity', demand: 'High Surge', surge_rate: '1.45x', reason: 'Dinner Food Delivery Rush' },
      { name: 'Guindy / Airport Corridor', demand: 'Moderate', surge_rate: '1.25x', reason: 'Inter-hub Transit' }
    ],
    northeast_monsoon_warning: true,
    advisory: 'Safety first: Keep rain gear equipped. High surge will offset upcoming lean mid-week days.'
  });
});

/**
 * 7. POST /api/reset-demo
 */
app.post('/api/reset-demo', (req, res) => {
  const currentWorker = JSON.parse(JSON.stringify(appState.workerProfile));
  appState = JSON.parse(JSON.stringify(DEFAULT_STATE));
  // Preserve custom name if user logged in
  if (currentWorker && currentWorker.name) {
    appState.workerProfile.name = currentWorker.name;
    appState.workerProfile.platforms = currentWorker.platforms;
    appState.workerProfile.city = currentWorker.city;
  }
  res.json({
    success: true,
    message: 'Demo state successfully reset to initial defaults.',
    state: appState
  });
});

// Start Server
app.listen(PORT, () => {
  console.log('==================================================');
  console.log(`⚡ EquiPulse Backend running on http://localhost:${PORT}`);
  console.log(`⚡ Frontend served at http://localhost:${PORT}/`);
  console.log('==================================================');
});
