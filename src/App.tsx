import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell 
} from 'recharts';
import { 
  Search, Plus, Edit, Trash2, Shield, LogOut, Check, X, 
  RefreshCw, Lock, User, FileSpreadsheet, Calendar, 
  Database, Info, ListFilter, IndianRupee, HelpCircle, ChevronRight,
  Clock, CalendarRange, TrendingUp, ChevronDown, ChevronUp, Copy, Phone, FileText, Layers, Tag, AlertTriangle, Sun, Moon, PieChart as PieChartIcon
} from 'lucide-react';
import { 
  initAuth, googleSignIn, logoutGoogle, getAccessToken 
} from './firebase';
import { 
  PledgeRecord, Submission, ActivityLog, OnlineUser, DashboardStats 
} from './types';

// Helper to parse diverse date strings safely to a midnight Date object
const parsePledgeDateToMidnight = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const clean = String(dateStr).trim();
  if (!clean) return null;
  
  const noTime = clean.split('T')[0];
  const parts = noTime.split(/[-/.]/);
  if (parts.length === 3) {
    const p0 = parseInt(parts[0], 10);
    const p1 = parseInt(parts[1], 10);
    const p2 = parseInt(parts[2], 10);

    if (parts[0].length === 4) {
      // YYYY-MM-DD
      const d = new Date(p0, p1 - 1, p2);
      if (!isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        return d;
      }
    } else if (parts[2].length === 4) {
      // DD-MM-YYYY
      const d = new Date(p2, p1 - 1, p0);
      if (!isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        return d;
      }
    }
  }
  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return null;
};

const formatDateToKey = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 📊 Custom Tooltip for Recharts Admin Trend Line Chart
const CustomChartTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-950 text-white border border-slate-800 p-3.5 rounded-2xl shadow-2xl text-xs space-y-2 font-sans min-w-[210px] z-50">
        <div className="font-mono text-[10px] font-extrabold text-amber-400 uppercase tracking-widest border-b border-slate-800 pb-1.5 flex justify-between items-center">
          <span>📅 {data.displayDate}</span>
          <span className="text-slate-500 font-normal">{data.dateKey}</span>
        </div>
        <div className="space-y-1.5 font-mono text-[11px]">
          <div className="flex justify-between items-center">
            <span className="text-amber-400 font-bold">Daily Loan Principal:</span>
            <span className="font-black text-white text-xs">₹{data.dailyPrincipal.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between items-center text-slate-300">
            <span className="text-slate-400">Pledges Submitted:</span>
            <span className="font-bold text-slate-200">{data.pledgeCount} record(s)</span>
          </div>
          <div className="flex justify-between items-center border-t border-slate-800/80 pt-1.5">
            <span className="text-indigo-400 font-bold">Cumulative Growth:</span>
            <span className="font-bold text-indigo-300">₹{data.cumulativePrincipal.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

// 🥧 Custom Tooltip for Weight Distribution Pie Chart
const CustomPieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-950 text-white border border-slate-800 p-3.5 rounded-2xl shadow-2xl text-xs space-y-2 font-sans min-w-[210px] z-50">
        <div className="font-mono text-[10px] font-extrabold uppercase tracking-widest border-b border-slate-800 pb-1.5 flex justify-between items-center" style={{ color: data.color }}>
          <span>⚖️ Weight: {data.rangeLabel}</span>
          <span className="text-slate-400 font-normal">{data.percentage}%</span>
        </div>
        <div className="space-y-1.5 font-mono text-[11px]">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Pledge Count:</span>
            <span className="font-black text-white text-xs">{data.count} items</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Total Gold Weight:</span>
            <span className="font-bold text-amber-400">{data.totalWeight.toFixed(1)} g</span>
          </div>
          <div className="flex justify-between items-center border-t border-slate-800/80 pt-1.5">
            <span className="text-emerald-400 font-bold">Total Loan Value:</span>
            <span className="font-bold text-emerald-300">₹{data.totalAmount.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

// Helper to calculate exact months elapsed from pledge_date to current month or release_date
const getMonthsAndInterestCalc = (pledgeDateStr: string, releaseDateStr?: string, principalAmount?: number) => {
  if (!pledgeDateStr) return { months: 0, text: 'N/A', estInterest: 0 };
  try {
    let startDate: Date;
    const cleanDate = pledgeDateStr.trim();
    const dParts = cleanDate.split(/[-/]/);
    if (dParts.length === 3) {
      if (dParts[0].length === 2 && dParts[2].length === 4) {
        // DD-MM-YYYY format
        const day = parseInt(dParts[0], 10);
        const month = parseInt(dParts[1], 10) - 1;
        const year = parseInt(dParts[2], 10);
        startDate = new Date(year, month, day);
      } else if (dParts[0].length === 4) {
        // YYYY-MM-DD
        const year = parseInt(dParts[0], 10);
        const month = parseInt(dParts[1], 10) - 1;
        const day = parseInt(dParts[2], 10);
        startDate = new Date(year, month, day);
      } else {
        startDate = new Date(cleanDate);
      }
    } else {
      startDate = new Date(cleanDate);
    }

    if (isNaN(startDate.getTime())) {
      return { months: 0, text: 'Format Err', estInterest: 0 };
    }

    let endDate = new Date();
    if (releaseDateStr && releaseDateStr.trim()) {
      const rClean = releaseDateStr.trim();
      const rParts = rClean.split(/[-/]/);
      if (rParts.length === 3) {
        if (rParts[0].length === 2 && rParts[2].length === 4) {
          const day = parseInt(rParts[0], 10);
          const month = parseInt(rParts[1], 10) - 1;
          const year = parseInt(rParts[2], 10);
          endDate = new Date(year, month, day);
        } else if (rParts[0].length === 4) {
          const year = parseInt(rParts[0], 10);
          const month = parseInt(rParts[1], 10) - 1;
          const day = parseInt(rParts[2], 10);
          endDate = new Date(year, month, day);
        } else {
          endDate = new Date(rClean);
        }
      } else {
        endDate = new Date(rClean);
      }
    }

    const diffMs = endDate.getTime() - startDate.getTime();
    if (diffMs <= 0) return { months: 0, text: '0.0 Mon', estInterest: 0, startDate, endDate };

    const days = diffMs / (1000 * 60 * 60 * 24);
    const monthsDouble = days / 30.4375;
    const months = Math.round(monthsDouble * 10) / 10;

    let estInterest = 0;
    if (principalAmount && principalAmount > 0) {
      estInterest = Math.round(principalAmount * 0.02 * months);
    }

    let text = `${months} mo`;
    return { months, text, estInterest, startDate, endDate };
  } catch {
    return { months: 0, text: 'Calc Err', estInterest: 0 };
  }
};

export default function App() {
  // Theme state for Liquid Glass (Dark / Light)
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('liquid_theme');
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    localStorage.setItem('liquid_theme', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Authentication & session states
  const [sessionToken, setSessionToken] = useState<string | null>(localStorage.getItem('session_token'));
  const [currentUser, setCurrentUser] = useState<{ username: string; role: 'admin' | 'user' } | null>(null);
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  
  // Navigation
  const [activeTab, setActiveTab] = useState<'search' | 'add' | 'edit' | 'view_all' | 'admin'>('search');
  
  // Custom Login view details
  const [loginUname, setLoginUname] = useState<string>('');
  const [loginPw, setLoginPw] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState<boolean>(false);

  // Home (Search) states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<PledgeRecord[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // Add Record states
  const [fPledgeDate, setFPledgeDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [fName, setFName] = useState<string>('');
  const [fPhone, setFPhone] = useState<string>('');
  const [fItemName, setFItemName] = useState<string>('');
  const [fNoItems, setFNoItems] = useState<string>('1');
  const [fWeight, setFWeight] = useState<string>('');
  const [fAmount, setFAmount] = useState<string>('');
  const [fLocker, setFLocker] = useState<string>('');
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Edit Record states
  const [editLookupId, setEditLookupId] = useState<string>('');
  const [loadedEditRecord, setLoadedEditRecord] = useState<PledgeRecord | null>(null);
  const [isEditLoading, setIsEditLoading] = useState<boolean>(false);
  const [editError, setEditError] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  
  // Fields for Editing form
  const [eName, setEName] = useState<string>('');
  const [ePhone, setEPhone] = useState<string>('');
  const [eItemName, setEItemName] = useState<string>('');
  const [eNoItems, setENoItems] = useState<number>(1);
  const [eWeight, setEWeight] = useState<number>(0);
  const [eAmount, setEAmount] = useState<number>(0);
  const [ePledgeDate, setEPledgeDate] = useState<string>('');
  const [eReleaseDate, setEReleaseDate] = useState<string>('');
  const [eLocker, setELocker] = useState<string>('');

  // View All states
  const [allRecords, setAllRecords] = useState<PledgeRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<PledgeRecord[]>([]);
  const [isInventoryRefreshing, setIsInventoryRefreshing] = useState<boolean>(false);
  const [inventorySearch, setInventorySearch] = useState<string>('');
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState<string>('');
  const [stalePledgeThresholdMonths, setStalePledgeThresholdMonths] = useState<number>(12); // Configurable threshold (default 12 months)
  const [inventorySortCol, setInventorySortCol] = useState<keyof PledgeRecord>('number');
  const [inventorySortDir, setInventorySortDir] = useState<number>(1);
  const [inventoryMinMonths, setInventoryMinMonths] = useState<string>('');
  const [inventoryMaxMonths, setInventoryMaxMonths] = useState<string>('');
  const [inventoryStartDate, setInventoryStartDate] = useState<string>('');
  const [inventoryEndDate, setInventoryEndDate] = useState<string>('');
  const [recordPage, setRecordPage] = useState<number>(1);
  const RECORDS_PER_PAGE = 15;
  const [expandedRecordNum, setExpandedRecordNum] = useState<number | null>(null);
  const [deletePendingNum, setDeletePendingNum] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [editConfirmActive, setEditConfirmActive] = useState<boolean>(false);
  const [rejectPendingId, setRejectPendingId] = useState<number | null>(null);
  const [actionProcessingMsg, setActionProcessingMsg] = useState<string | null>(null);

  // Admin states
  const [adminStats, setAdminStats] = useState<DashboardStats | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState<boolean>(false);
  const [allPendingQueue, setAllPendingQueue] = useState<Submission[]>([]);

  // CSV Export Loading States
  const [isExportingSubmissions, setIsExportingSubmissions] = useState<boolean>(false);
  const [isExportingByDate, setIsExportingByDate] = useState<boolean>(false);
  const [isExportingAll, setIsExportingAll] = useState<boolean>(false);
  const [isSavingToDrive, setIsSavingToDrive] = useState<boolean>(false);

  // Loan interest calculator states
  const [calcInterestPrincipal, setCalcInterestPrincipal] = useState<string>('');
  const [calcInterestRate, setCalcInterestRate] = useState<string>('2.0'); // defaults to 2% monthly interest
  const [calcInterestMonths, setCalcInterestMonths] = useState<string>('');

  // Administrative Quick Search States
  const [adminSearchQuery, setAdminSearchQuery] = useState<string>('');
  const [adminSearchResults, setAdminSearchResults] = useState<PledgeRecord[]>([]);
  const [isAdminSearching, setIsAdminSearching] = useState<boolean>(false);

  // Toast / Status state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | 'warning' | 'info'>('success');

  // 📈 Calculate Loan Principal Trend based on active date range filter or default 30-day window
  const { loanTrendData, trendDateRangeInfo } = useMemo(() => {
    let startD: Date;
    let endD: Date;
    const isFiltered = Boolean(inventoryStartDate || inventoryEndDate);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (inventoryStartDate && inventoryEndDate) {
      const s = parsePledgeDateToMidnight(inventoryStartDate) || new Date(today);
      const e = parsePledgeDateToMidnight(inventoryEndDate) || new Date(today);
      if (s.getTime() <= e.getTime()) {
        startD = s;
        endD = e;
      } else {
        startD = e;
        endD = s;
      }
    } else if (inventoryStartDate) {
      startD = parsePledgeDateToMidnight(inventoryStartDate) || new Date(today);
      endD = new Date(today);
      if (startD.getTime() > endD.getTime()) {
        endD = new Date(startD);
      }
    } else if (inventoryEndDate) {
      endD = parsePledgeDateToMidnight(inventoryEndDate) || new Date(today);
      startD = new Date(endD);
      startD.setDate(endD.getDate() - 29);
    } else {
      endD = new Date(today);
      startD = new Date(today);
      startD.setDate(today.getDate() - 29);
    }

    const dateMap: { [key: string]: { displayDate: string; dailyPrincipal: number; count: number } } = {};
    const dateKeysInOrder: string[] = [];

    const curr = new Date(startD);
    let safetyCounter = 0;
    while (curr.getTime() <= endD.getTime() && safetyCounter < 730) {
      const key = formatDateToKey(curr);
      const day = String(curr.getDate()).padStart(2, '0');
      const monthShort = curr.toLocaleString('en-US', { month: 'short' });
      const yearStr = curr.getFullYear() !== today.getFullYear() ? ` '${String(curr.getFullYear()).slice(-2)}` : '';
      const displayDate = `${day} ${monthShort}${yearStr}`;

      dateMap[key] = { displayDate, dailyPrincipal: 0, count: 0 };
      dateKeysInOrder.push(key);

      curr.setDate(curr.getDate() + 1);
      safetyCounter++;
    }

    // Process all records
    allRecords.forEach(rec => {
      if (!rec.pledge_date) return;
      const parsedDate = parsePledgeDateToMidnight(rec.pledge_date);
      if (parsedDate) {
        const key = formatDateToKey(parsedDate);
        if (dateMap[key]) {
          dateMap[key].dailyPrincipal += (Number(rec.amount) || 0);
          dateMap[key].count += 1;
        }
      }
    });

    let runningCumulative = 0;
    const trendData = dateKeysInOrder.map(key => {
      const item = dateMap[key];
      runningCumulative += item.dailyPrincipal;
      return {
        dateKey: key,
        displayDate: item.displayDate,
        dailyPrincipal: item.dailyPrincipal,
        cumulativePrincipal: runningCumulative,
        pledgeCount: item.count
      };
    });

    const daysSpan = dateKeysInOrder.length;
    const startFormatted = startD.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const endFormatted = endD.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    return {
      loanTrendData: trendData,
      trendDateRangeInfo: {
        isFiltered,
        daysSpan,
        startFormatted,
        endFormatted,
        startDateKey: formatDateToKey(startD),
        endDateKey: formatDateToKey(endD),
        title: isFiltered 
          ? `Loan Principal Trend (${daysSpan} Days)` 
          : '30-Day Loan Principal Trend',
        subtitle: isFiltered
          ? `Visualizing daily pledge principal outlays & cumulative loan growth from ${startFormatted} to ${endFormatted}`
          : 'Visualizing daily pledge principal outlays & cumulative loan growth over the last 30 days based on pledge dates'
      }
    };
  }, [allRecords, inventoryStartDate, inventoryEndDate]);

  const totalTrendAmount = useMemo(() => {
    return loanTrendData.reduce((acc, curr) => acc + curr.dailyPrincipal, 0);
  }, [loanTrendData]);

  const totalTrendPledges = useMemo(() => {
    return loanTrendData.reduce((acc, curr) => acc + curr.pledgeCount, 0);
  }, [loanTrendData]);

  const peakTrendAmount = useMemo(() => {
    return Math.max(...loanTrendData.map(d => d.dailyPrincipal), 0);
  }, [loanTrendData]);

  const averageDailyTrendAmount = useMemo(() => {
    if (loanTrendData.length === 0) return 0;
    return Math.round(totalTrendAmount / loanTrendData.length);
  }, [loanTrendData, totalTrendAmount]);

  // 🥧 Calculate Weight Range Distribution for Pie Chart Visualization
  const pledgeWeightDistributionData = useMemo(() => {
    let under5Count = 0;
    let under5Weight = 0;
    let under5Amount = 0;

    let between5And10Count = 0;
    let between5And10Weight = 0;
    let between5And10Amount = 0;

    let over10Count = 0;
    let over10Weight = 0;
    let over10Amount = 0;

    allRecords.forEach((rec) => {
      const w = Number(rec.net_weight) || 0;
      const amt = Number(rec.amount) || 0;
      if (w < 5) {
        under5Count++;
        under5Weight += w;
        under5Amount += amt;
      } else if (w <= 10) {
        between5And10Count++;
        between5And10Weight += w;
        between5And10Amount += amt;
      } else {
        over10Count++;
        over10Weight += w;
        over10Amount += amt;
      }
    });

    const totalRecordsCount = allRecords.length || 1;

    return [
      {
        name: '< 5g (Light)',
        rangeLabel: '< 5g',
        description: 'Lightweight Ornaments & Coins',
        count: under5Count,
        percentage: ((under5Count / totalRecordsCount) * 100).toFixed(1),
        totalWeight: under5Weight,
        totalAmount: under5Amount,
        color: '#007aff',
        badgeBg: 'bg-[#007aff]/10 text-[#007aff] dark:text-[#5ac8fa] border-[#007aff]/30',
      },
      {
        name: '5 - 10g (Medium)',
        rangeLabel: '5 - 10g',
        description: 'Standard Rings, Chains & Bangles',
        count: between5And10Count,
        percentage: ((between5And10Count / totalRecordsCount) * 100).toFixed(1),
        totalWeight: between5And10Weight,
        totalAmount: between5And10Amount,
        color: '#f59e0b',
        badgeBg: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
      },
      {
        name: '> 10g (Heavy)',
        rangeLabel: '> 10g',
        description: 'Heavy Necklaces, Sets & Bars',
        count: over10Count,
        percentage: ((over10Count / totalRecordsCount) * 100).toFixed(1),
        totalWeight: over10Weight,
        totalAmount: over10Amount,
        color: '#10b981',
        badgeBg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
      },
    ];
  }, [allRecords]);

  // ⚠️ Stale Pledge metrics calculation based on configurable threshold
  const staleRecordsCount = useMemo(() => {
    return allRecords.filter(r => {
      if (r.release_date) return false;
      const info = getMonthsAndInterestCalc(r.pledge_date, r.release_date);
      return info.months >= stalePledgeThresholdMonths;
    }).length;
  }, [allRecords, stalePledgeThresholdMonths]);

  const staleRecordsAmount = useMemo(() => {
    return allRecords.filter(r => {
      if (r.release_date) return false;
      const info = getMonthsAndInterestCalc(r.pledge_date, r.release_date);
      return info.months >= stalePledgeThresholdMonths;
    }).reduce((acc, r) => acc + (r.amount || 0), 0);
  }, [allRecords, stalePledgeThresholdMonths]);

  // Trigger toast alert helper
  const triggerToast = (msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Pre-load pledge data values into interest calculator
  const loadPledgeToCalculator = (rec: PledgeRecord) => {
    setCalcInterestPrincipal(String(rec.amount));
    setCalcInterestRate('2.0'); // standard monthly interest rate
    
    const calcInfo = getMonthsAndInterestCalc(rec.pledge_date, rec.release_date);
    setCalcInterestMonths(String(calcInfo.months || 0));
    
    // Smooth scroll to interest calculator section
    setTimeout(() => {
      const calculatorEl = document.getElementById('rates-calculator-section');
      if (calculatorEl) {
        calculatorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
    triggerToast(`Pledge #${rec.number} details & elapsed months (${calcInfo.months} mo) loaded into Interest Calculator!`, 'success');
  };

  // On component mount: initialize authentication listeners
  useEffect(() => {
    // 1. Fetch current user session from our own Node.js server
    if (sessionToken) {
      fetch('/api/me', {
        headers: { 'x-session-token': sessionToken }
      })
      .then(res => {
        if (res.ok) {
          return res.json();
        } else {
          throw new Error('Session invalid');
        }
      })
      .then(user => {
        setCurrentUser(user);
        // Determine starting tab
        if (user.role === 'admin') {
          setActiveTab('admin');
        } else {
          setActiveTab('search');
        }
      })
      .catch(() => {
        setSessionToken(null);
        localStorage.removeItem('session_token');
        setCurrentUser(null);
      })
      .finally(() => {
        setAuthChecking(false);
      });
    } else {
      setAuthChecking(false);
    }

    // 2. Initialize Firebase Sign-In auth checking
    initAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
      }
    );
  }, [sessionToken]);

  // 3. Month-End Automatic Google Drive Backup 
  // Runs seamlessly in the background when app is accessed on the last day of the month by admin
  useEffect(() => {
    if (!googleToken || !sessionToken || currentUser?.role !== 'admin') return;

    const checkAndRunMonthEndBackup = async () => {
      const today = new Date();
      // Check if tomorrow is the 1st of the month (which means today is the last day)
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      if (tomorrow.getDate() === 1) {
        const monthKey = `auto_backup_${today.getFullYear()}_${today.getMonth()}`;
        const hasBackedUp = localStorage.getItem(monthKey);
        
        if (!hasBackedUp) {
          triggerToast('Executing automatic month-end backups to Google Drive in the background...', 'success');
          // Start auto backup and skip manual confirmation
          await saveBackupsToDrive(true);
          localStorage.setItem(monthKey, 'true');
        }
      }
    };

    checkAndRunMonthEndBackup();
  }, [googleToken, sessionToken, currentUser]);

  // (Gold & Silver rates options removed as requested)

  const renderLiveRatesWidget = () => {
    // Monthly Loan Interest Calculations
    const parsedPrincipal = parseFloat(calcInterestPrincipal);
    const parsedIntRate = parseFloat(calcInterestRate);
    const parsedMonths = parseFloat(calcInterestMonths);

    const monthlyInterest = (!isNaN(parsedPrincipal) && !isNaN(parsedIntRate) && parsedPrincipal > 0 && parsedIntRate > 0)
      ? (parsedPrincipal * parsedIntRate / 100)
      : 0;
    const totalAccumulatedInterest = monthlyInterest * (parsedMonths || 0);
    const totalRepaymentAmount = (parsedPrincipal || 0) + totalAccumulatedInterest;

    return (
      <div id="rates-calculator-section" className="bg-slate-50 border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4 animate-fade-in scroll-mt-24">
        
        {/* Top Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/50 dark:border-slate-800/60">
          <div>
            <span className="glass-badge px-2.5 py-1 text-[#007aff] dark:text-[#5ac8fa] text-[10px] font-mono font-bold uppercase tracking-wider inline-block">
              LOAN INTEREST CALCULATOR
            </span>
            <h4 className="font-syne font-black text-slate-900 dark:text-white text-base mt-1">Simple Interest Estimator</h4>
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
            Interest = Principal × Rate% × Tenure (Months)
          </span>
        </div>

        {/* Loan Interest Calculator Content Area */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 font-mono">
                Loan Outlay / Principal (₹)
              </label>
              <input 
                type="number" 
                value={calcInterestPrincipal}
                onChange={(e) => setCalcInterestPrincipal(e.target.value)}
                placeholder="e.g. 50000"
                className="w-full text-xs font-mono font-bold px-3.5 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/80 dark:bg-slate-900/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007aff]"
                min="0"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 font-mono">
                Interest Rate (% per month)
              </label>
              <input 
                type="number" 
                value={calcInterestRate}
                onChange={(e) => setCalcInterestRate(e.target.value)}
                placeholder="e.g. 1.5 or 2.0"
                className="w-full text-xs font-mono font-bold px-3.5 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/80 dark:bg-slate-900/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007aff]"
                min="0"
                step="0.1"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 font-mono">
                Pledge Duration (Months)
              </label>
              <input 
                type="number" 
                value={calcInterestMonths}
                onChange={(e) => setCalcInterestMonths(e.target.value)}
                placeholder="e.g. 3 or 6"
                className="w-full text-xs font-mono font-bold px-3.5 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/80 dark:bg-slate-900/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007aff]"
                min="0"
                step="0.5"
              />
            </div>
          </div>

          {/* Ledger Breakdown */}
          {parsedPrincipal > 0 && (
            <div className="bg-slate-100/60 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 text-center sm:text-left">
              <div className="flex flex-col justify-center">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono">Principal Outlay</span>
                <span className="text-sm font-black font-mono text-slate-900 dark:text-white mt-1">₹{parsedPrincipal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex flex-col justify-center pt-3 sm:pt-0 sm:pl-4">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono">Monthly Interest</span>
                <span className="text-sm font-black font-mono text-amber-600 dark:text-amber-400 mt-1">₹{Math.round(monthlyInterest).toLocaleString('en-IN')} /mo</span>
              </div>
              <div className="flex flex-col justify-center pt-3 sm:pt-0 sm:pl-4">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono">Accumulated Interest</span>
                <span className="text-sm font-black font-mono text-rose-500 dark:text-rose-400 mt-1">₹{Math.round(totalAccumulatedInterest).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex flex-col justify-center pt-3 sm:pt-0 sm:pl-4 bg-amber-500/10 dark:bg-amber-500/15 p-3 rounded-xl border border-amber-500/20 text-center">
                <span className="text-[9px] font-black text-amber-700 dark:text-amber-300 uppercase tracking-widest font-mono">Total Due Repayment</span>
                <span className="text-base font-black font-mono text-slate-950 dark:text-white mt-1">₹{Math.round(totalRepaymentAmount).toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Load submissions for normal user
  const loadUserSubmissions = async () => {
    if (!sessionToken || !googleToken) return;
    try {
      const res = await fetch('/api/my-pending', {
        headers: {
          'x-session-token': sessionToken,
          'Authorization': `Bearer ${googleToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setMySubmissions(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Load admin stats & approvals
  const loadAdminDashboardData = async () => {
    if (!sessionToken || !googleToken || currentUser?.role !== 'admin') return;
    setIsStatsLoading(true);
    try {
      // Load general stats (online, records, totals, history Logs)
      const statsRes = await fetch('/api/admin/stats', {
        headers: {
          'x-session-token': sessionToken,
          'Authorization': `Bearer ${googleToken}`
        }
      });
      if (statsRes.status === 412) {
        setIsStatsLoading(false);
        return; // Prompt connecting template
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setAdminStats(data);
      }

      // Load pending reviews queue
      const pendingRes = await fetch('/api/pending', {
        headers: {
          'x-session-token': sessionToken,
          'Authorization': `Bearer ${googleToken}`
        }
      });
      if (pendingRes.ok) {
        const data = await pendingRes.json();
        setAllPendingQueue(data);
      }

      // Also load all inventory records so chart and trend analytics stay updated
      loadAllInventoryRecords();
    } catch (err) {
      console.error('Failed to load admin dashboard:', err);
    } finally {
      setIsStatsLoading(false);
    }
  };

  // Trigger loads when active views change
  useEffect(() => {
    if (activeTab === 'add') {
      loadUserSubmissions();
    } else if (activeTab === 'admin') {
      loadAdminDashboardData();
      loadAllInventoryRecords();
    } else if (activeTab === 'view_all') {
      loadAllInventoryRecords();
    }
  }, [activeTab, googleToken, sessionToken]);

  // Handle local credential login
  const handleSystemLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUname || !loginPw) {
      setLoginError('Fill in all requested fields.');
      return;
    }
    if (!googleToken) {
      setLoginError('Google Sheets link required to verify credentials.');
      return;
    }
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${googleToken}`
        },
        body: JSON.stringify({ username: loginUname, password: loginPw })
      });
      const data = await res.json();
      if (res.ok && data.sessionToken) {
        localStorage.setItem('session_token', data.sessionToken);
        setSessionToken(data.sessionToken);
        setCurrentUser({ username: loginUname.trim().toLowerCase(), role: data.role });
        triggerToast(`Welcome back, ${loginUname}! Login successful.`, 'success');
      } else {
        setLoginError(data.detail || 'Incorrect username or password.');
      }
    } catch (err) {
      setLoginError('Unable to reach the backend server.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle connection authorize login with Google
  const handleGoogleConnection = async () => {
    try {
      // Call googleSignIn immediately to preserve the synchronous user click gesture for window.open
      const signInPromise = googleSignIn();
      setIsConnectingGoogle(true);
      const result = await signInPromise;
      if (result) {
        setGoogleUser(result.user);
        setGoogleToken(result.accessToken);
        triggerToast('Google Sheets successfully connected!', 'success');
      }
    } catch (err: any) {
      console.error('Google Auth Connection Error:', err);
      if (err?.code === 'auth/popup-blocked' || err?.message?.includes('popup-blocked')) {
        triggerToast('Pop-up was blocked by your browser. Redirecting to Google Sign-In...', 'warning');
      } else if (err?.code === 'auth/popup-closed-by-user') {
        triggerToast('Sign-in window was closed before completing.', 'warning');
      } else {
        triggerToast('Google authentication failed: ' + (err.message || 'Unknown error'), 'error');
      }
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  // Standard Logout
  const handleLogout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: {
          'x-session-token': sessionToken || ''
        }
      });
    } catch(e){}
    
    setSessionToken(null);
    localStorage.removeItem('session_token');
    setCurrentUser(null);
    await logoutGoogle();
    setGoogleUser(null);
    setGoogleToken(null);
    triggerToast('Logged out securely.', 'success');
  };

  // 🔎 Search Functionality
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!googleToken) {
      if (e) triggerToast('Connect Google Sheets to fetch records!', 'warning');
      return;
    }
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/search?name=${encodeURIComponent(q)}`, {
        headers: {
          'x-session-token': sessionToken || '',
          'Authorization': `Bearer ${googleToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
        if (e && data.length === 0) {
          triggerToast(`No matching records found for "${q}"`, 'warning');
        }
      } else {
        const err = await res.json();
        if (e) triggerToast(err.detail || 'Search operation failed.', 'error');
      }
    } catch (err) {
      if (e) triggerToast('Error searching spreadsheet records.', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  // Perform live search when searchQuery changes
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const delayDebounceFn = setTimeout(() => {
      handleSearch();
    }, 400);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, googleToken]);

  // 🔎 Administrative Quick Search Functionality
  const handleAdminSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!googleToken) {
      if (e) triggerToast('Connect Google Sheets to query console database.', 'warning');
      return;
    }
    const q = adminSearchQuery.trim();
    if (!q) {
      setAdminSearchResults([]);
      return;
    }
    setIsAdminSearching(true);
    try {
      const res = await fetch(`/api/search?name=${encodeURIComponent(q)}`, {
        headers: {
          'x-session-token': sessionToken || '',
          'Authorization': `Bearer ${googleToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setAdminSearchResults(data);
      }
    } catch (err) {
      console.error('Failed administrative quick search query:', err);
    } finally {
      setIsAdminSearching(false);
    }
  };

  // Perform live admin search when adminSearchQuery changes
  useEffect(() => {
    if (!adminSearchQuery.trim()) {
      setAdminSearchResults([]);
      return;
    }
    const delayDebounceFn = setTimeout(() => {
      handleAdminSearch();
    }, 400);
    return () => clearTimeout(delayDebounceFn);
  }, [adminSearchQuery, googleToken]);

  // ➕ Submit records for approval
  const handleAddSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleToken) {
      triggerToast('Authorized Google Sheets connection required to submit.', 'error');
      return;
    }
    if (!fName || !fPhone || !fItemName || !fWeight || !fAmount) {
      triggerToast('Please complete all required fields.', 'warning');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/pending', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': sessionToken || '',
          'Authorization': `Bearer ${googleToken}`
        },
        body: JSON.stringify({
          name: fName,
          phone: fPhone,
          item_name: fItemName,
          no_of_items: parseInt(fNoItems) || 1,
          net_weight: parseFloat(fWeight) || 0,
          amount: parseFloat(fAmount) || 0,
          pledge_date: fPledgeDate,
          locker: fLocker
        })
      });
      
      const d = await res.json();
      if (res.ok) {
        if (currentUser?.role === 'admin') {
          triggerToast(`Record created and auto-approved directly to sheets! (ID #${d.pending_id})`, 'success');
          // Update admin records quietly
          loadAdminDashboardData();
        } else {
          triggerToast(`Submission #${d.pending_id} created! Sent to admin queue.`, 'success');
        }
        // Reset form
        setFName('');
        setFPhone('');
        setFItemName('');
        setFNoItems('1');
        setFWeight('');
        setFAmount('');
        setFLocker('');
        loadUserSubmissions();
      } else {
        triggerToast(d.detail || 'Submission failed.', 'error');
      }
    } catch (err) {
      triggerToast('Network error submitting records.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 🔎 Edit lookup record
  const handleEditLookup = async (e?: React.FormEvent, overrideId?: string) => {
    if (e) e.preventDefault();
    if (!googleToken) {
      triggerToast('Connect Google Sheets to lookup records!', 'warning');
      return;
    }
    const lookupId = overrideId || editLookupId;
    if (!lookupId) return;
    setIsEditLoading(true);
    setEditError('');
    setLoadedEditRecord(null);
    try {
      const res = await fetch(`/api/records/${lookupId}`, {
        headers: {
          'x-session-token': sessionToken || '',
          'Authorization': `Bearer ${googleToken}`
        }
      });
      if (res.ok) {
        const r = await res.json();
        setLoadedEditRecord(r);
        // set fields
        setEName(r.name);
        setEPhone(r.phone);
        setEItemName(r.item_name);
        setENoItems(r.no_of_items);
        setEWeight(r.net_weight);
        setEAmount(r.amount);
        setEPledgeDate(r.pledge_date);
        setEReleaseDate(r.release_date || '');
        setELocker(r.locker || '');
      } else {
        const data = await res.json();
        setEditError(data.detail || 'Record code not found.');
      }
    } catch (err) {
      setEditError('Connection error querying lookup.');
    } finally {
      setIsEditLoading(false);
    }
  };

  // 💾 Save Edited record (Triggers custom modal)
  const handleSaveEdit = () => {
    if (!loadedEditRecord) return;
    if (!googleToken) {
      triggerToast('Connect Google Sheets to perform rewrite!', 'warning');
      return;
    }
    setEditConfirmActive(true);
  };

  // Actual execution of save edit
  const executeSaveEdit = async () => {
    if (!loadedEditRecord || !googleToken) return;
    setEditConfirmActive(false);
    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/records/${loadedEditRecord.number}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': sessionToken || '',
          'Authorization': `Bearer ${googleToken}`
        },
        body: JSON.stringify({
          name: eName,
          phone: ePhone,
          item_name: eItemName,
          no_of_items: eNoItems,
          net_weight: eWeight,
          amount: eAmount,
          pledge_date: ePledgeDate,
          release_date: eReleaseDate,
          locker: eLocker
        })
      });
      if (res.ok) {
        triggerToast(`Record #${loadedEditRecord.number} edited successfully.`, 'success');
        setLoadedEditRecord(null);
        setEditLookupId('');
        // Reload all records to refresh list view immediately
        loadAllInventoryRecords();
      } else {
        const d = await res.json();
        triggerToast(d.detail || 'Update save failed.', 'error');
      }
    } catch (err) {
      triggerToast('Save communication error occurred.', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // 📋 Load all records for Grid/Filters list
  const loadAllInventoryRecords = async () => {
    if (!googleToken) return;
    setIsInventoryRefreshing(true);
    try {
      const res = await fetch('/api/records', {
        headers: {
          'x-session-token': sessionToken || '',
          'Authorization': `Bearer ${googleToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setAllRecords(data);
        setFilteredRecords(data);
        triggerToast('Inventory dataset refreshed from Google Sheets', 'success');
      } else {
        triggerToast('Failed to load records from Google Sheets', 'error');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Network error while refreshing inventory dataset', 'error');
    } finally {
      setIsInventoryRefreshing(false);
    }
  };

  // Perform client-side grid inventory filter & sort
  useEffect(() => {
    let list = [...allRecords];
    
    // search query filter
    if (inventorySearch.trim()) {
      const tokens = inventorySearch.toLowerCase().trim().split(/\s+/).filter(Boolean);
      list = list.filter(r => {
        const numStr = r.number ? `#${r.number} ${r.number}` : '';
        const nameStr = (r.name || '').toLowerCase();
        const phoneStr = (r.phone || '').toLowerCase();
        const itemStr = (r.item_name || '').toLowerCase();
        const lockerStr = (r.locker || '').toLowerCase();
        const amountStr = (r.amount || '').toString();
        const weightStr = (r.net_weight || '').toString();
        const itemsCountStr = (r.no_of_items || '').toString();
        const pledgeDateStr = (r.pledge_date || '').toLowerCase();
        const releaseDateStr = (r.release_date || '').toLowerCase();

        const combinedText = `${numStr} ${nameStr} ${phoneStr} ${itemStr} ${lockerStr} ₹${amountStr} ${amountStr} ${weightStr}g ${itemsCountStr} ${pledgeDateStr} ${releaseDateStr}`;

        return tokens.every(token => combinedText.includes(token));
      });
    }

    // status dropdown filter
    if (inventoryStatusFilter) {
      if (inventoryStatusFilter === 'active') {
        list = list.filter(r => !r.release_date);
      } else if (inventoryStatusFilter === 'stale') {
        list = list.filter(r => {
          if (r.release_date) return false;
          const info = getMonthsAndInterestCalc(r.pledge_date, r.release_date);
          return info.months >= stalePledgeThresholdMonths;
        });
      } else if (inventoryStatusFilter === 'released') {
        list = list.filter(r => r.release_date);
      }
    }

    // Min months elapsed filter
    if (inventoryMinMonths) {
      const minVal = parseFloat(inventoryMinMonths);
      if (!isNaN(minVal)) {
        list = list.filter(r => {
          const info = getMonthsAndInterestCalc(r.pledge_date, r.release_date);
          return info.months >= minVal;
        });
      }
    }

    // Max months elapsed filter
    if (inventoryMaxMonths) {
      const maxVal = parseFloat(inventoryMaxMonths);
      if (!isNaN(maxVal)) {
        list = list.filter(r => {
          const info = getMonthsAndInterestCalc(r.pledge_date, r.release_date);
          return info.months <= maxVal;
        });
      }
    }

    // Start Date filter (pledges made on or after start date)
    if (inventoryStartDate) {
      list = list.filter(r => {
        if (!r.pledge_date) return false;
        const pDate = r.pledge_date.split('T')[0];
        return pDate >= inventoryStartDate;
      });
    }

    // End Date filter (pledges made on or before end date)
    if (inventoryEndDate) {
      list = list.filter(r => {
        if (!r.pledge_date) return false;
        const pDate = r.pledge_date.split('T')[0];
        return pDate <= inventoryEndDate;
      });
    }

    // Sort column
    list.sort((a, b) => {
      let valA: any = a[inventorySortCol] ?? '';
      let valB: any = b[inventorySortCol] ?? '';
      
      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = String(valB).toLowerCase();
      }

      if (valA < valB) return -1 * inventorySortDir;
      if (valA > valB) return 1 * inventorySortDir;
      return 0;
    });

    setFilteredRecords(list);
    setRecordPage(1); // Reset page selection on criteria change
  }, [inventorySearch, inventoryStatusFilter, inventoryMinMonths, inventoryMaxMonths, inventoryStartDate, inventoryEndDate, inventorySortCol, inventorySortDir, allRecords, stalePledgeThresholdMonths]);

  // Handle Inventory Row click sorting
  const requestSort = (col: keyof PledgeRecord) => {
    if (inventorySortCol === col) {
      setInventorySortDir(prev => prev * -1);
    } else {
      setInventorySortCol(col);
      setInventorySortDir(1);
    }
  };

  // Delete records
  const handleDeleteTrigger = (num: number) => {
    setDeletePendingNum(num);
  };

  const handleConfirmDelete = async () => {
    if (!deletePendingNum || !googleToken) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/records/${deletePendingNum}`, {
        method: 'DELETE',
        headers: {
          'x-session-token': sessionToken || '',
          'Authorization': `Bearer ${googleToken}`
        }
      });
      if (res.ok) {
        triggerToast(`Pledge record #${deletePendingNum} completely removed.`, 'success');
        setDeletePendingNum(null);
        loadAllInventoryRecords();
      } else {
        const err = await res.json();
        triggerToast(err.detail || 'Delete failed.', 'error');
      }
    } catch (err) {
      triggerToast('Failed communication for delete routing.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // ⏳ Approve submission reviews
  const handleApproveSubmission = async (pid: number) => {
    if (!googleToken) return;
    setActionProcessingMsg('Approving loan entry...');
    try {
      const res = await fetch(`/api/pending/${pid}/approve`, {
        method: 'POST',
        headers: {
          'x-session-token': sessionToken || '',
          'Authorization': `Bearer ${googleToken}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        // Immediately remove from pending queue visually
        setAllPendingQueue(prev => prev.filter(sub => sub.id !== pid));
        triggerToast(`Submission accepted! Record #${data.record_number} logged successfully.`, 'success');
        loadAdminDashboardData();
      } else {
        triggerToast(data.detail || 'Approval failed.', 'error');
      }
    } catch (err) {
      triggerToast('Error during approval.', 'error');
    } finally {
      setActionProcessingMsg(null);
    }
  };

  // ⏳ Reject submission reviews (Triggers custom modal)
  const handleRejectSubmission = (pid: number) => {
    setRejectPendingId(pid);
  };

  // Execution flow for rejecting a submission
  const executeRejectSubmission = async () => {
    if (rejectPendingId === null) return;
    const pid = rejectPendingId;
    setRejectPendingId(null);
    setActionProcessingMsg('Rejecting loan entry...');
    try {
      const res = await fetch(`/api/pending/${pid}/reject`, {
        method: 'POST',
        headers: {
          'x-session-token': sessionToken || '',
          'Authorization': `Bearer ${googleToken}`
        }
      });
      if (res.ok) {
        // Immediately remove from pending queue visually
        setAllPendingQueue(prev => prev.filter(sub => sub.id !== pid));
        triggerToast(`Submission #${pid} rejected.`, 'warning');
        loadAdminDashboardData();
      } else {
        const d = await res.json();
        triggerToast(d.detail || 'Rejection failed.', 'error');
      }
    } catch (err) {
      triggerToast('Error rejecting submission.', 'error');
    } finally {
      setActionProcessingMsg(null);
    }
  };

  // 📋 dynamic client-side CSV exports (Matches exact layout specification logic!)
  const downloadCSV = (filename: string, headers: string[], rows: any[][]) => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(row => row.map(value => {
          let str = value === null || value === undefined ? "" : String(value);
          // escape quotes
          str = str.replace(/"/g, '""');
          if (str.includes(",") || str.includes("\n") || str.includes('"')) {
            str = `"${str}"`;
          }
          return str;
        }).join(","))].join("\n");
    
    const encoded = encodeURI(csvContent);
    const downloadLink = document.createElement("a");
    downloadLink.setAttribute("href", encoded);
    downloadLink.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  const exportSubmissionsCSV = async () => {
    if (!googleToken) {
      triggerToast('Connect Google Sheets to fetch submissions for export!', 'warning');
      return;
    }
    setIsExportingSubmissions(true);
    try {
      const res = await fetch('/api/pending', {
        headers: {
          'x-session-token': sessionToken || '',
          'Authorization': `Bearer ${googleToken}`
        }
      });
      if (!res.ok) {
        throw new Error('Failed to retrieve fresh submissions from Google Sheets');
      }
      const data: Submission[] = await res.json();
      if (!data.length) {
        triggerToast('No submissions found in Google Sheets to export.', 'warning');
        return;
      }
      const headers = [
        "SUBMISSION ID", "SUBMITTED BY", "SUBMITTED AT", "STATUS", 
        "CUSTOMER NAME", "PHONE", "GOLD ITEM NAME", "NO OF ITEMS", "NET WEIGHT", "AMOUNT", "PLEDGE DATE", "LOCKER"
      ];
      const rows = data.map(sub => [
        sub.id,
        sub.submitted_by,
        sub.submitted_at,
        sub.status,
        sub.record.name,
        sub.record.phone,
        sub.record.item_name,
        sub.record.no_of_items,
        sub.record.net_weight,
        sub.record.amount,
        sub.record.pledge_date,
        sub.record.locker || ''
      ]);
      downloadCSV("dinesh_submissions", headers, rows);
      triggerToast('Submissions CSV downloaded successfully.', 'success');
    } catch (err: any) {
      triggerToast(err.message || 'Error compiling submissions CSV.', 'error');
    } finally {
      setIsExportingSubmissions(false);
    }
  };

  const exportRecordsByDateCSV = async () => {
    if (!googleToken) {
      triggerToast('Connect Google Sheets to fetch records for export!', 'warning');
      return;
    }
    setIsExportingByDate(true);
    try {
      const res = await fetch('/api/records', {
        headers: {
          'x-session-token': sessionToken || '',
          'Authorization': `Bearer ${googleToken}`
        }
      });
      if (!res.ok) {
        throw new Error('Failed to retrieve fresh records from Google Sheets');
      }
      const data: PledgeRecord[] = await res.json();
      if (!data.length) {
        triggerToast('No active records found to export.', 'warning');
        return;
      }
      const headers = [
        "PLEDGE DATE", "RECORD NUMBER", "CUSTOMER NAME", "AMOUNT", "ITEM NAME", "NO OF ITEMS", "NET WEIGHT", "PHONE NUMBER", "RELEASE DATE", "LOCKER"
      ];
      const sorted = [...data].sort((a, b) => a.pledge_date.localeCompare(b.pledge_date));
      const rows = sorted.map(r => [
        r.pledge_date,
        r.number,
        r.name,
        r.amount,
        r.item_name,
        r.no_of_items,
        r.net_weight,
        r.phone,
        r.release_date || 'Pending',
        r.locker || ''
      ]);
      downloadCSV("records_by_date", headers, rows);
      triggerToast('Records by Date CSV downloaded.', 'success');
    } catch (err: any) {
      triggerToast(err.message || 'Error compiling records by date CSV.', 'error');
    } finally {
      setIsExportingByDate(false);
    }
  };

  const exportAllRecordsCSV = async () => {
    if (!googleToken) {
      triggerToast('Connect Google Sheets to fetch records for export!', 'warning');
      return;
    }
    setIsExportingAll(true);
    try {
      const res = await fetch('/api/records', {
        headers: {
          'x-session-token': sessionToken || '',
          'Authorization': `Bearer ${googleToken}`
        }
      });
      if (!res.ok) {
        throw new Error('Failed to retrieve fresh records from Google Sheets');
      }
      const data: PledgeRecord[] = await res.json();
      if (!data.length) {
        triggerToast('No active records found to export.', 'warning');
        return;
      }
      const headers = [
        "RECORD NUMBER", "CUSTOMER NAME", "AMOUNT", "ITEM NAME", "NO OF ITEMS", "NET WEIGHT", "PHONE NUMBER", "PLEDGE DATE", "RELEASE DATE", "LOCKER"
      ];
      const rows = data.map(r => [
        r.number,
        r.name,
        r.amount,
        r.item_name,
        r.no_of_items,
        r.net_weight,
        r.phone,
        r.pledge_date,
        r.release_date || 'Pending',
        r.locker || ''
      ]);
      const current_date = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
      downloadCSV(`current_date_${current_date}`, headers, rows);
      triggerToast('All Inventory records CSV downloaded.', 'success');
    } catch (err: any) {
      triggerToast(err.message || 'Error compiling all records CSV.', 'error');
    } finally {
      setIsExportingAll(false);
    }
  };

  const exportCurrentMonthDataCSV = async () => {
    if (!googleToken) {
      triggerToast('Connect Google Sheets to export data!', 'warning');
      return;
    }
    triggerToast('Generating current month data...', 'success');
    try {
      const res = await fetch('/api/records', {
        headers: {
          'x-session-token': sessionToken || '',
          'Authorization': `Bearer ${googleToken}`
        }
      });
      if (!res.ok) {
        throw new Error('Failed to retrieve fresh records from Google Sheets');
      }
      const data: PledgeRecord[] = await res.json();
      if (!data.length) {
        triggerToast('No active records found to export.', 'warning');
        return;
      }

      // Filter for current month based on pledge_date
      const currentMonthIndex = new Date().getMonth();
      const currentYear = new Date().getFullYear();

      const currentMonthData = data.filter(r => {
        if (!r.pledge_date) return false;
        try {
          const cleanDate = r.pledge_date.trim();
          const dParts = cleanDate.split(/[-/]/);
          let recordDate: Date;
          if (dParts.length === 3) {
            if (dParts[0].length === 2 && dParts[2].length === 4) {
              const day = parseInt(dParts[0], 10);
              const month = parseInt(dParts[1], 10) - 1;
              const year = parseInt(dParts[2], 10);
              recordDate = new Date(year, month, day);
            } else if (dParts[0].length === 4) {
              const year = parseInt(dParts[0], 10);
              const month = parseInt(dParts[1], 10) - 1;
              const day = parseInt(dParts[2], 10);
              recordDate = new Date(year, month, day);
            } else {
              recordDate = new Date(cleanDate);
            }
          } else {
            recordDate = new Date(cleanDate);
          }
          return recordDate.getMonth() === currentMonthIndex && recordDate.getFullYear() === currentYear;
        } catch {
          return false;
        }
      });

      if (!currentMonthData.length) {
        triggerToast('No records found for the current month.', 'warning');
        return;
      }

      const headers = [
        "RECORD NUMBER", "CUSTOMER NAME", "AMOUNT", "ITEM NAME", "NO OF ITEMS", "NET WEIGHT", "PHONE NUMBER", "PLEDGE DATE", "RELEASE DATE", "LOCKER"
      ];
      const rows = currentMonthData.map(r => [
        r.number,
        r.name,
        r.amount,
        r.item_name,
        r.no_of_items,
        r.net_weight,
        r.phone,
        r.pledge_date,
        r.release_date || 'Pending',
        r.locker || ''
      ]);
      downloadCSV("current_data", headers, rows);
      triggerToast('Current data downloaded as CSV/Excel.', 'success');
    } catch (err: any) {
      triggerToast(err.message || 'Error compiling current data.', 'error');
    }
  };



  const saveBackupsToDrive = async (skipConfirm: boolean = false) => {
    if (!googleToken) {
      triggerToast('Connect Google Sheets and Drive to backup!', 'warning');
      return;
    }
    
    // User confirmation
    if (!skipConfirm) {
      const confirmed = window.confirm('Generate and upload comprehensive CSV backups to your Google Drive?');
      if (!confirmed) return;
    }

    setIsSavingToDrive(true);
    try {
      // 1. Fetch pending & approved submissions
      const pendingRes = await fetch('/api/pending', {
        headers: {
          'x-session-token': sessionToken || '',
          'Authorization': `Bearer ${googleToken}`
        }
      });
      const pendingData: Submission[] = await pendingRes.json();
      
      const subHeaders = [
        "SUBMISSION ID", "SUBMITTED BY", "SUBMITTED AT", "STATUS", 
        "CUSTOMER NAME", "PHONE", "GOLD ITEM NAME", "NO OF ITEMS", "NET WEIGHT", "AMOUNT", "PLEDGE DATE", "LOCKER"
      ];
      const subRows = pendingData.map(s => [
        s.id, s.submitted_by, s.submitted_at, s.status,
        s.record.name, s.record.phone, s.record.item_name, s.record.no_of_items, s.record.net_weight, s.record.amount, s.record.pledge_date, s.record.locker
      ]);
      const submissionsCsv = subHeaders.join(",") + "\\n" + subRows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\\n");

      // 2. Fetch all inventory records
      const recordsRes = await fetch('/api/records', {
        headers: {
          'x-session-token': sessionToken || '',
          'Authorization': `Bearer ${googleToken}`
        }
      });
      const recordsData: PledgeRecord[] = await recordsRes.json();
      
      const recHeaders = [
        "RECORD NUMBER", "CUSTOMER NAME", "AMOUNT", "ITEM NAME", "NO OF ITEMS", "NET WEIGHT", "PHONE NUMBER", "PLEDGE DATE", "RELEASE DATE", "LOCKER"
      ];
      const recRows = recordsData.map(r => [
        r.number, r.name, r.amount, r.item_name, r.no_of_items, r.net_weight, r.phone, r.pledge_date, r.release_date, r.locker
      ]);
      const recordsCsv = recHeaders.join(",") + "\\n" + recRows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\\n");

      // 3. Upload to Google Drive
      const uploadToDrive = async (filename: string, content: string) => {
        // Step 1: Create file metadata
        const metadataRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${googleToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: filename, mimeType: 'text/csv' })
        });
        
        if (!metadataRes.ok) throw new Error(`Drive upload failed (metadata): ${await metadataRes.text()}`);
        const fileMetadata = await metadataRes.json();
        
        // Step 2: Upload file content
        const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileMetadata.id}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${googleToken}`,
            'Content-Type': 'text/csv'
          },
          body: content
        });
        
        if (!uploadRes.ok) throw new Error(`Drive upload failed (content): ${await uploadRes.text()}`);
      };

      const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
      await uploadToDrive(`current_date_${dateStr}_submissions.csv`, submissionsCsv);
      await uploadToDrive(`current_date_${dateStr}_all_data.csv`, recordsCsv);

      triggerToast('Backups saved to Google Drive successfully!', 'success');
    } catch (err: any) {
      triggerToast(err.message || 'Error saving backups to Drive.', 'error');
    } finally {
      setIsSavingToDrive(false);
    }
  };

  // ── RENDER ROOT LAYOUTS ────────────────────────────────────

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center flex-col text-white">
        <RefreshCw className="w-12 h-12 text-amber-500 animate-spin mb-4" />
        <p className="font-syne text-lg font-bold tracking-wider">Dinesh Gold Loan Security</p>
        <p className="text-xs text-slate-400 mt-1">Initializing workspace authority verification token...</p>
      </div>
    );
  }

  // LOGIN WALL (username/password)
  if (!currentUser) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-6 ${isDarkMode ? 'dark bg-[#070b14] text-white' : 'bg-[#f4f6fb] text-slate-800'} relative overflow-hidden font-sans`}>
        {/* Ambient Floating Glass Orbs */}
        <div className="liquid-orb-1" />
        <div className="liquid-orb-2" />
        <div className="liquid-orb-3" />

        <div className="w-full max-w-md glass-card p-8 shadow-[0_25px_60px_rgba(0,0,0,0.35)] relative z-10 animate-fade-in-up border border-white/20">
          <div className="text-center mb-6">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-tr from-[#007aff] to-[#5ac8fa] flex items-center justify-center text-white font-syne text-2xl font-bold shadow-[0_8px_25px_rgba(0,122,255,0.4)] ring-2 ring-white/30">
              D
            </div>
            <h1 className="title-display text-3xl font-extrabold tracking-tight font-syne">
              Dinesh <span className="text-[#007aff] dark:text-[#5ac8fa]">Gold Loan</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 tracking-wide uppercase font-mono">Pledge Records Security System</p>
          </div>

          {!googleToken ? (
            <div className="space-y-6 text-center">
              <div className="p-4 bg-[#007aff]/10 border border-[#007aff]/20 rounded-2xl text-slate-700 dark:text-slate-200 backdrop-blur-md">
                <FileSpreadsheet className="w-10 h-10 text-[#007aff] dark:text-[#5ac8fa] mx-auto mb-3" />
                <h3 className="font-syne font-bold text-sm tracking-wide uppercase">Google Sheet Sync Required</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                  Before logging in, please link your Google Account. User directories and registry credentials are read and validated directly from secure Google Sheets.
                </p>
              </div>

              <button
                type="button"
                onClick={handleGoogleConnection}
                disabled={isConnectingGoogle}
                className="w-full py-3.5 btn-liquid-primary cursor-pointer flex items-center justify-center space-x-3 text-white text-xs uppercase tracking-wider font-bold"
              >
                <svg className="w-5 h-5" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                </svg>
                <span>
                  {isConnectingGoogle ? 'Connecting Account...' : 'Continue with Google'}
                </span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleSystemLogin} className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl mb-4">
                <div className="flex items-center space-x-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                  <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-300 uppercase tracking-widest font-bold">Sheets Connected</span>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-[10px] text-slate-400 hover:text-rose-400 underline uppercase tracking-wider font-bold bg-transparent border-0 cursor-pointer"
                >
                  Disconnect
                </button>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 font-mono">Username Account Code</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                    <User className="w-4 h-4" />
                  </span>
                  <input 
                    type="text" 
                    value={loginUname}
                    onChange={(e) => setLoginUname(e.target.value)}
                    placeholder="Enter username (e.g. admin)..." 
                    className="glass-input w-full pl-10 pr-4 py-3 text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 font-mono">Secure Password</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input 
                    type="password" 
                    value={loginPw}
                    onChange={(e) => setLoginPw(e.target.value)}
                    placeholder="Enter account password..." 
                    className="glass-input w-full pl-10 pr-4 py-3 text-sm"
                    required
                  />
                </div>
              </div>

              {loginError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-600 dark:text-red-300 text-center font-medium">
                  ⚠️ {loginError}
                </div>
              )}

              <button 
                type="submit" 
                disabled={isLoggingIn}
                className="w-full py-3.5 btn-liquid-primary font-syne font-black text-center text-xs uppercase tracking-wider cursor-pointer"
              >
                {isLoggingIn ? 'Verifying Authorized Session...' : 'Sign In Securely →'}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <p className="text-[10px] text-slate-500 font-mono">Official Gold Shop Registry Database</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark bg-[#070b14] text-slate-100' : 'bg-[#f4f6fb] text-slate-800'} pb-16 relative overflow-hidden font-sans transition-colors duration-300`}>
      {/* Ambient Floating Gradient Glass Orbs */}
      <div className="liquid-orb-1" />
      <div className="liquid-orb-2" />
      <div className="liquid-orb-3" />
      
      {/* 🧭 FLOATING LIQUID GLASS NAVIGATION BAR */}
      <nav className="glass-header sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo brand */}
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('search')}>
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#007aff] to-[#5ac8fa] flex items-center justify-center font-bold text-white font-syne text-xl shadow-[0_6px_20px_rgba(0,122,255,0.35)] ring-1 ring-white/40">
                D
              </div>
              <div>
                <span className="title-display text-xl font-black block text-slate-900 dark:text-white">
                  Dinesh <span className="text-[#007aff] dark:text-[#5ac8fa]">Gold</span>
                </span>
                <span className="text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase font-mono block">
                  Loan Management
                </span>
              </div>
            </div>

            {/* Links and Menu routes */}
            <div className="hidden md:flex items-center space-x-1.5 p-1.5 rounded-2xl bg-white/40 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/60 backdrop-blur-md">
              <button 
                onClick={() => setActiveTab('search')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
                  activeTab === 'search' 
                    ? 'bg-[#007aff]/15 dark:bg-[#007aff]/30 text-[#007aff] dark:text-[#5ac8fa] font-semibold border border-[#007aff]/30 dark:border-[#007aff]/50 shadow-xs' 
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800/50'
                }`}
              >
                Search
              </button>
              <button 
                onClick={() => setActiveTab('add')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
                  activeTab === 'add' 
                    ? 'bg-[#007aff]/15 dark:bg-[#007aff]/30 text-[#007aff] dark:text-[#5ac8fa] font-semibold border border-[#007aff]/30 dark:border-[#007aff]/50 shadow-xs' 
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800/50'
                }`}
              >
                Add
              </button>
              
              {currentUser.role === 'admin' && (
                <>
                  <button 
                    onClick={() => {
                      setActiveTab('edit');
                      setLoadedEditRecord(null);
                      setEditLookupId('');
                    }}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
                      activeTab === 'edit' 
                        ? 'bg-[#007aff]/15 dark:bg-[#007aff]/30 text-[#007aff] dark:text-[#5ac8fa] font-semibold border border-[#007aff]/30 dark:border-[#007aff]/50 shadow-xs' 
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => setActiveTab('view_all')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
                      activeTab === 'view_all' 
                        ? 'bg-[#007aff]/15 dark:bg-[#007aff]/30 text-[#007aff] dark:text-[#5ac8fa] font-semibold border border-[#007aff]/30 dark:border-[#007aff]/50 shadow-xs' 
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    View All
                  </button>
                  <button 
                    onClick={() => setActiveTab('admin')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
                      activeTab === 'admin' 
                        ? 'bg-[#007aff]/15 dark:bg-[#007aff]/30 text-[#007aff] dark:text-[#5ac8fa] font-semibold border border-[#007aff]/30 dark:border-[#007aff]/50 shadow-xs' 
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    Dashboard
                  </button>
                </>
              )}
            </div>

            {/* Profile, Theme Toggle & Sync indicators */}
            <div className="flex items-center space-x-3">
              {/* Theme Switcher Button */}
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2.5 rounded-2xl bg-white/60 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-amber-500 dark:text-amber-400 transition cursor-pointer flex items-center justify-center shadow-xs"
                title={isDarkMode ? "Switch to Light Glass Mode" : "Switch to Dark Glass Mode"}
              >
                {isDarkMode ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-sky-600" />}
              </button>

              {/* Google Sheets Access token sync indicators */}
              <div 
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border text-xs ${googleToken ? 'bg-emerald-500/10 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-500/30'}`}
                title={googleToken ? 'Active Cloud Google Sheets Sync' : 'Google Sheets Auth Disconnected'}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${googleToken ? 'bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-rose-500 animate-pulse'}`} />
                <span className="hidden lg:inline text-[11px] font-medium uppercase font-mono tracking-wider">
                  {googleToken ? 'Sheets Linked' : 'Sheets Offline'}
                </span>
                {!googleToken && (
                  <button 
                    onClick={handleGoogleConnection}
                    disabled={isConnectingGoogle}
                    className="ml-1 px-2.5 py-0.5 bg-rose-500 text-white rounded-full font-sans font-bold text-[10px] uppercase cursor-pointer hover:bg-rose-600 transition"
                  >
                    {isConnectingGoogle ? 'Syncing...' : 'Link'}
                  </button>
                )}
              </div>

              {/* Local session identification and logout */}
              <div className="flex items-center space-x-2">
                <span className="hidden sm:inline-block px-2.5 py-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-xl font-mono text-[11px] border border-amber-500/30 uppercase font-bold">
                  {currentUser.username} ({currentUser.role})
                </span>
                <button 
                  onClick={handleLogout}
                  className="p-2.5 text-slate-500 hover:text-rose-500 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-slate-200/50 dark:hover:bg-slate-800 rounded-2xl transition cursor-pointer border border-transparent hover:border-slate-300 dark:hover:border-slate-700"
                  title="Sign out of Dinesh Gold Portal"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile secondary list routes */}
        <div className="md:hidden border-t border-slate-200/50 dark:border-slate-800/60 px-4 py-2.5 flex items-center justify-between overflow-x-auto gap-2 backdrop-blur-lg">
          <button 
            onClick={() => setActiveTab('search')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'search' 
                ? 'bg-[#007aff] text-white shadow-[0_4px_12px_rgba(0,122,255,0.35)]' 
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
            }`}
          >
            Search
          </button>
          <button 
            onClick={() => setActiveTab('add')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'add' 
                ? 'bg-[#007aff] text-white shadow-[0_4px_12px_rgba(0,122,255,0.35)]' 
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
            }`}
          >
            Add Record
          </button>
          {currentUser.role === 'admin' && (
            <>
              <button 
                onClick={() => {
                  setActiveTab('edit');
                  setLoadedEditRecord(null);
                  setEditLookupId('');
                }}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'edit' 
                    ? 'bg-[#007aff] text-white shadow-[0_4px_12px_rgba(0,122,255,0.35)]' 
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                }`}
              >
                Edit Form
              </button>
              <button 
                onClick={() => setActiveTab('view_all')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'view_all' 
                    ? 'bg-[#007aff] text-white shadow-[0_4px_12px_rgba(0,122,255,0.35)]' 
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                }`}
              >
                All Records
              </button>
              <button 
                onClick={() => setActiveTab('admin')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'admin' 
                    ? 'bg-[#007aff] text-white shadow-[0_4px_12px_rgba(0,122,255,0.35)]' 
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                }`}
              >
                Dashboard
              </button>
            </>
          )}
        </div>
      </nav>

      {/* ⚠️ BLOCKED ACCESS GOOGLE WARNING EMBED */}
      {!googleToken && (
        <div className="max-w-7xl mx-auto mt-6 px-4 sm:px-6 lg:px-8">
          <div className="glass-card p-5 border border-amber-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4 text-slate-800 dark:text-slate-100 shadow-lg backdrop-blur-xl">
            <div className="flex items-start md:items-center space-x-3">
              <div className="p-2.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-2xl border border-amber-500/30">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-syne font-bold text-sm tracking-wide uppercase text-amber-700 dark:text-amber-300">Google Sheets Authorization Key Required</h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-0.5">Please link your Google Account. This is necessary to modify, update, and search records directly inside your specified Google Sheet.</p>
              </div>
            </div>
            <button 
              onClick={handleGoogleConnection}
              className="btn-liquid-primary px-5 py-2.5 text-xs font-syne font-bold uppercase cursor-pointer transition self-start md:self-auto shadow-md"
            >
              Sign In & Connect Sheets
            </button>
          </div>
        </div>
      )}


      {/* ── CORE VIEWS ROUTING CONTAINER ── */}
      <main className="max-w-7xl mx-auto mt-8 px-4 sm:px-6 lg:px-8">

        {/* 1. VIEW SEARCH (HOME & LOOKUP) */}
        {activeTab === 'search' && (
          <div className="space-y-8 animate-fade-in">

            {/* Search Input block */}
            <div className="max-w-2xl mx-auto">
              <form onSubmit={handleSearch} className="flex gap-3">
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-400">
                    <Search className="w-5 h-5 text-[#007aff]" />
                  </span>
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, phone, serial ID#, locker num, parent item..." 
                    className="glass-input w-full pl-12 pr-4 py-4 text-sm font-medium shadow-sm"
                    required
                  />
                  {isSearching && (
                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
                      <RefreshCw className="w-5 h-5 text-[#007aff] animate-spin" />
                    </div>
                  )}
                </div>
                <button 
                  type="submit" 
                  disabled={isSearching || !googleToken}
                  className="btn-liquid-primary px-6 text-sm font-syne font-bold cursor-pointer disabled:opacity-50"
                >
                  Search Records
                </button>
              </form>
            </div>

            {/* Search Results Display Grid */}
            <div className="mt-10">
              {searchResults.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 px-2 uppercase tracking-wide">
                    <span>Found {searchResults.length} matching entries:</span>
                    <span className="font-mono text-[#007aff] dark:text-[#5ac8fa]">Sync source: Google Sheet</span>
                  </div>
                  
                  <div className="glass-panel overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-100/60 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider backdrop-blur-md">
                          <tr>
                            <th className="py-4 px-4 font-mono">No. ID</th>
                            <th className="py-4 px-4">Customer Name</th>
                            <th className="py-4 px-4">Phone</th>
                            <th className="py-4 px-4">Item Name</th>
                            <th className="py-4 px-4 font-mono">No Items</th>
                            <th className="py-4 px-4 font-mono">Net Weight</th>
                            <th className="py-4 px-4 font-mono">Amount (₹)</th>
                            <th className="py-4 px-4">Locker</th>
                            <th className="py-4 px-4">Pledge Date</th>
                            <th className="py-4 px-4 text-center">Release Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-200">
                          {searchResults.map((rec, idx) => (
                            <tr key={`${rec.number}-${idx}`} className="hover:bg-white/40 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="py-4 px-4 font-bold font-mono text-[#007aff] dark:text-[#5ac8fa]">#{rec.number}</td>
                              <td className="py-4 px-4 font-bold text-slate-900 dark:text-white">{rec.name}</td>
                              <td className="py-4 px-4 text-slate-500 dark:text-slate-400 font-semibold">{rec.phone}</td>
                              <td className="py-4 px-4"><span className="glass-badge px-2.5 py-1 text-[#007aff] dark:text-[#5ac8fa] font-bold">{rec.item_name}</span></td>
                              <td className="py-4 px-4 font-mono">{rec.no_of_items} p</td>
                              <td className="py-4 px-4 font-mono font-bold text-slate-900 dark:text-white">{rec.net_weight} g</td>
                              <td className="py-4 px-4 font-mono font-bold text-slate-900 dark:text-white">₹{Number(rec.amount).toLocaleString('en-IN')}</td>
                              <td className="py-4 px-4">
                                {rec.locker ? (
                                  <span className="px-2.5 py-1 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 rounded-lg text-[10px] tracking-wide uppercase font-bold">{rec.locker}</span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-4 px-4 font-mono text-slate-500 dark:text-slate-400">{rec.pledge_date}</td>
                              <td className="py-4 px-4 text-center">
                                {rec.release_date ? (
                                  <span className="inline-block px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 text-[10px] tracking-wide uppercase font-bold">{rec.release_date}</span>
                                ) : (
                                  <span className="inline-block px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-[10px] tracking-wide uppercase font-bold">Pending</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="glass-card p-16 text-center text-slate-400 shadow-sm">
                  <Database className="w-12 h-12 text-[#007aff] dark:text-[#5ac8fa] mx-auto mb-4 opacity-80" />
                  <p className="font-syne font-bold text-slate-700 dark:text-slate-200 text-base">Spreadsheet Database Clear</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Submit names in search bar above to query active records directly from your linked sheet.</p>
                </div>
              )}
            </div>
          </div>
        )}


        {/* 2. VIEW ADD RECORD (PENDING SUBMISSION SUBMIT) */}
        {activeTab === 'add' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in">
            {/* Form Section */}
            <div className="lg:col-span-12">
              <div className="glass-card p-6 lg:p-8 shadow-md">
                <div className="pb-6 border-b border-slate-200/50 dark:border-slate-800/60">
                  <span className="glass-badge px-3 py-1 text-[#007aff] dark:text-[#5ac8fa] text-[10px] font-bold uppercase tracking-wider inline-block">
                    PLEDGE REGISTRATION PORTAL
                  </span>
                  <h3 className="title-display text-2xl font-black text-slate-900 dark:text-white mt-2">Add New Pledge Record</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Fill in the fields to place the entry in the pending review queue. Submitted changes authorize into Google Sheets upon admin approval.</p>
                </div>

                <form onSubmit={handleAddSubmission} className="space-y-6 mt-6">
                  {/* Row 1 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 font-mono">Customer Name</label>
                      <input 
                        type="text" 
                        value={fName}
                        onChange={(e) => setFName(e.target.value)}
                        placeholder="Type customer's complete name..." 
                        className="glass-input w-full px-4 py-3 text-sm font-medium"
                        maxLength={120}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 font-mono">Customer Phone</label>
                      <input 
                        type="tel" 
                        value={fPhone}
                        onChange={(e) => setFPhone(e.target.value)}
                        placeholder="Provide standard mobile contact..." 
                        className="glass-input w-full px-4 py-3 text-sm font-medium"
                        maxLength={15}
                        required
                      />
                    </div>
                  </div>

                  {/* Row 2 */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 font-mono">Pledge Date</label>
                      <input 
                        type="date" 
                        value={fPledgeDate}
                        onChange={(e) => setFPledgeDate(e.target.value)}
                        className="glass-input w-full px-4 py-3 text-sm font-medium font-mono"
                        required
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 font-mono">Gold Item Name</label>
                      <input 
                        type="text" 
                        value={fItemName}
                        onChange={(e) => setFItemName(e.target.value)}
                        placeholder="e.g., Gold Chain, King Golden Bangle..." 
                        className="glass-input w-full px-4 py-3 text-sm font-medium"
                        maxLength={120}
                        required
                      />
                    </div>
                  </div>

                  {/* Row 3 */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 font-mono">No. of Items</label>
                      <input 
                        type="number" 
                        value={fNoItems}
                        onChange={(e) => setFNoItems(e.target.value)}
                        placeholder="1"
                        min="1"
                        className="glass-input w-full px-4 py-3 text-sm font-medium font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 font-mono">Net Weight (grams)</label>
                      <input 
                        type="number" 
                        value={fWeight}
                        onChange={(e) => setFWeight(e.target.value)}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className="glass-input w-full px-4 py-3 text-sm font-medium font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 font-mono">Loan Amount (₹)</label>
                      <input 
                        type="number" 
                        value={fAmount}
                        onChange={(e) => setFAmount(e.target.value)}
                        placeholder="0.00"
                        step="1"
                        min="0"
                        className="glass-input w-full px-4 py-3 text-sm font-medium font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 font-mono">Locker Identifier <span className="opacity-50">(optional)</span></label>
                      <input 
                        type="text" 
                        value={fLocker}
                        onChange={(e) => setFLocker(e.target.value)}
                        placeholder="e.g. A-01" 
                        className="glass-input w-full px-4 py-3 text-sm font-medium font-mono"
                        maxLength={30}
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200/50 dark:border-slate-800/60 flex items-center justify-end space-x-3">
                    <button 
                      type="button"
                      onClick={() => {
                        setFName('');
                        setFPhone('');
                        setFItemName('');
                        setFNoItems('1');
                        setFWeight('');
                        setFAmount('');
                        setFLocker('');
                      }}
                      className="px-5 py-3 btn-liquid-secondary text-sm cursor-pointer font-semibold"
                    >
                      Clear Form
                    </button>
                    <button 
                      type="submit"
                      disabled={isSubmitting || !googleToken}
                      className="px-6 py-3 btn-liquid-primary font-syne font-bold text-sm cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting ? 'Submitting Queue Entry...' : '📤 Send Approval Request'}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* My Submissions History grid */}
            <div className="lg:col-span-12 mt-8">
              <div className="glass-card p-6 shadow-sm">
                <div className="flex items-center justify-between pb-4 border-b border-slate-200/50 dark:border-slate-800/60">
                  <h4 className="title-display text-lg font-bold text-slate-900 dark:text-white">My Queue Submissions</h4>
                  <button 
                    onClick={loadUserSubmissions}
                    className="p-2 hover:bg-white/60 dark:hover:bg-slate-800/60 rounded-xl text-slate-500 dark:text-slate-400 transition cursor-pointer"
                    title="Refresh Submissions Status"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                <div className="overflow-x-auto mt-4">
                  {mySubmissions.length > 0 ? (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200/50 dark:border-slate-800/60 text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">
                          <th className="py-3 px-2 font-mono">Row ID</th>
                          <th className="py-3 px-2">Customer Details</th>
                          <th className="py-3 px-2">Gold Item</th>
                          <th className="py-3 px-2 font-mono">Weight</th>
                          <th className="py-3 px-2 font-mono">Loan amount</th>
                          <th className="py-3 px-2">Pledge Date</th>
                          <th className="py-3 px-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/40 dark:divide-slate-800/50 font-medium text-slate-700 dark:text-slate-200">
                        {mySubmissions.map((sub, idx) => {
                          const statusColors = 
                            sub.status === 'approved' ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30' :
                            sub.status === 'rejected' ? 'bg-rose-500/15 text-rose-800 dark:text-rose-300 border-rose-500/30' :
                            'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30';
                          return (
                            <tr key={`${sub.id}-${idx}`} className="hover:bg-white/40 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="py-3 px-2 font-mono text-[#007aff] dark:text-[#5ac8fa] font-bold">#{sub.id}</td>
                              <td className="py-3 px-2">
                                <span className="block font-bold text-slate-900 dark:text-white">{sub.record.name}</span>
                                <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-semibold">{sub.record.phone}</span>
                              </td>
                              <td className="py-3 px-2"><span className="glass-badge px-2 py-0.5 text-[10px] font-bold">{sub.record.item_name}</span></td>
                              <td className="py-3 px-2 font-mono font-bold text-slate-900 dark:text-white">{sub.record.net_weight}g</td>
                              <td className="py-3 px-2 font-mono font-bold text-slate-900 dark:text-white">₹{sub.record.amount.toLocaleString('en-IN')}</td>
                              <td className="py-3 px-2 font-mono text-slate-500 dark:text-slate-400">{sub.record.pledge_date}</td>
                              <td className="py-3 px-2 text-center">
                                <span className={`inline-block px-2.5 py-1 text-[9px] uppercase tracking-wider font-extrabold rounded-full border ${statusColors}`}>
                                  {sub.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="py-8 text-center text-slate-400 text-xs">No pending or approved submissions found.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. VIEW EDIT RECORD (ADMIN ONLY) */}
        {activeTab === 'edit' && currentUser?.role === 'admin' && (
          <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
            {/* Step Selection Header */}
            <div className="glass-card p-6 shadow-md">
              <span className="glass-badge px-3 py-1 text-rose-600 dark:text-rose-400 font-mono text-[9px] font-black uppercase tracking-widest inline-block">
                SECURE SPREADSHEET REWRITE
              </span>
              <h3 className="title-display text-2xl font-black text-slate-900 dark:text-white mt-1">Surgical Record Modifier</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Locate any active pledge item by its Number to modify its attributes in Google Sheets.</p>

              {/* Direct Search query input */}
              <form onSubmit={handleEditLookup} className="flex gap-3 mt-6">
                <input 
                  type="number"
                  value={editLookupId}
                  onChange={(e) => setEditLookupId(e.target.value)}
                  placeholder="Type Record Number (e.g. 1001)..."
                  className="glass-input flex-1 px-4 py-3 text-sm font-bold font-mono"
                  required
                />
                <button 
                  type="submit"
                  disabled={isEditLoading || !googleToken}
                  className="btn-liquid-primary px-6 text-xs font-syne font-bold uppercase cursor-pointer disabled:opacity-50"
                >
                  {isEditLoading ? 'Searching...' : 'Locate Record'}
                </button>
              </form>

              {editError && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-center text-xs font-semibold text-red-600 dark:text-red-300">
                  ⚠️ {editError}
                </div>
              )}
            </div>

            {/* Loaded Data Form */}
            {loadedEditRecord && (
              <div className="glass-card p-6 lg:p-8 shadow-md space-y-6">
                <div className="pb-4 border-b border-slate-200/50 dark:border-slate-800/60 flex items-center justify-between">
                  <div>
                    <span className="text-slate-400 text-xs font-mono font-bold block">RECORD INDEX REFERENCE</span>
                    <h4 className="title-display text-lg font-black text-slate-900 dark:text-white">Modifying Row #{loadedEditRecord.number}</h4>
                  </div>
                  <span className="glass-badge px-3 py-1 text-[#007aff] dark:text-[#5ac8fa] font-mono font-bold text-sm">NUMBER: {loadedEditRecord.number}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 font-mono">Customer Name</label>
                    <input 
                      type="text"
                      value={eName}
                      onChange={(e) => setEName(e.target.value)}
                      className="glass-input w-full px-4 py-3 text-sm font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 font-mono">Phone Number</label>
                    <input 
                      type="text"
                      value={ePhone}
                      onChange={(e) => setEPhone(e.target.value)}
                      className="glass-input w-full px-4 py-3 text-sm font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 font-mono">Item Description</label>
                    <input 
                      type="text"
                      value={eItemName}
                      onChange={(e) => setEItemName(e.target.value)}
                      className="glass-input w-full px-4 py-3 text-sm font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 font-mono">No. of Items</label>
                    <input 
                      type="number"
                      value={eNoItems}
                      onChange={(e) => setENoItems(parseInt(e.target.value) || 1)}
                      className="glass-input w-full px-4 py-3 text-sm font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 font-mono">Net Gold Weight (g)</label>
                    <input 
                      type="number"
                      step="0.01"
                      value={eWeight}
                      onChange={(e) => setEWeight(parseFloat(e.target.value) || 0)}
                      className="glass-input w-full px-4 py-3 text-sm font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 font-mono">Loan Amount (₹)</label>
                    <input 
                      type="number"
                      value={eAmount}
                      onChange={(e) => setEAmount(parseFloat(e.target.value) || 0)}
                      className="glass-input w-full px-4 py-3 text-sm font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 font-mono">Locker Number</label>
                    <input 
                      type="text"
                      value={eLocker}
                      onChange={(e) => setELocker(e.target.value)}
                      className="glass-input w-full px-4 py-3 text-sm font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200/50 dark:border-slate-800/60">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 font-mono">Pledge Date</label>
                    <input 
                      type="date"
                      value={ePledgeDate}
                      onChange={(e) => setEPledgeDate(e.target.value)}
                      className="glass-input w-full px-4 py-3 text-sm font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 font-mono">Release Date <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-sans tracking-wide font-normal lowercase">(fill value to release loan)</span></label>
                    <input 
                      type="date"
                      value={eReleaseDate}
                      onChange={(e) => setEReleaseDate(e.target.value)}
                      className="glass-input w-full px-4 py-3 text-sm font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-200/50 dark:border-slate-800/60 flex items-center justify-end space-x-3">
                  <button 
                    type="button"
                    onClick={() => setLoadedEditRecord(null)}
                    className="px-5 py-3 btn-liquid-secondary text-sm font-semibold cursor-pointer"
                  >
                    Cancel Action
                  </button>
                  <button 
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={isSavingEdit}
                    className="px-6 py-3 bg-gradient-to-tr from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 disabled:opacity-50 text-white font-syne font-bold rounded-2xl text-sm transition tracking-wider uppercase cursor-pointer shadow-lg shadow-rose-500/20"
                  >
                    {isSavingEdit ? 'Saving Rewrite...' : '💾 Apply Sheet Rewrite'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}


        {/* 4. VIEW ALL RECORDS (GRID LIST & SORT & FILTER & DELETE) */}
        {activeTab === 'view_all' && currentUser?.role === 'admin' && (() => {
          const isFiltered = Boolean(inventorySearch || inventoryStatusFilter || inventoryMinMonths || inventoryMaxMonths || inventoryStartDate || inventoryEndDate);
          const activeFilteredCount = filteredRecords.filter(r => !r.release_date).length;
          const closedFilteredCount = filteredRecords.filter(r => r.release_date).length;
          const totalFilteredWeight = filteredRecords.reduce((acc, r) => acc + (Number(r.net_weight) || 0), 0);
          const totalFilteredAmount = filteredRecords.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
          
          const filteredStaleList = filteredRecords.filter(r => {
            if (r.release_date) return false;
            const info = getMonthsAndInterestCalc(r.pledge_date, r.release_date);
            return info.months >= stalePledgeThresholdMonths;
          });
          const currentStaleCount = filteredStaleList.length;
          const currentStaleAmount = filteredStaleList.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

          // Unique signature for filter and page state to drive smooth transition animations
          const gridTransitionKey = `${recordPage}_${inventoryStatusFilter}_${inventorySearch}_${inventoryMinMonths}_${inventoryMaxMonths}_${inventoryStartDate}_${inventoryEndDate}_${inventorySortCol}_${inventorySortDir}_${stalePledgeThresholdMonths}_${allRecords.length}`;

          return (
          <div className="space-y-6 animate-fade-in">
            {/* Display Stats Row (Dynamically updates with applied filters) */}
            <motion.div 
              key={`stats-row-${isFiltered}-${filteredRecords.length}`}
              initial={{ opacity: 0.8, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
            >
              <div className="glass-card p-4 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-slate-400 block font-bold">
                    {isFiltered ? 'Filtered Pledges' : 'Total Pledges'}
                  </span>
                  {isFiltered && (
                    <span className="text-[9px] font-mono font-extrabold px-1.5 py-0.5 rounded-full bg-[#007aff]/10 text-[#007aff] border border-[#007aff]/20">
                      Filtered
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-black font-syne text-slate-900 dark:text-white block">{filteredRecords.length}</span>
                  {isFiltered && (
                    <span className="text-[10px] font-mono text-slate-400 font-normal">/ {allRecords.length}</span>
                  )}
                </div>
              </div>

              <div className="glass-card p-4 shadow-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-slate-400 block font-bold">Active Inventory</span>
                <span className="text-2xl font-black font-syne text-amber-500 dark:text-amber-400 mt-1 block">{activeFilteredCount}</span>
              </div>

              <div 
                onClick={() => setInventoryStatusFilter(inventoryStatusFilter === 'stale' ? '' : 'stale')}
                className={`glass-card p-4 shadow-sm cursor-pointer transition-all ${
                  currentStaleCount > 0 
                    ? inventoryStatusFilter === 'stale'
                      ? 'bg-amber-500/30 border-amber-500 text-amber-900 dark:text-amber-200 ring-2 ring-amber-400'
                      : 'bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20' 
                    : ''
                }`}
                title="Click to toggle filtering for Stale Pledges"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-mono tracking-wider font-bold flex items-center gap-1 text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    Stale ({stalePledgeThresholdMonths}m+)
                  </span>
                  {currentStaleCount > 0 && (
                    <span className="px-1.5 py-0.5 font-mono font-extrabold text-[9px] rounded-full uppercase bg-amber-500 text-white dark:text-slate-950">
                      {inventoryStatusFilter === 'stale' ? 'Active' : 'Filter ⚡'}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-2xl font-black font-syne text-amber-600 dark:text-amber-300 block">
                    {currentStaleCount}
                  </span>
                  <span className="text-[11px] font-mono font-bold text-amber-700 dark:text-amber-400">
                    ₹{currentStaleAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <div className="glass-card p-4 shadow-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-slate-400 block font-bold">Closed Loans</span>
                <span className="text-2xl font-black font-syne text-emerald-600 dark:text-emerald-400 mt-1 block">{closedFilteredCount}</span>
              </div>

              <div className="glass-card p-4 shadow-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-slate-400 block font-bold">Total Gold Weight</span>
                <span className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-1 block">{totalFilteredWeight.toFixed(1)} <span className="text-xs text-slate-400 font-sans">g</span></span>
              </div>

              <div className="glass-card p-4 shadow-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-slate-400 block font-bold">Total Outlay</span>
                <span className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-1 block">₹{totalFilteredAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              </div>
            </motion.div>

            {/* Table Toolbar & filters */}
            <div className="glass-card p-4 shadow-sm space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                  {/* 🔍 Primary Search Input Bar */}
                  <div className="relative flex-1 min-w-[320px] max-w-xl">
                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#007aff]">
                      <Search className="w-5 h-5" />
                    </span>
                    <input 
                      type="text"
                      value={inventorySearch}
                      onChange={(e) => setInventorySearch(e.target.value)}
                      placeholder="Search Name, Phone, Record #, Item, Locker, Amount, Date..."
                      className="glass-input w-full pl-12 pr-10 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 transition shadow-xs"
                    />
                    {inventorySearch && (
                      <button 
                        type="button"
                        onClick={() => setInventorySearch('')}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        title="Clear search text"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  
                  {/* Status Dropdown Filter */}
                  <select 
                    value={inventoryStatusFilter}
                    onChange={(e) => setInventoryStatusFilter(e.target.value)}
                    className="glass-input px-3 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    <option value="" className="bg-white dark:bg-slate-900">All Statuses</option>
                    <option value="active" className="bg-white dark:bg-slate-900">Active (Pending Release)</option>
                    <option value="stale" className="bg-white dark:bg-slate-900">⚠️ Stale Pledges (&gt; {stalePledgeThresholdMonths}m)</option>
                    <option value="released" className="bg-white dark:bg-slate-900">Released</option>
                  </select>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {isInventoryRefreshing && (
                    <motion.span 
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold bg-[#007aff]/10 text-[#007aff] border border-[#007aff]/20"
                    >
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Refreshing...
                    </motion.span>
                  )}
                  <span className="glass-badge text-xs text-slate-600 dark:text-slate-300 font-bold px-2.5 py-1">
                    {filteredRecords.length} / {allRecords.length} items
                  </span>
                  <button 
                    onClick={loadAllInventoryRecords}
                    disabled={isInventoryRefreshing}
                    className={`p-2 hover:bg-white/60 dark:hover:bg-slate-800/60 rounded-xl text-slate-500 dark:text-slate-400 transition cursor-pointer ${
                      isInventoryRefreshing ? 'opacity-70 cursor-wait' : ''
                    }`}
                    title="Refresh inventory dataset from Google Sheets"
                  >
                    <RefreshCw className={`w-4 h-4 ${isInventoryRefreshing ? 'animate-spin text-[#007aff]' : ''}`} />
                  </button>
                </div>
              </div>

              {/* 📅 Date Range Filter Row */}
              <div className="pt-2 border-t border-slate-200/50 dark:border-slate-800/60 flex flex-wrap items-center gap-3 text-xs">
                <span className="text-[10px] uppercase font-mono font-extrabold text-slate-400 flex items-center gap-1 shrink-0">
                  <CalendarRange className="w-3.5 h-3.5 text-[#007aff]" /> Pledge Date Range:
                </span>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono text-slate-400">From:</span>
                    <input 
                      type="date"
                      value={inventoryStartDate}
                      onChange={(e) => setInventoryStartDate(e.target.value)}
                      className="glass-input px-2.5 py-1.5 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                      title="Filter pledges starting from this date"
                    />
                  </div>
                  <span className="text-xs text-slate-400 font-mono">to</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono text-slate-400">To:</span>
                    <input 
                      type="date"
                      value={inventoryEndDate}
                      onChange={(e) => setInventoryEndDate(e.target.value)}
                      className="glass-input px-2.5 py-1.5 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                      title="Filter pledges up to this date"
                    />
                  </div>
                </div>

                {/* Quick Date Presets */}
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
                      const lastDay = today.toISOString().split('T')[0];
                      setInventoryStartDate(firstDay);
                      setInventoryEndDate(lastDay);
                    }}
                    className="px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    This Month
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      const past30 = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                      setInventoryStartDate(past30);
                      setInventoryEndDate(today.toISOString().split('T')[0]);
                    }}
                    className="px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    Last 30 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      const jan1 = `${today.getFullYear()}-01-01`;
                      setInventoryStartDate(jan1);
                      setInventoryEndDate(today.toISOString().split('T')[0]);
                    }}
                    className="px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    This Year
                  </button>
                  {(inventoryStartDate || inventoryEndDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setInventoryStartDate('');
                        setInventoryEndDate('');
                      }}
                      className="px-2 py-1 rounded-xl text-[10px] font-mono font-bold text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                      title="Clear date range filters"
                    >
                      Clear Dates ✕
                    </button>
                  )}
                </div>
              </div>

              {/* 🏷️ Quick Search Keyword Presets */}
              <div className="pt-2 border-t border-slate-200/50 dark:border-slate-800/60 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[10px] uppercase font-mono font-extrabold text-slate-400 mr-1 flex items-center gap-1">
                  <Tag className="w-3 h-3 text-[#007aff]" /> Quick Search:
                </span>
                {['Ring', 'Chain', 'Bangle', 'Necklace', 'Coin', 'Locker'].map(chip => {
                  const isActive = inventorySearch.toLowerCase().includes(chip.toLowerCase());
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        if (isActive) {
                          setInventorySearch('');
                        } else {
                          setInventorySearch(chip);
                        }
                      }}
                      className={`px-3 py-1 rounded-xl text-[11px] font-bold transition cursor-pointer border ${
                        isActive
                          ? 'bg-[#007aff] text-white border-[#007aff] shadow-xs'
                          : 'bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60'
                      }`}
                    >
                      {chip}
                    </button>
                  );
                })}

                {(inventorySearch || inventoryStatusFilter || inventoryMinMonths || inventoryMaxMonths || inventoryStartDate || inventoryEndDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setInventorySearch('');
                      setInventoryStatusFilter('');
                      setInventoryMinMonths('');
                      setInventoryMaxMonths('');
                      setInventoryStartDate('');
                      setInventoryEndDate('');
                    }}
                    className="ml-auto text-[11px] font-extrabold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                  >
                    Reset All Filters
                  </button>
                )}
              </div>
            </div>

            {/* Grid data values results */}
            <div className="glass-card overflow-hidden shadow-md">
              {/* Shimmer loading bar when refreshing inventory dataset */}
              <AnimatePresence>
                {isInventoryRefreshing && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 3 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="w-full bg-slate-200/50 dark:bg-slate-800/50 overflow-hidden relative"
                  >
                    <motion.div 
                      className="h-full bg-gradient-to-r from-amber-500 via-[#007aff] to-emerald-500 w-1/3 rounded-full"
                      animate={{ x: ['-100%', '350%'] }}
                      transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Row Status Color Legend & Quick Filter Bar */}
              <div className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200/50 dark:border-slate-800/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider font-mono">Row Status Legend:</span>
                  <button 
                    type="button"
                    onClick={() => setInventoryStatusFilter(inventoryStatusFilter === 'active' ? '' : 'active')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition cursor-pointer ${
                      inventoryStatusFilter === 'active'
                        ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                        : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20 hover:bg-rose-500/20'
                    }`}
                    title="Click to filter Active (Pending Release) Pledges"
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                    <span>🔴 Active Loan</span>
                  </button>

                  <button 
                    type="button"
                    onClick={() => setInventoryStatusFilter(inventoryStatusFilter === 'stale' ? '' : 'stale')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition cursor-pointer ${
                      inventoryStatusFilter === 'stale'
                        ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs'
                        : 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20 hover:bg-amber-500/20'
                    }`}
                    title={`Click to filter Stale Pledges (Overdue > ${stalePledgeThresholdMonths} months)`}
                  >
                    <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                    <span>🟠 Stale ({stalePledgeThresholdMonths}m+)</span>
                  </button>

                  <button 
                    type="button"
                    onClick={() => setInventoryStatusFilter(inventoryStatusFilter === 'released' ? '' : 'released')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition cursor-pointer ${
                      inventoryStatusFilter === 'released'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                        : 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20'
                    }`}
                    title="Click to filter Released (Closed) Pledges"
                  >
                    <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span>🟢 Released / Closed</span>
                  </button>
                </div>

                {inventoryStatusFilter && (
                  <button 
                    type="button"
                    onClick={() => setInventoryStatusFilter('')}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 underline cursor-pointer"
                  >
                    Reset Filter (Show All {allRecords.length})
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse divide-y divide-slate-200/50 dark:divide-slate-800/60">
                  <thead className="bg-slate-100/50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider select-none">
                    <tr>
                      <th className="py-4 px-3 text-center w-8">Details</th>
                      <th onClick={() => requestSort('number')} className="py-4 px-4 font-mono sorted cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-800/50">No. ID ↕</th>
                      <th onClick={() => requestSort('name')} className="py-4 px-4 cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-800/50">Client Name ↕</th>
                      <th onClick={() => requestSort('phone')} className="py-4 px-4 cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-800/50">Phone ↕</th>
                      <th onClick={() => requestSort('item_name')} className="py-4 px-4 cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-800/50">Item Name ↕</th>
                      <th onClick={() => requestSort('no_of_items')} className="py-4 px-4 text-center cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-800/50">Qty ↕</th>
                      <th onClick={() => requestSort('net_weight')} className="py-4 px-4 text-right cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-800/50">Weight ↕</th>
                      <th onClick={() => requestSort('amount')} className="py-4 px-4 text-right cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-800/50">Outlay ↕</th>
                      <th onClick={() => requestSort('locker')} className="py-4 px-4 text-center cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-800/50">Locker ↕</th>
                      <th onClick={() => requestSort('pledge_date')} className="py-4 px-4 cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-800/50">Pledged ↕</th>
                      <th className="py-4 px-4 text-center">Months Elapsed</th>
                      <th onClick={() => requestSort('release_date')} className="py-4 px-4 text-center cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-800/50">Released / Status ↕</th>
                      <th className="py-4 px-4 text-center">Surgical Links</th>
                    </tr>
                  </thead>
                  <tbody 
                    key={`tbody-${gridTransitionKey}`}
                    className="divide-y divide-slate-200/50 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-300"
                  >
                    <AnimatePresence mode="popLayout" initial={false}>
                      {filteredRecords.slice((recordPage - 1) * RECORDS_PER_PAGE, recordPage * RECORDS_PER_PAGE).map((rec, idx) => {
                        const isExpanded = expandedRecordNum === rec.number;
                        const info = getMonthsAndInterestCalc(rec.pledge_date, rec.release_date, rec.amount);
                        const isReleased = Boolean(rec.release_date);
                        const isStale = !isReleased && info.months >= stalePledgeThresholdMonths;

                        const rowBgClass = isExpanded 
                          ? 'bg-amber-500/15 dark:bg-amber-500/20 border-l-4 border-l-amber-500 font-medium shadow-xs' 
                          : isReleased 
                            ? 'bg-emerald-500/5 dark:bg-emerald-500/10 border-l-4 border-l-emerald-500 hover:bg-emerald-500/15 text-slate-800 dark:text-slate-200' 
                            : isStale 
                              ? 'bg-amber-500/10 dark:bg-amber-500/15 border-l-4 border-l-amber-500 hover:bg-amber-500/20 text-slate-900 dark:text-slate-100' 
                              : 'bg-rose-500/5 dark:bg-rose-500/10 border-l-4 border-l-rose-500 hover:bg-rose-500/15 text-slate-900 dark:text-slate-100';

                        const numColorClass = isReleased
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : isStale
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-rose-600 dark:text-rose-400';

                        return (
                          <React.Fragment key={`row-group-${rec.number}-${idx}`}>
                            <motion.tr 
                              key={`row-${rec.number}-${gridTransitionKey}`}
                              layout="position"
                              initial={{ opacity: 0, y: 8, scale: 0.995 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -6, scale: 0.995 }}
                              transition={{ 
                                duration: 0.24, 
                                delay: Math.min(idx * 0.015, 0.18), 
                                ease: [0.16, 1, 0.3, 1] 
                              }}
                              onClick={() => setExpandedRecordNum(isExpanded ? null : rec.number)}
                              className={`cursor-pointer transition-colors ${rowBgClass}`}
                            >
                            <td className="py-4 px-3 text-center">
                              <button 
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedRecordNum(isExpanded ? null : rec.number);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 transition cursor-pointer"
                                title={isExpanded ? "Collapse row details" : "Expand full row details & history"}
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4 text-amber-500" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </td>
                            <td className={`py-4 px-4 font-mono font-bold flex items-center gap-1 ${numColorClass}`}>
                              {isStale && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 animate-pulse shrink-0" title={`Stale Pledge: Exceeds ${stalePledgeThresholdMonths}m threshold`} />}
                              <span>#{rec.number}</span>
                            </td>
                            <td className="py-4 px-4 text-slate-900 dark:text-white font-bold">{rec.name}</td>
                            <td className="py-4 px-4 text-slate-500 dark:text-slate-400 font-semibold">{rec.phone}</td>
                            <td className="py-4 px-4"><span className="glass-badge px-2.5 py-1 text-[11px] font-bold text-slate-800 dark:text-slate-200">{rec.item_name}</span></td>
                            <td className="py-4 px-4 text-center font-mono">{rec.no_of_items}</td>
                            <td className="py-4 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">{rec.net_weight} g</td>
                            <td className="py-4 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">₹{rec.amount.toLocaleString('en-IN')}</td>
                            <td className="py-4 px-4 text-center">
                              {rec.locker ? (
                                <span className="glass-badge px-2 py-0.5 text-indigo-600 dark:text-indigo-400 font-bold uppercase text-[9px]">{rec.locker}</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-4 px-4 font-mono text-slate-500 dark:text-slate-400 font-semibold">{rec.pledge_date}</td>
                            <td className="py-4 px-4 text-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  loadPledgeToCalculator(rec);
                                }}
                                className={`group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-mono text-[10px] font-black tracking-tight transition cursor-pointer ${
                                  isStale
                                    ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 border border-amber-500/30'
                                    : isReleased
                                      ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-900 dark:text-emerald-200 border border-emerald-500/30'
                                      : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-900 dark:text-rose-200 border border-rose-500/30'
                                }`}
                                title="Click to auto-load & calculate monthly interest for this pledge record!"
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isStale ? 'bg-amber-500 animate-ping' : isReleased ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
                                <span>{info.text}</span>
                                <span className="text-[9px] font-bold px-1 rounded bg-white/40 dark:bg-black/30">calc ⚙️</span>
                              </button>
                            </td>
                            <td className="py-4 px-4 text-center">
                              {isReleased ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[10px] font-bold shadow-xs">
                                  <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                                  <span>{rec.release_date}</span>
                                </span>
                              ) : isStale ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-[10px] font-black uppercase tracking-tight shadow-xs" title={`Overdue active loan: ${info.months.toFixed(1)} months elapsed without release (exceeds ${stalePledgeThresholdMonths}m threshold)`}>
                                  <AlertTriangle className="w-3 h-3 text-amber-500 animate-pulse shrink-0" />
                                  <span>⚠️ Stale ({info.months.toFixed(1)}m)</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-[10px] font-bold shadow-xs">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                  <span>Active Loan</span>
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-4 text-center space-x-1.5">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditLookupId(String(rec.number));
                                  setActiveTab('edit');
                                  handleEditLookup(undefined, String(rec.number));
                                }}
                                className="p-1.5 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded-lg text-slate-600 dark:text-slate-300 inline-flex items-center transition cursor-pointer"
                                title="Edit sheet row variables"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTrigger(rec.number);
                                }}
                                className="p-1.5 hover:bg-rose-500/20 rounded-lg text-rose-500 inline-flex items-center transition cursor-pointer"
                                title="Delete permanently"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </motion.tr>

                          {/* Expanded row view detailing complete record metadata & history logs with smooth slide transition */}
                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <tr className="bg-amber-50/20 border-b border-amber-200/60">
                                <td colSpan={13} className="p-0">
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                                    className="p-5 sm:p-6 overflow-hidden"
                                  >
                                    <div className="bg-white border border-amber-200/80 rounded-2xl p-6 shadow-md space-y-6 text-left">
                                  {/* Stale Pledge Warning Banner */}
                                  {isStale && (
                                    <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3.5 text-xs text-amber-950 shadow-2xs animate-fade-in">
                                      <div className="p-2 bg-amber-100 rounded-xl text-amber-700 shrink-0">
                                        <AlertTriangle className="w-5 h-5 text-amber-600 animate-bounce" />
                                      </div>
                                      <div className="flex-1">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <span className="font-syne font-extrabold text-xs uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                                            ⚠️ Overdue Stale Pledge Warning ({info.months.toFixed(1)} Months Active)
                                          </span>
                                          <span className="text-[10px] font-mono font-bold bg-amber-200/90 text-amber-950 px-2.5 py-0.5 rounded-full border border-amber-300">
                                            Threshold Limit: {stalePledgeThresholdMonths} Months
                                          </span>
                                        </div>
                                        <p className="mt-1.5 text-amber-900 text-xs leading-relaxed font-medium">
                                          This loan has remained active in the safe vault for <strong className="text-amber-950 font-bold">{info.months.toFixed(1)} months</strong> without a recorded release date, exceeding the system's configured <strong className="text-amber-950 font-bold">{stalePledgeThresholdMonths}-month</strong> tenure threshold. Total estimated interest accrued is <strong className="text-amber-950 font-bold font-mono">₹{info.estInterest.toLocaleString('en-IN')}</strong> on principal outlay <strong className="text-amber-950 font-bold font-mono">₹{rec.amount.toLocaleString('en-IN')}</strong>. Total settlement required: <strong className="text-amber-950 font-bold font-mono">₹{(rec.amount + info.estInterest).toLocaleString('en-IN')}</strong>.
                                        </p>
                                      </div>
                                    </div>
                                  )}

                                  {/* Expanded View Header */}
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                                    <div className="flex items-center gap-3">
                                      <div className="p-2.5 bg-amber-500/10 text-amber-600 rounded-xl">
                                        <FileText className="w-5 h-5" />
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <h4 className="font-syne font-extrabold text-base text-slate-900">
                                            Pledge Record Details & Audit Log
                                          </h4>
                                          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-mono text-[10px] font-extrabold rounded uppercase">
                                            #{rec.number}
                                          </span>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                          Full item breakdown, live valuation, financial schedules, and timeline audit
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          loadPledgeToCalculator(rec);
                                        }}
                                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-syne font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                                      >
                                        <span>⚙️ Open Calculator</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditLookupId(String(rec.number));
                                          setActiveTab('edit');
                                          handleEditLookup(undefined, String(rec.number));
                                        }}
                                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-syne font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                                      >
                                        <Edit className="w-3.5 h-3.5" />
                                        <span>Edit Record</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setExpandedRecordNum(null);
                                        }}
                                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                                        title="Collapse details view"
                                      >
                                        <X className="w-5 h-5" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Grid Metadata Cards */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {/* 1. Customer & Contact Info */}
                                    <div className="bg-slate-50/80 border border-slate-200/80 p-4 rounded-xl space-y-2">
                                      <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase tracking-wider font-mono">
                                        <span>Customer Profile</span>
                                        <User className="w-3.5 h-3.5 text-amber-500" />
                                      </div>
                                      <div>
                                        <span className="text-sm font-extrabold text-slate-900 block">{rec.name}</span>
                                        <div className="flex items-center justify-between mt-1">
                                          <span className="text-xs font-mono font-bold text-slate-600 flex items-center gap-1">
                                            <Phone className="w-3 h-3 text-slate-400" /> {rec.phone}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              navigator.clipboard.writeText(rec.phone);
                                              triggerToast('Phone number copied!', 'success');
                                            }}
                                            className="p-1 text-slate-400 hover:text-amber-600 rounded transition"
                                            title="Copy Phone Number"
                                          >
                                            <Copy className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                      <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                                        <span className="text-slate-400 font-medium">Locker Box:</span>
                                        <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                          {rec.locker || 'Unassigned Vault'}
                                        </span>
                                      </div>
                                    </div>

                                    {/* 2. Gold Item & Asset Valuation */}
                                    <div className="bg-slate-50/80 border border-slate-200/80 p-4 rounded-xl space-y-2">
                                      <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase tracking-wider font-mono">
                                        <span>Gold Inventory Asset</span>
                                        <Tag className="w-3.5 h-3.5 text-amber-500" />
                                      </div>
                                      <div>
                                        <span className="text-sm font-extrabold text-slate-900 block">{rec.item_name}</span>
                                        <div className="flex items-baseline justify-between mt-1 text-xs font-mono">
                                          <span className="text-slate-600 font-bold">{rec.no_of_items} pc(s) • {rec.net_weight}g</span>
                                          <span className="text-slate-400 text-[10px]">({(rec.net_weight / (rec.no_of_items || 1)).toFixed(2)}g/pc)</span>
                                        </div>
                                      </div>
                                      <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                                        <span className="text-slate-400 font-medium">Recorded Net Weight:</span>
                                        <span className="font-mono font-bold text-amber-600">
                                          {rec.net_weight} grams
                                        </span>
                                      </div>
                                    </div>

                                    {/* 3. Loan Financials */}
                                    <div className="bg-slate-50/80 border border-slate-200/80 p-4 rounded-xl space-y-2">
                                      <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase tracking-wider font-mono">
                                        <span>Loan Financials</span>
                                        <IndianRupee className="w-3.5 h-3.5 text-emerald-500" />
                                      </div>
                                      <div>
                                        <span className="text-base font-black font-mono text-slate-900 block">₹{rec.amount.toLocaleString('en-IN')}</span>
                                        <span className="text-[10px] font-mono text-slate-500">Principal Loan Outlay</span>
                                      </div>
                                      {(() => {
                                        const info = getMonthsAndInterestCalc(rec.pledge_date, rec.release_date, rec.amount);
                                        return (
                                          <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                                            <span className="text-slate-400 font-medium">Accrued Interest ({info.months.toFixed(1)}m):</span>
                                            <span className="font-mono font-bold text-emerald-700">₹{info.estInterest.toLocaleString('en-IN')}</span>
                                          </div>
                                        );
                                      })()}
                                    </div>

                                    {/* 4. Status & Dates */}
                                    <div className="bg-slate-50/80 border border-slate-200/80 p-4 rounded-xl space-y-2">
                                      <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase tracking-wider font-mono">
                                        <span>Status & Schedule</span>
                                        <Clock className="w-3.5 h-3.5 text-indigo-500" />
                                      </div>
                                      <div>
                                        <span className={`inline-block px-2.5 py-1 text-[10px] uppercase font-extrabold rounded-full border ${
                                          rec.release_date ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'
                                        }`}>
                                          {rec.release_date ? `Released on ${rec.release_date}` : 'Active Loan (In Vault)'}
                                        </span>
                                      </div>
                                      <div className="pt-2 border-t border-slate-200/60 text-[11px] space-y-1 font-mono">
                                        <div className="flex justify-between text-slate-500">
                                          <span>Pledged Date:</span>
                                          <span className="font-bold text-slate-800">{rec.pledge_date}</span>
                                        </div>
                                        <div className="flex justify-between text-slate-500">
                                          <span>Release Date:</span>
                                          <span className="font-bold text-slate-800">{rec.release_date || 'Pending Settlement'}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* History Logs & Activity Audit Section */}
                                  <div className="border-t border-slate-100 pt-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                      <h5 className="font-syne font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-2">
                                        <Layers className="w-3.5 h-3.5 text-amber-500" /> History Audit Logs & Notes
                                      </h5>
                                      <span className="text-[10px] font-mono text-slate-400">Sheet Row #{rec.rowIndex || rec.number}</span>
                                    </div>

                                    <div className="bg-slate-50/90 rounded-xl p-4 border border-slate-200/60 space-y-3 text-xs">
                                      <div className="flex items-start gap-3">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                                        <div className="flex-1">
                                          <div className="flex items-center justify-between font-mono text-[11px] text-slate-500">
                                            <span className="font-bold text-slate-800">Pledge Entry Registered</span>
                                            <span>{rec.pledge_date}</span>
                                          </div>
                                          <p className="text-slate-600 mt-0.5">
                                            Pledge registered for <strong className="text-slate-800">{rec.name}</strong> ({rec.phone}). Item: <strong>{rec.item_name}</strong> ({rec.no_of_items} pcs, {rec.net_weight}g) for principal ₹{rec.amount.toLocaleString('en-IN')}.
                                          </p>
                                        </div>
                                      </div>

                                      <div className="flex items-start gap-3 border-t border-slate-200/50 pt-2.5">
                                        <span className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                                        <div className="flex-1">
                                          <div className="flex items-center justify-between font-mono text-[11px] text-slate-500">
                                            <span className="font-bold text-slate-800">Vault Security Storage</span>
                                            <span>{rec.locker ? `Locker ${rec.locker}` : 'Standard Safe'}</span>
                                          </div>
                                          <p className="text-slate-600 mt-0.5">
                                            Collateral safely stored in {rec.locker ? `Locker Box #${rec.locker}` : 'Main Security Vault'}.
                                          </p>
                                        </div>
                                      </div>

                                      {rec.release_date ? (
                                        <div className="flex items-start gap-3 border-t border-slate-200/50 pt-2.5">
                                          <span className="w-2 h-2 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                                          <div className="flex-1">
                                            <div className="flex items-center justify-between font-mono text-[11px] text-slate-500">
                                              <span className="font-bold text-emerald-800">Loan Settled & Released</span>
                                              <span>{rec.release_date}</span>
                                            </div>
                                            <p className="text-slate-600 mt-0.5">
                                              Record marked released on {rec.release_date}. Collateral gold returned to customer.
                                            </p>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-start gap-3 border-t border-slate-200/50 pt-2.5">
                                          <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                                          <div className="flex-1">
                                            <div className="flex items-center justify-between font-mono text-[11px] text-slate-500">
                                              <span className="font-bold text-amber-800">Interest Calculation Schedule</span>
                                              <span>2.0% p.m. Standard</span>
                                            </div>
                                            {(() => {
                                              const info = getMonthsAndInterestCalc(rec.pledge_date, rec.release_date, rec.amount);
                                              return (
                                                <p className="text-slate-600 mt-0.5">
                                                  {info.months.toFixed(1)} month(s) elapsed. Current estimated interest accrued: <strong>₹{info.estInterest.toLocaleString('en-IN')}</strong>. Total settlement required for release: <strong>₹{(rec.amount + info.estInterest).toLocaleString('en-IN')}</strong>.
                                                </p>
                                              );
                                            })()}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  </div>
                                </motion.div>
                              </td>
                            </tr>
                          )}
                        </AnimatePresence>
                        </React.Fragment>
                      );
                    })}

                    {filteredRecords.length === 0 && (
                      <motion.tr
                        key="empty-inventory-state"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2 }}
                      >
                        <td colSpan={13} className="py-14 px-4 text-center bg-slate-50/60 dark:bg-slate-900/40">
                          <div className="max-w-md mx-auto space-y-3">
                            <Search className="w-10 h-10 text-amber-500/60 mx-auto" />
                            <h4 className="font-syne font-bold text-slate-800 text-sm">No Matching Inventory Records Found</h4>
                            <p className="text-xs text-slate-500 leading-relaxed font-medium">
                              {inventorySearch
                                ? `No inventory items matched your search query "${inventorySearch}". Try searching for customer name, phone number, record number (#), item description, or locker location.`
                                : 'No inventory records meet the selected status or month filter criteria.'}
                            </p>
                            {(inventorySearch || inventoryStatusFilter || inventoryMinMonths || inventoryMaxMonths) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setInventorySearch('');
                                  setInventoryStatusFilter('');
                                  setInventoryMinMonths('');
                                  setInventoryMaxMonths('');
                                }}
                                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-syne font-bold text-xs rounded-xl transition cursor-pointer shadow-2xs inline-flex items-center gap-1.5"
                              >
                                <X className="w-3.5 h-3.5" /> Clear Search & Reset Filters
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    )}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
              
              {/* Pagination indicators footer */}
              {filteredRecords.length > RECORDS_PER_PAGE && (
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-slate-500 font-semibold text-xs">
                    Page {recordPage} of {Math.ceil(filteredRecords.length / RECORDS_PER_PAGE)}
                  </span>
                  <div className="flex space-x-1">
                    <button 
                      disabled={recordPage === 1}
                      onClick={() => setRecordPage(p => p - 1)}
                      className="px-3 py-1 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition cursor-pointer"
                    >
                      Pre
                    </button>
                    <button 
                      disabled={recordPage * RECORDS_PER_PAGE >= filteredRecords.length}
                      onClick={() => setRecordPage(p => p + 1)}
                      className="px-3 py-1 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
        })()}


        {/* 5. VIEW ADMIN DASHBOARD (APPROVALS QUEUE & STATISTICS REPORTS) */}
        {activeTab === 'admin' && currentUser?.role === 'admin' && (
          <div className="space-y-6 animate-fade-in">
            {/* Header Dashboard Metrics */}
            <div className="pb-6 border-b border-slate-200/50 dark:border-slate-800/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="glass-badge px-3 py-1 text-[#007aff] dark:text-[#5ac8fa] font-mono text-[9px] font-extrabold uppercase tracking-wide inline-block">
                  Secure Administrative Console
                </span>
                <h3 className="title-display text-3xl font-black text-slate-900 dark:text-white mt-1">Admin Dashboard Summary</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Approve incoming loans, download CSV database backups, and check activity logs.</p>
              </div>

              {/* Header Sync Action Button */}
              <div className="flex flex-wrap items-center gap-3">
                <button 
                  onClick={exportAllRecordsCSV}
                  className="px-5 py-3 btn-liquid-secondary text-xs font-bold font-syne uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  title="Save All Inventory Records to Excel CSV format"
                >
                  <FileSpreadsheet className="w-4 h-4 text-indigo-500" />
                  <span>Save All Records</span>
                </button>
                <button 
                  onClick={exportCurrentMonthDataCSV}
                  className="px-5 py-3 btn-liquid-secondary text-xs font-bold font-syne uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  title="Save Current Month Data to Excel CSV format"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                  <span>Save Current Month</span>
                </button>
                <button 
                  onClick={loadAdminDashboardData}
                  disabled={isStatsLoading}
                  className="px-5 py-3 btn-liquid-primary text-xs font-bold font-syne uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                  title="Force Refresh Statistics"
                >
                  <RefreshCw className={`w-4 h-4 ${isStatsLoading ? 'animate-spin text-white' : ''}`} />
                  <span>{isStatsLoading ? 'Syncing...' : 'Sync Data'}</span>
                </button>
              </div>
            </div>

            {/* 🔍 ADMIN DIRECT INVENTORY SEARCH BAR */}
            <div className="glass-card p-6 shadow-md space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-syne font-black text-slate-900 dark:text-white text-base">🔍 Admin Quick Inventory Search</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Query the backend Google Sheets database instantly without switching views.</p>
                </div>
                <span className="glass-badge px-2.5 py-1 text-[#007aff] dark:text-[#5ac8fa] text-[10px] font-mono font-bold uppercase tracking-wider self-start sm:self-auto">
                  Sheet Query Live
                </span>
              </div>

              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-[#007aff]">
                  <Search className="w-4 h-4" />
                </span>
                <input 
                  type="text" 
                  value={adminSearchQuery}
                  onChange={(e) => setAdminSearchQuery(e.target.value)}
                  placeholder="Type Customer Name, Serial ID #, Phone Number, Locker code, or Item name..." 
                  className="glass-input w-full pl-10 pr-10 py-3 text-xs font-medium"
                />
                {(isAdminSearching || adminSearchQuery) && (
                  <button 
                    onClick={() => setAdminSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {isAdminSearching ? (
                      <RefreshCw className="w-4 h-4 text-[#007aff] animate-spin" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>

              {/* Incremental Live Search Results */}
              {adminSearchResults.length > 0 && adminSearchQuery.trim() && (
                <div className="border border-[#007aff]/30 rounded-2xl overflow-hidden shadow-xs bg-[#007aff]/5 dark:bg-[#007aff]/10 backdrop-blur-md">
                  <div className="px-4 py-2.5 bg-[#007aff]/10 text-[#007aff] dark:text-[#5ac8fa] text-[10px] uppercase font-mono font-black border-b border-[#007aff]/20 flex items-center justify-between">
                    <span>Found {adminSearchResults.length} matching spreadsheet records</span>
                    <span>Admin Quick Matcher</span>
                  </div>
                  <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-200/50 dark:divide-slate-800/60">
                    {adminSearchResults.map((rec, idx) => (
                      <div key={`${rec.number}-${idx}`} className="p-4 bg-white/40 dark:bg-slate-900/40 hover:bg-white/80 dark:hover:bg-slate-800/80 transition flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 glass-badge text-[#007aff] dark:text-[#5ac8fa] font-mono text-[9px] font-black">
                              #{rec.number}
                            </span>
                            <span className="font-extrabold text-slate-900 dark:text-white text-sm">{rec.name}</span>
                            <span className="text-slate-400 font-bold">·</span>
                            <span className="text-slate-500 dark:text-slate-400 font-mono">{rec.phone}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500 dark:text-slate-400 text-[11px]">
                            <span>Locker: <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{rec.locker || 'N/A'}</strong></span>
                            <span className="opacity-40">|</span>
                            <span>Items: <strong className="text-slate-800 dark:text-slate-200 font-bold">{rec.item_name} ({rec.no_of_items}pcs)</strong></span>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 text-right shrink-0">
                          <div className="text-left md:text-right">
                            <span className="text-[9px] text-slate-400 uppercase tracking-widest font-mono block">Gold Net Weight</span>
                            <span className="font-mono text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">{rec.net_weight} g</span>
                          </div>
                          <div className="text-left md:text-right">
                            <span className="text-[9px] text-slate-400 uppercase tracking-widest font-mono block">Loan Principal</span>
                            <span className="font-mono text-xs sm:text-sm font-black text-rose-500 dark:text-rose-400">₹{rec.amount.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="text-left md:text-right">
                            <span className="text-[9px] text-slate-400 uppercase tracking-widest font-mono block">Pledge Date</span>
                            <span className="font-mono text-xs text-slate-800 dark:text-slate-200 font-semibold">{rec.pledge_date}</span>
                          </div>
                          <div className="text-left md:text-right">
                            <span className="text-[9px] text-amber-600 dark:text-amber-400 font-bold uppercase tracking-widest font-mono block">Pledge Period</span>
                            {(() => {
                              const info = getMonthsAndInterestCalc(rec.pledge_date, rec.release_date, rec.amount);
                              return (
                                <button
                                  type="button"
                                  onClick={() => loadPledgeToCalculator(rec)}
                                  className="font-mono text-xs font-black text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-1.5 py-0.5 rounded-lg border border-amber-500/30 transition inline-flex items-center gap-0.5 mt-0.5 cursor-pointer"
                                  title="Calculate Interest for this pledge!"
                                >
                                  ⏰ {info.text} <span className="text-[8px] font-normal text-amber-500">calc</span>
                                </button>
                              );
                            })()}
                          </div>
                          <div className="text-left md:text-right">
                            <span className="text-[9px] text-slate-400 uppercase tracking-widest font-mono block">Status</span>
                            {rec.release_date ? (
                              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 text-[9px] font-bold rounded-lg font-mono">Released {rec.release_date}</span>
                            ) : (
                              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-[9px] font-bold rounded-lg font-mono">Active</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {adminSearchResults.length === 0 && adminSearchQuery.trim() && !isAdminSearching && (
                <div className="p-8 text-center text-slate-400 dark:text-slate-500 border border-dashed border-slate-200/60 dark:border-slate-800/60 rounded-2xl text-xs">
                  ❌ No matching results found in Google Sheet for &ldquo;{adminSearchQuery}&rdquo;
                </div>
              )}
            </div>

            {/* Quick stats mini-row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="glass-card p-5 shadow-sm border border-emerald-500/30">
                <span className="text-[10px] uppercase font-mono tracking-wider text-emerald-600 dark:text-emerald-400 block font-bold">Online Now</span>
                <span className="text-2xl font-black font-syne text-emerald-700 dark:text-emerald-300 mt-1 block">
                  {adminStats?.online_users.length || 0} <span className="text-xs font-sans font-normal text-emerald-500">active sessions</span>
                </span>
              </div>
              <div className="glass-card p-5 shadow-sm border border-amber-500/30">
                <span className="text-[10px] uppercase font-mono tracking-wider text-amber-600 dark:text-amber-400 block font-bold">Pending Approvals</span>
                <span className="text-2xl font-black font-syne text-amber-700 dark:text-amber-300 mt-1 block">
                  {adminStats?.pending_count || 0} <span className="text-xs font-sans font-normal text-amber-500">awaiting review</span>
                </span>
              </div>
              <div className="glass-card p-5 shadow-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-slate-400 block font-bold">Google Sheet Records</span>
                <span className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-1 block">{adminStats?.total_records || 0} items</span>
              </div>
              <div className="glass-card p-5 shadow-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-slate-400 block font-bold">Total Active Amount</span>
                <span className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-1 block">₹{adminStats?.total_amount ? Math.round(adminStats.total_amount).toLocaleString('en-IN') : 0}</span>
              </div>
            </div>

            {/* 📈 LOAN PRINCIPAL TREND CHART (DYNAMIC DATE RANGE & RECHARTS) */}
            <div className="glass-card p-6 shadow-md space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-200/50 dark:border-slate-800/60">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-[#007aff]/10 text-[#007aff] dark:text-[#5ac8fa] rounded-2xl">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-syne font-black text-slate-900 dark:text-white text-base">
                        {trendDateRangeInfo.title}
                      </h4>
                      {trendDateRangeInfo.isFiltered ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-[#007aff]/10 text-[#007aff] border border-[#007aff]/20 flex items-center gap-1">
                          <CalendarRange className="w-3 h-3" /> Date Filter Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                          Last 30 Days
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {trendDateRangeInfo.subtitle}
                    </p>
                  </div>
                </div>

                {/* Summary Metrics for the Active Date Window */}
                <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono">
                  <div className="bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-xl text-amber-900 dark:text-amber-200">
                    <span className="text-[9px] uppercase font-extrabold text-amber-600 dark:text-amber-400 block tracking-wider">
                      {trendDateRangeInfo.isFiltered ? `${trendDateRangeInfo.daysSpan}D Total Pledged` : '30D Total Pledged'}
                    </span>
                    <span className="font-black text-sm">₹{totalTrendAmount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="bg-indigo-500/10 border border-indigo-500/30 px-3 py-1.5 rounded-xl text-indigo-900 dark:text-indigo-200">
                    <span className="text-[9px] uppercase font-extrabold text-indigo-600 dark:text-indigo-400 block tracking-wider">
                      {trendDateRangeInfo.isFiltered ? `${trendDateRangeInfo.daysSpan}D Pledge Count` : '30D Pledge Count'}
                    </span>
                    <span className="font-black text-sm">{totalTrendPledges} items</span>
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-emerald-900 dark:text-emerald-200">
                    <span className="text-[9px] uppercase font-extrabold text-emerald-600 dark:text-emerald-400 block tracking-wider">Peak Daily Outlay</span>
                    <span className="font-black text-sm">₹{peakTrendAmount.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* 📅 Date Range Controller & Quick Presets for Chart */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1 pb-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[10px] uppercase font-mono font-extrabold text-slate-400 flex items-center gap-1 shrink-0">
                    <CalendarRange className="w-3.5 h-3.5 text-[#007aff]" /> Range:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-slate-400">From:</span>
                    <input 
                      type="date"
                      value={inventoryStartDate}
                      onChange={(e) => setInventoryStartDate(e.target.value)}
                      className="glass-input px-2.5 py-1 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                      title="Start date for loan principal trend"
                    />
                  </div>
                  <span className="text-xs text-slate-400 font-mono">to</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-slate-400">To:</span>
                    <input 
                      type="date"
                      value={inventoryEndDate}
                      onChange={(e) => setInventoryEndDate(e.target.value)}
                      className="glass-input px-2.5 py-1 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                      title="End date for loan principal trend"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      const past7 = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                      setInventoryStartDate(past7);
                      setInventoryEndDate(today.toISOString().split('T')[0]);
                    }}
                    className="px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    7 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      const past30 = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                      setInventoryStartDate(past30);
                      setInventoryEndDate(today.toISOString().split('T')[0]);
                    }}
                    className="px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    30 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
                      const lastDay = today.toISOString().split('T')[0];
                      setInventoryStartDate(firstDay);
                      setInventoryEndDate(lastDay);
                    }}
                    className="px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    This Month
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      const jan1 = `${today.getFullYear()}-01-01`;
                      setInventoryStartDate(jan1);
                      setInventoryEndDate(today.toISOString().split('T')[0]);
                    }}
                    className="px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    This Year
                  </button>
                  {(inventoryStartDate || inventoryEndDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setInventoryStartDate('');
                        setInventoryEndDate('');
                      }}
                      className="px-2 py-1 rounded-xl text-[10px] font-mono font-bold text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                      title="Reset date range to default 30 days"
                    >
                      Reset Range ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Recharts Line Chart */}
              <div className="w-full h-[320px] pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={loanTrendData} margin={{ top: 15, right: 15, left: 10, bottom: 20 }}>
                    <defs>
                      <linearGradient id="colorDailyPrincipal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#007aff" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#007aff" stopOpacity={0.0}/>
                      </linearGradient>
                      <linearGradient id="colorCumulativePrincipal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#5ac8fa" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#5ac8fa" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? "#1e293b" : "#e2e8f0"} />
                    <XAxis 
                      dataKey="displayDate" 
                      tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 11, fontWeight: 700 }}
                      axisLine={{ stroke: isDarkMode ? '#334155' : '#cbd5e1' }}
                      tickLine={false}
                      minTickGap={15}
                      dy={8}
                    />
                    <YAxis 
                      yAxisId="left"
                      tickFormatter={(val) => `₹${val >= 100000 ? (val / 100000).toFixed(1) + 'L' : (val / 1000).toFixed(0) + 'k'}`}
                      tick={{ fill: '#007aff', fontSize: 11, fontWeight: 700 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      yAxisId="right"
                      orientation="right"
                      tickFormatter={(val) => `₹${val >= 100000 ? (val / 100000).toFixed(1) + 'L' : (val / 1000).toFixed(0) + 'k'}`}
                      tick={{ fill: '#5ac8fa', fontSize: 11, fontWeight: 700 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Legend 
                      verticalAlign="top" 
                      align="right"
                      height={36} 
                      wrapperStyle={{ fontSize: '11px', fontWeight: 700, paddingBottom: '10px' }} 
                    />
                    
                    <Area 
                      yAxisId="left"
                      type="monotone" 
                      dataKey="dailyPrincipal" 
                      name="Daily Loan Principal (₹)" 
                      fill="url(#colorDailyPrincipal)" 
                      stroke="#007aff" 
                      strokeWidth={3}
                      activeDot={{ r: 6, fill: '#007aff', stroke: '#ffffff', strokeWidth: 2 }}
                    />
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="cumulativePrincipal" 
                      name={trendDateRangeInfo.isFiltered ? "Cumulative Period Growth (₹)" : "Cumulative 30D Growth (₹)"} 
                      stroke="#5ac8fa" 
                      strokeWidth={2.5}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 📊 WEIGHT RANGE DISTRIBUTION PIE CHART */}
            <div className="glass-card p-6 shadow-md space-y-6 mt-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/50 dark:border-slate-800/60">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-2xl border border-amber-500/20">
                    <PieChartIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-syne font-black text-slate-900 dark:text-white text-base">
                      Pledge Distribution by Net Weight Range
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Categorization of active &amp; historical pledges based on gold weight ranges (&lt;5g, 5–10g, &gt;10g)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="glass-badge px-3 py-1 text-slate-700 dark:text-slate-300 font-bold">
                    Total Inventory: {allRecords.length} records
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                {/* Interactive Pie Chart Visualizer */}
                <div className="lg:col-span-5 flex flex-col items-center justify-center relative min-h-[260px]">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={pledgeWeightDistributionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="count"
                        nameKey="rangeLabel"
                      >
                        {pledgeWeightDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke={isDarkMode ? "#0f172a" : "#ffffff"} strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomPieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center Donut Hole Stats Overlay */}
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">Total Pledges</span>
                    <span className="font-syne font-black text-2xl text-slate-900 dark:text-white">{allRecords.length}</span>
                  </div>
                </div>

                {/* Range Details Breakdown Cards */}
                <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {pledgeWeightDistributionData.map((item) => (
                    <div 
                      key={item.rangeLabel}
                      className="bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 space-y-3 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className={`px-2.5 py-1 rounded-xl text-[10px] font-mono font-extrabold uppercase border ${item.badgeBg}`}>
                          {item.rangeLabel}
                        </span>
                        <span className="font-mono text-xs font-black" style={{ color: item.color }}>
                          {item.percentage}%
                        </span>
                      </div>

                      <div>
                        <span className="font-syne font-black text-xl text-slate-900 dark:text-white block">
                          {item.count} <span className="text-xs font-normal text-slate-500 font-sans">items</span>
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block mt-0.5">
                          {item.description}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 space-y-1 font-mono text-[11px]">
                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                          <span>Total Weight:</span>
                          <span className="font-bold text-slate-900 dark:text-white">{item.totalWeight.toFixed(1)}g</span>
                        </div>
                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                          <span>Loan Outlay:</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{item.totalAmount.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* In-depth 2-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
              
              {/* Approvals reviewer list panel */}
              <div className="lg:col-span-8 glass-card overflow-hidden shadow-md">
                <div className="px-6 py-4 bg-rose-500/10 dark:bg-rose-500/20 border-b border-rose-500/20 flex items-center justify-between text-rose-900 dark:text-rose-200">
                  <span className="title-display font-bold text-sm">⏳ PENDING APPROVALS QUEUE ({allPendingQueue.filter(q => q.status === 'pending').length} items)</span>
                </div>
                
                <div className="divide-y divide-slate-200/50 dark:divide-slate-800/60 max-h-[460px] overflow-y-auto">
                  {allPendingQueue.filter(sub => sub.status === 'pending').length > 0 ? (
                    allPendingQueue.filter(sub => sub.status === 'pending').map((sub, idx) => (
                      <div key={`${sub.id}-${idx}`} className="p-5 space-y-3 hover:bg-white/40 dark:hover:bg-slate-800/40 transition">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-syne font-extrabold text-slate-900 dark:text-white text-sm">{sub.record.name}</span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold block">Submitted by <strong className="text-slate-700 dark:text-slate-200 underline">{sub.submitted_by}</strong> · {sub.submitted_at}</span>
                          </div>
                          <span className="px-2 py-0.5 glass-badge text-slate-600 dark:text-slate-300 font-mono text-[9px] font-bold border rounded uppercase">Submission #{sub.id}</span>
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800/60 rounded-xl text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          <div>Contact: <strong className="text-slate-800 dark:text-slate-200 tracking-wide font-bold">{sub.record.phone}</strong></div>
                          <div>Description: <strong className="text-slate-800 dark:text-slate-200 font-bold">{sub.record.item_name}</strong></div>
                          <div>Loan value: <strong className="text-slate-900 dark:text-white font-bold">₹{sub.record.amount.toLocaleString('en-IN')}</strong></div>
                          <div>Weight: <strong className="text-slate-800 dark:text-slate-200 font-bold">{sub.record.net_weight} g</strong></div>
                          <div>No Items: <strong className="text-slate-800 dark:text-slate-200 font-bold">{sub.record.no_of_items}</strong></div>
                          <div>Pledged: <strong className="text-slate-800 dark:text-slate-200 font-bold font-mono">{sub.record.pledge_date}</strong></div>
                          {sub.record.locker && <div className="col-span-3">Locker assignment: <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{sub.record.locker}</strong></div>}
                        </div>

                        {/* Actions block */}
                        <div className="flex items-center space-x-2">
                          <button 
                            onClick={() => handleApproveSubmission(sub.id)}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-syne font-bold text-[10px] tracking-wide uppercase rounded-xl transition cursor-pointer shadow-sm"
                          >
                            ✅ Approve Loan Entry
                          </button>
                          <button 
                            onClick={() => handleRejectSubmission(sub.id)}
                            className="px-4 py-2 btn-liquid-secondary text-rose-600 dark:text-rose-400 font-syne font-bold text-[10px] tracking-wide uppercase rounded-xl transition cursor-pointer"
                          >
                            ❌ Reject Entry
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-16 text-center text-slate-400 text-xs">✅ Zero pending approvals. Database queue cleared!</div>
                  )}
                </div>
              </div>

              {/* Active Online accounts session monitor list */}
              <div className="lg:col-span-4 glass-card overflow-hidden shadow-md">
                <div className="px-5 py-4 bg-slate-100/50 dark:bg-slate-900/50 border-b border-slate-200/50 dark:border-slate-800/60 text-slate-700 dark:text-slate-300 font-semibold text-xs">
                  🟢 LIVE MONITORED ONLINE USERS
                </div>
                
                <div className="divide-y divide-slate-200/50 dark:divide-slate-800/60">
                  {adminStats?.online_users && adminStats.online_users.length > 0 ? (
                    adminStats.online_users.map((usr, idx) => (
                      <div key={`${usr.username}-${idx}`} className="p-4 flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-2">
                          <span className={`w-2 h-2 rounded-full ${usr.idle_seconds < 120 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                          <span className="font-bold text-slate-900 dark:text-white">{usr.username}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wide font-black ${usr.role === 'admin' ? 'bg-red-500 text-white' : 'glass-badge text-slate-500'}`}>
                            {usr.role}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-slate-400">idle {usr.idle_seconds < 60 ? 'active' : `${Math.floor(usr.idle_seconds / 60)}m`}</span>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-slate-400 text-xs">No active sessions.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Audit log trail */}
            <div className="glass-card overflow-hidden shadow-md mt-6">
              <div className="px-6 py-4 bg-slate-100/50 dark:bg-slate-900/50 border-b border-slate-200/50 dark:border-slate-800/60 text-slate-700 dark:text-slate-300 font-semibold text-xs">
                📋 SYSTEM CONSOLE ACTIVITY LOG (Auditing last 50 transactions)
              </div>
              
              <div className="bg-slate-950/90 text-slate-300 font-mono text-[11px] p-6 max-h-[300px] overflow-y-auto space-y-1.5 leading-relaxed border-t border-slate-800">
                {adminStats?.activity_log && adminStats.activity_log.length > 0 ? (
                  adminStats.activity_log.map((log, idx) => (
                    <div key={idx} className="hover:bg-slate-800/60 p-1 rounded transition flex gap-3 text-wrap overflow-hidden">
                      <span className="text-slate-500 shrink-0 select-none">[{log.time}]</span>
                      <span className="text-[#5ac8fa] font-bold shrink-0 uppercase">{log.username}</span>
                      <span className="text-amber-400 font-extrabold shrink-0">{log.action}</span>
                      <span className="text-slate-300 break-all">{log.detail}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-slate-500 text-xs py-4">No logged activity recorded yet.</div>
                )}
              </div>
            </div>
          </div>
        )}

      </main>


      {/* 🛑 DELETE MODAL TRIGGER DIALOG (Admin exclusive) */}
      {deletePendingNum !== null && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="glass-card max-w-sm w-full p-6 text-center border border-white/20 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-500 font-bold text-xl flex items-center justify-center mx-auto border border-rose-500/30">
              ⚠️
            </div>
            <div>
              <h5 className="font-syne font-black text-lg text-slate-900 dark:text-white">Confirm Permanent Delete</h5>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">DANGER: This action will completely and irreversibly erase record <strong className="text-rose-500 font-bold">#{deletePendingNum}</strong> from the worksheet inside Google Sheets.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button 
                onClick={() => setDeletePendingNum(null)}
                className="w-full py-2.5 btn-liquid-secondary text-xs font-semibold cursor-pointer"
              >
                Cancel, Abort
              </button>
              <button 
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl text-xs transition uppercase cursor-pointer shadow-md"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* 💾 REWRITE SPREADSHEET CONFIRMATION MODAL (Admin exclusive) */}
      {editConfirmActive && loadedEditRecord !== null && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="glass-card max-w-sm w-full p-6 text-center border border-white/20 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-500 font-bold text-xl flex items-center justify-center mx-auto border border-amber-500/30">
              💾
            </div>
            <div>
              <h5 className="font-syne font-black text-lg text-slate-900 dark:text-white">Confirm Sheet Rewrite</h5>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Are you sure you want to update pledge record <strong className="text-amber-500 font-bold">#{loadedEditRecord.number}</strong>? This will modify and rewrite the live Google Sheets worksheet directly.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button 
                onClick={() => setEditConfirmActive(false)}
                className="w-full py-2.5 btn-liquid-secondary text-xs font-semibold cursor-pointer"
              >
                Cancel, Abort
              </button>
              <button 
                disabled={isSavingEdit}
                onClick={executeSaveEdit}
                className="w-full py-2.5 btn-liquid-primary text-xs font-bold uppercase cursor-pointer shadow-md"
              >
                {isSavingEdit ? 'Rewriting...' : 'Confirm Rewrite'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ⏳ REJECT SUBMISSION RESERVATION MODAL (Admin exclusive) */}
      {rejectPendingId !== null && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="glass-card max-w-sm w-full p-6 text-center border border-white/20 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-500 font-bold text-xl flex items-center justify-center mx-auto border border-rose-500/30">
              🚫
            </div>
            <div>
              <h5 className="font-syne font-black text-lg text-slate-900 dark:text-white">Confirm Reject</h5>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Are you sure you want to reject and erase pending submission reservation <strong className="text-rose-500 font-bold">#{rejectPendingId}</strong> from the worksheet?
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button 
                onClick={() => setRejectPendingId(null)}
                className="w-full py-2.5 btn-liquid-secondary text-xs font-semibold cursor-pointer"
              >
                No, Keep Pending
              </button>
              <button 
                onClick={executeRejectSubmission}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl text-xs transition uppercase cursor-pointer shadow-md"
              >
                Yes, Reject Now
              </button>
            </div>
          </div>
        </div>
      )}


      {/* 🔄 PROCESSING MODAL */}
      {actionProcessingMsg && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="glass-card max-w-sm w-full p-6 text-center border border-white/20 shadow-2xl space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-[#007aff]/20 text-[#007aff] dark:text-[#5ac8fa] flex items-center justify-center mx-auto mb-4 border border-[#007aff]/30">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>
            <div>
              <h5 className="font-syne font-black text-xl text-slate-900 dark:text-white">Processing</h5>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 font-medium">
                {actionProcessingMsg}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-2">
                Communicating with Google Sheets...
              </p>
            </div>
          </div>
        </div>
      )}


      {/* 🔔 FLOATING TOAST POP-UP MESSAGER */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm animate-bounce-short">
          <div className={`p-4 rounded-2xl border shadow-xl flex items-center space-x-3 text-xs font-semibold backdrop-blur-xl ${
            toastType === 'success' ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border-emerald-500/30' :
            toastType === 'error' ? 'bg-rose-500/20 text-rose-800 dark:text-rose-200 border-rose-500/30' :
            toastType === 'info' ? 'bg-[#007aff]/20 text-blue-900 dark:text-blue-200 border-[#007aff]/30' :
            'bg-amber-500/20 text-amber-900 dark:text-amber-200 border-amber-500/30'
          }`}>
            <span>
              {toastType === 'success' && '✅ '}
              {toastType === 'error' && '❌ '}
              {toastType === 'warning' && '⚠️ '}
              {toastType === 'info' && '🔄 '}
              {toastMessage}
            </span>
          </div>
        </div>
      )}

    </div>
  );
}
