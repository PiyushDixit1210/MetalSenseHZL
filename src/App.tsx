import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Bot,
  BrainCircuit,
  Calculator,
  Download,
  ExternalLink,
  Filter,
  Globe,
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Sliders,
  Trash2,
  X,
  Zap,
} from 'lucide-react';

// Types matching PostgreSQL schema
interface MarketPriceRow {
  id: number;
  date: string;
  metal: string;
  exchangeLme: number;
  exchangeShfe: number;
  exchangeMcx: number;
  exchangeCme: number;
  inrUsdRate: number;
  physicalPremiumIndia: number;
  scenarioTag: string;
  sourceApi?: string;
}

interface EximImportRow {
  id: number;
  date: string;
  metal: string;
  grade: string;
  hsCode: string;
  importerName: string;
  customerLocation: string;
  originCountry: string;
  port: string;
  dutyScheme: string;
  volumeMt: number;
  cifPriceUsd: number;
  landedCostInr: number;
}

interface InternalSaleRow {
  id: number;
  date: string;
  customerId: string;
  customerName: string;
  customerSegment: string;
  region: string;
  metal: string;
  grade: string;
  volumeMt: number;
  realizedPremiumUsd: number;
  saleTypeLtcOrAuction: string;
}

interface MarketIntelligenceRow {
  id: number;
  timestamp: string;
  source: string;
  headline: string;
  summary: string;
  impactScore: number;
  sentimentTag: string;
  affectedMetal: string;
  category: string;
  embedding: string;
}

interface SavedSimulationRow {
  id: number;
  scenarioName: string;
  metal: string;
  grade: string;
  region: string;
  availableVolumeMt: number;
  ltcAllocationPct: number;
  spotAuctionPct: number;
  expectedPremiumUsd: number;
  projectedNsrUsdM: number;
  createdAt: string;
}

interface AlertRuleRow {
  id: number;
  ruleName: string;
  metal: string;
  region: string;
  metricType: string;
  conditionOperator: string;
  thresholdValue: number;
  severity: string;
  notifyInApp: boolean;
  notifyEmail: boolean;
  recipientEmail: string;
  isActive: boolean;
}

interface AlertNotificationRow {
  id: number;
  ruleId?: number;
  title: string;
  metal: string;
  region: string;
  metricType: string;
  severity: string;
  causeSummary: string;
  impactAssessment: string;
  deliveryChannels: string;
  emailRecipient: string;
  emailStatus: string;
  isRead: boolean;
  triggeredAt: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  modelUsed?: string;
  sources?: { title: string; uri: string }[];
  timestamp: string;
}

type ActiveModule = 'demand' | 'tamsam' | 'arbitrage' | 'optimizer' | 'alerts';
type MetalType = 'Zinc' | 'Lead' | 'Silver' | 'Cadmium';

const GRADES_BY_METAL: Record<MetalType, string[]> = {
  Zinc: ['All Grades', 'SHG', 'Jumbo', 'HG', 'PW'],
  Lead: ['All Grades', 'SHG', 'HG'],
  Silver: ['All Grades', '99.99% Silver'],
  Cadmium: ['All Grades', 'Cd-99.95'],
};

const REGIONS = ['All India', 'West', 'East', 'North', 'South'];
const SCENARIOS = [
  'All / Baseline',
  'Monsoon Disruption',
  'Mine Outage',
  'Red Sea Freight Spike',
  'Global Inventory Squeeze',
];

export default function App() {
  // Navigation & Global Filters
  const [activeModule, setActiveModule] = useState<ActiveModule>('demand');
  const [selectedMetal, setSelectedMetal] = useState<MetalType>('Zinc');
  const [selectedGrade, setSelectedGrade] = useState<string>('All Grades');
  const [selectedRegion, setSelectedRegion] = useState<string>('All India');
  const [selectedScenario, setSelectedScenario] = useState<string>('All / Baseline');

  // Database State
  const [marketPrices, setMarketPrices] = useState<MarketPriceRow[]>([]);
  const [eximImports, setEximImports] = useState<EximImportRow[]>([]);
  const [internalSales, setInternalSales] = useState<InternalSaleRow[]>([]);
  const [marketIntelligence, setMarketIntelligence] = useState<MarketIntelligenceRow[]>([]);
  const [savedSimulations, setSavedSimulations] = useState<SavedSimulationRow[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRuleRow[]>([]);
  const [alertNotifications, setAlertNotifications] = useState<AlertNotificationRow[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // Live Market Feed API State
  const [syncingLiveFeed, setSyncingLiveFeed] = useState<boolean>(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(false);
  const [lastFeedSyncTime, setLastFeedSyncTime] = useState<string>('10:15:00');
  const [liveFeedSource, setLiveFeedSource] = useState<string>(
    'open.er-api.com + COMEX/LME Feed'
  );
  const [liveCnyRate, setLiveCnyRate] = useState<number>(7.14);

  // Alerting & Notification Center State
  const [showAlertDrawer, setShowAlertDrawer] = useState<boolean>(false);
  const [selectedEmailPreview, setSelectedEmailPreview] =
    useState<AlertNotificationRow | null>(null);
  const [evaluatingAlerts, setEvaluatingAlerts] = useState<boolean>(false);
  const [newRuleForm, setNewRuleForm] = useState({
    ruleName: '',
    metal: 'Zinc',
    region: 'West',
    metricType: 'Import Parity Trigger',
    conditionOperator: '<',
    thresholdValue: '0',
    severity: 'Critical',
    notifyInApp: true,
    notifyEmail: true,
    recipientEmail: 'commercial.desk@hzlindia.com',
  });
  const [creatingRule, setCreatingRule] = useState<boolean>(false);

  // Module A: Low-Latency Flash Brief State (gemini-3.1-flash-lite)
  const [flashBrief, setFlashBrief] = useState<string>('');
  const [flashLoading, setFlashLoading] = useState<boolean>(false);

  // Module B: EXIM Search, Filter & New Bill of Lading Modal
  const [eximSearch, setEximSearch] = useState<string>('');
  const [dutyFilter, setDutyFilter] = useState<string>('All Schemes');
  const [showAddEximModal, setShowAddEximModal] = useState<boolean>(false);
  const [newEximForm, setNewEximForm] = useState({
    importerName: '',
    grade: 'SHG',
    originCountry: 'South Korea',
    port: 'Nhava Sheva (JNPT)',
    customerLocation: 'West',
    dutyScheme: 'Korea-India CEPA (0% Duty)',
    volumeMt: '1200',
    cifPriceUsd: '3290',
    landedCostInr: '279500',
  });
  const [submittingExim, setSubmittingExim] = useState<boolean>(false);

  // Module C: Arbitrage Calculator & Live Google Search Grounding State (gemini-3.8-flash)
  const [customOceanFreight, setCustomOceanFreight] = useState<number>(42);
  const [customBcdPct, setCustomBcdPct] = useState<number>(5.0);
  const [customPortHandling, setCustomPortHandling] = useState<number>(18);
  const [useCepaZeroDuty, setUseCepaZeroDuty] = useState<boolean>(false);
  const [groundingQuery, setGroundingQuery] = useState<string>('');
  const [groundingLoading, setGroundingLoading] = useState<boolean>(false);
  const [groundingSources, setGroundingSources] = useState<{ title: string; uri: string }[]>([]);
  const [sentimentFilter, setSentimentFilter] = useState<string>('All');

  // Module D: Commercial Premium & Auction Allocation Optimizer + High Thinking (gemini-4-argon)
  const [availVolumeMt, setAvailVolumeMt] = useState<number>(38500);
  const [ltcSplitPct, setLtcSplitPct] = useState<number>(68);
  const [inlandFreightUsd, setInlandFreightUsd] = useState<number>(24);
  const [competitorDiscountUsd, setCompetitorDiscountUsd] = useState<number>(8);
  const [deepThinkingResult, setDeepThinkingResult] = useState<string>('');
  const [deepThinkingLoading, setDeepThinkingLoading] = useState<boolean>(false);
  const [savingSim, setSavingSim] = useState<boolean>(false);

  // Multi-Turn Gemini Chatbot Drawer State
  const [chatOpen, setChatOpen] = useState<boolean>(false);
  const [chatMode, setChatMode] = useState<'fast' | 'search' | 'thinking'>('search');
  const [chatInput, setChatInput] = useState<string>('');
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      role: 'model',
      text: 'Welcome to the HZL MetalSense AI Commercial Desk. Ask me to evaluate SHFE/LME import parity at Mundra & JNPT, stress-test Korea-India CEPA duty-free Zinc inflows, or optimize your monthly SHG/Jumbo LTC vs. Spot Auction split.',
      modelUsed: 'gemini-3.8-flash',
      timestamp: '09:54',
    },
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Reset grade when metal changes
  useEffect(() => {
    setSelectedGrade('All Grades');
    if (selectedMetal === 'Zinc') setAvailVolumeMt(38500);
    if (selectedMetal === 'Lead') setAvailVolumeMt(16500);
    if (selectedMetal === 'Silver') setAvailVolumeMt(62);
    if (selectedMetal === 'Cadmium') setAvailVolumeMt(195);
  }, [selectedMetal]);

  // Fetch core PostgreSQL datasets
  const fetchDashboardData = async () => {
    setLoadingData(true);
    setDataError(null);
    try {
      const res = await fetch('/api/dashboard-data');
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to load database tables.');
      }
      const data = await res.json();
      setMarketPrices(data.marketPrices || []);
      setEximImports(data.eximImports || []);
      setInternalSales(data.internalSales || []);
      setMarketIntelligence(data.marketIntelligence || []);
      setAlertRules(data.alertRules || []);
      setAlertNotifications(data.alertNotifications || []);
    } catch (err: any) {
      setDataError(err.message || 'Database connection error.');
    } finally {
      setLoadingData(false);
    }
  };

  // Trigger Live Market Feed API Sync (`POST /api/market-feed/sync`)
  const handleSyncLiveMarketFeed = async () => {
    setSyncingLiveFeed(true);
    try {
      const res = await fetch('/api/market-feed/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Live market feed sync failed');
      if (data.marketPrices) setMarketPrices(data.marketPrices);
      if (data.alertNotifications) setAlertNotifications(data.alertNotifications);
      if (data.sourceApi) setLiveFeedSource(data.sourceApi);
      if (data.cnyUsdRate) setLiveCnyRate(data.cnyUsdRate);
      setLastFeedSyncTime(new Date().toTimeString().slice(0, 8));
    } catch (err: any) {
      console.error('Market feed sync error:', err);
    } finally {
      setSyncingLiveFeed(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    handleSyncLiveMarketFeed();
    (async () => {
      try {
        const res = await fetch('/api/simulations');
        if (res.ok) {
          const sims = await res.json();
          setSavedSimulations(sims);
        }
      } catch (e) {
        console.error('Error loading saved simulations:', e);
      }
    })();
  }, []);

  // Optional 30s Live Exchange Feed Auto-Sync
  useEffect(() => {
    if (!autoSyncEnabled) return;
    const timer = setInterval(() => {
      handleSyncLiveMarketFeed();
    }, 30000);
    return () => clearInterval(timer);
  }, [autoSyncEnabled]);

  useEffect(() => {
    if (chatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatOpen]);

  const unreadAlertsCount = useMemo(
    () => alertNotifications.filter((n) => !n.isRead).length,
    [alertNotifications]
  );

  // Filtered prices for selected metal
  const metalPrices = useMemo(() => {
    return marketPrices.filter((p) => p.metal === selectedMetal);
  }, [marketPrices, selectedMetal]);

  const latestPrice = useMemo(() => {
    if (metalPrices.length === 0) {
      return {
        date: '2026-10-24',
        metal: selectedMetal,
        exchangeLme:
          selectedMetal === 'Zinc'
            ? 3165
            : selectedMetal === 'Lead'
            ? 2275
            : selectedMetal === 'Silver'
            ? 34.1
            : 3960,
        exchangeShfe:
          selectedMetal === 'Zinc'
            ? 25180
            : selectedMetal === 'Lead'
            ? 18790
            : selectedMetal === 'Silver'
            ? 8820
            : 31680,
        exchangeMcx:
          selectedMetal === 'Zinc'
            ? 285.4
            : selectedMetal === 'Lead'
            ? 205.6
            : selectedMetal === 'Silver'
            ? 99450
            : 351.2,
        exchangeCme:
          selectedMetal === 'Zinc'
            ? 3182
            : selectedMetal === 'Lead'
            ? 2290
            : selectedMetal === 'Silver'
            ? 34.28
            : 3985,
        inrUsdRate: 84.08,
        physicalPremiumIndia:
          selectedMetal === 'Zinc'
            ? 176
            : selectedMetal === 'Lead'
            ? 119
            : selectedMetal === 'Silver'
            ? 1.26
            : 222,
        scenarioTag: 'Live Exchange Feed',
        sourceApi: liveFeedSource,
      };
    }
    return metalPrices[metalPrices.length - 1];
  }, [metalPrices, selectedMetal, liveFeedSource]);

  // Filtered Internal ERP Sales
  const filteredInternalSales = useMemo(() => {
    return internalSales.filter((s) => {
      if (s.metal !== selectedMetal) return false;
      if (selectedGrade !== 'All Grades' && s.grade !== selectedGrade) return false;
      if (selectedRegion !== 'All India' && s.region !== selectedRegion) return false;
      return true;
    });
  }, [internalSales, selectedMetal, selectedGrade, selectedRegion]);

  // Module A: Historical + 6-Month AI Forecast Series with Confidence Intervals
  const demandForecastSeries = useMemo(() => {
    const monthlyMap = new Map<
      string,
      { volume: number; premiumSum: number; count: number }
    >();
    filteredInternalSales.forEach((s) => {
      const ym = s.date.slice(0, 7);
      const curr = monthlyMap.get(ym) || { volume: 0, premiumSum: 0, count: 0 };
      curr.volume += s.volumeMt;
      curr.premiumSum += s.realizedPremiumUsd;
      curr.count += 1;
      monthlyMap.set(ym, curr);
    });

    const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
    const labels: Record<string, string> = {
      '2026-05': 'May 26',
      '2026-06': 'Jun 26',
      '2026-07': 'Jul 26 (Monsoon)',
      '2026-08': 'Aug 26 (Outage)',
      '2026-09': 'Sep 26 (Freight)',
      '2026-10': 'Oct 26 (Actual)',
    };

    const baseDefault =
      selectedMetal === 'Zinc'
        ? 44000
        : selectedMetal === 'Lead'
        ? 16000
        : selectedMetal === 'Silver'
        ? 55
        : 185;

    const historicalPoints = months.map((ym, idx) => {
      const entry = monthlyMap.get(ym);
      const actualVol =
        entry && entry.volume > 0
          ? Math.round(entry.volume * 10) / 10
          : Math.round(baseDefault * (0.9 + idx * 0.04));
      return {
        period: labels[ym] || ym,
        historicalMt: actualVol,
        forecastMt: idx === months.length - 1 ? actualVol : null,
        ciLower: idx === months.length - 1 ? actualVol : null,
        ciUpper: idx === months.length - 1 ? actualVol : null,
        scenarioNote:
          idx === 2 ? 'Monsoon Dip' : idx === 3 ? 'Mine Outage' : 'Actual ERP',
      };
    });

    const lastActual =
      historicalPoints[historicalPoints.length - 1]?.historicalMt || baseDefault;

    const scenarioMultiplier =
      selectedScenario === 'Monsoon Disruption'
        ? 0.93
        : selectedScenario === 'Mine Outage'
        ? 1.07
        : selectedScenario === 'Red Sea Freight Spike'
        ? 1.09
        : selectedScenario === 'Global Inventory Squeeze'
        ? 1.12
        : 1.04;

    const futureMonths = [
      { label: 'Nov 26 (F)', growth: 1.025 },
      { label: 'Dec 26 (F)', growth: 1.052 },
      { label: 'Jan 27 (F)', growth: 1.078 },
      { label: 'Feb 27 (F)', growth: 1.095 },
      { label: 'Mar 27 (F)', growth: 1.134 },
      { label: 'Apr 27 (F)', growth: 1.112 },
    ];

    const forecastPoints = futureMonths.map((fm, idx) => {
      const projected =
        Math.round(lastActual * fm.growth * scenarioMultiplier * 10) / 10;
      const spread = 0.045 + idx * 0.014;
      return {
        period: fm.label,
        historicalMt: null,
        forecastMt: projected,
        ciLower: Math.round(projected * (1 - spread) * 10) / 10,
        ciUpper: Math.round(projected * (1 + spread) * 10) / 10,
        scenarioNote: selectedScenario,
      };
    });

    return [...historicalPoints, ...forecastPoints];
  }, [filteredInternalSales, selectedMetal, selectedScenario]);

  // Macro Downstream Driver Impact Cards for Module A
  const macroDrivers = useMemo(() => {
    if (selectedMetal === 'Zinc') {
      return [
        {
          sector: 'Galvanized Steel & Coated Coils',
          weightPct: '56%',
          momDelta: '+6.8% MoM',
          positive: true,
          schemeRef: 'Specialty Steel PLI Phase-II',
          summary:
            'Continuous Galvanizing Line (CGL) ramp-ups at JSW Dolvi and Tata Kalinganagar driving CGG Jumbo & SHG demand.',
        },
        {
          sector: 'Infrastructure & Transmission Towers',
          weightPct: '22%',
          momDelta: '+8.2% MoM',
          positive: true,
          schemeRef: 'PM GatiShakti & PGCIL HVDC',
          summary:
            'Post-monsoon EPC execution surge in 765kV transmission corridors lifting Prime Western (PW) and HG batch galvanizing.',
        },
        {
          sector: 'Automotive & EV Die-Casting Alloys',
          weightPct: '14%',
          momDelta: '+4.1% MoM',
          positive: true,
          schemeRef: 'Auto Component PLI',
          summary:
            'Zamak-3 and Zamak-5 precision die-casting orders expanding across West & South India Tier-1 OEM clusters.',
        },
        {
          sector: 'Chemical Oxides & Exports',
          weightPct: '8%',
          momDelta: '-1.4% MoM',
          positive: false,
          schemeRef: 'Red Sea Container Surcharge',
          summary:
            'Higher container freight to Europe slightly moderating zinc oxide tyre-grade export conversions.',
        },
      ];
    }
    if (selectedMetal === 'Lead') {
      return [
        {
          sector: 'Automotive SLI & Start-Stop Batteries',
          weightPct: '52%',
          momDelta: '+5.4% MoM',
          positive: true,
          schemeRef: 'OEM Festive & Replacement Cycle',
          summary:
            'Strong replacement battery demand from Exide and Amara Raja supporting primary SHG 99.99% Lead off-take.',
        },
        {
          sector: 'Industrial UPS, Telecom & Data Centers',
          weightPct: '29%',
          momDelta: '+7.6% MoM',
          positive: true,
          schemeRef: 'Hyperscale Data Center Rollout',
          summary:
            'VRLA stationary energy storage installations in Mumbai and Chennai driving low-bismuth pure lead premiums.',
        },
        {
          sector: 'E-Rickshaw & Light EV Traction Packs',
          weightPct: '12%',
          momDelta: '+3.9% MoM',
          positive: true,
          schemeRef: 'North India L3 Mobility',
          summary:
            'Deep-cycle tubular battery demand resilient across UP, Bihar, and NCR distribution networks.',
        },
        {
          sector: 'Secondary Scrap Recycling Competition',
          weightPct: '7%',
          momDelta: '-2.8% MoM',
          positive: false,
          schemeRef: 'BWMR EPR Compliance Quota',
          summary:
            'Increased domestic secondary smelting supply narrowing spot premiums on standard HG Lead ingots.',
        },
      ];
    }
    if (selectedMetal === 'Silver') {
      return [
        {
          sector: 'Solar PV TOPCon Metallization Paste',
          weightPct: '44%',
          momDelta: '+14.2% MoM',
          positive: true,
          schemeRef: 'MNRE ALMM & Solar PLI Tranche-II',
          summary:
            '18 GW domestic N-type TOPCon cell lines require 1.4x higher silver paste loading per watt from Pantnagar refinery.',
        },
        {
          sector: 'HV Switchgear & EV Electrical Contacts',
          weightPct: '26%',
          momDelta: '+6.5% MoM',
          positive: true,
          schemeRef: 'Grid Modernization Capex',
          summary:
            'Silver-tin-oxide contact brazing alloys seeing sustained procurement from ABB, Siemens, and L&T.',
        },
        {
          sector: 'Industrial Catalysts & Brazing',
          weightPct: '18%',
          momDelta: '+3.2% MoM',
          positive: true,
          schemeRef: 'Petrochemical EO Turnarounds',
          summary:
            'Ethylene oxide catalyst reloads in Gujarat refining corridor bolstering 99.99% silver granule schedules.',
        },
        {
          sector: 'Bullion & Duty-Adjusted Imports',
          weightPct: '12%',
          momDelta: '-1.9% MoM',
          positive: false,
          schemeRef: 'UAE CEPA Bullion Quota',
          summary:
            'Concessional UAE silver doré/bullion imports competing in western wholesale hubs.',
        },
      ];
    }
    return [
      {
        sector: 'Industrial & Defense Ni-Cd Batteries',
        weightPct: '58%',
        momDelta: '+5.1% MoM',
        positive: true,
        schemeRef: 'Railways & Defense Indigenization',
        summary:
          'High-reliability pocket-plate and sintered Ni-Cd cells for Indian Railways and aviation backup systems.',
      },
      {
        sector: 'CdTe Thin-Film Solar PV Manufacturing',
        weightPct: '31%',
        momDelta: '+9.4% MoM',
        positive: true,
        schemeRef: 'South India Thin-Film Fab',
        summary:
          'High-purity cadmium telluride precursor synthesis lifting regional demand in Tamil Nadu.',
      },
      {
        sector: 'Specialty Aerospace Coatings & Pigments',
        weightPct: '11%',
        momDelta: '+1.8% MoM',
        positive: true,
        schemeRef: 'HAL / Defense MRO',
        summary:
          'Corrosion-resistant sacrificial plating for marine and aerospace fasteners.',
      },
    ];
  }, [selectedMetal]);

  // Module B: TAM & SAM Market Segmentation Engine Calculations
  const tamSamSegmentation = useMemo(() => {
    const regionList = ['West', 'East', 'North', 'South'];

    const rows = regionList.map((reg) => {
      const hzlVol = internalSales
        .filter(
          (s) =>
            s.metal === selectedMetal &&
            s.region === reg &&
            (selectedGrade === 'All Grades' || s.grade === selectedGrade)
        )
        .reduce((acc, s) => acc + s.volumeMt, 0);

      const importVol = eximImports
        .filter(
          (i) =>
            i.metal === selectedMetal &&
            i.customerLocation === reg &&
            (selectedGrade === 'All Grades' || i.grade === selectedGrade)
        )
        .reduce((acc, i) => acc + i.volumeMt, 0);

      const monthlyHzl =
        Math.round((hzlVol / 6) * 10) / 10 ||
        (selectedMetal === 'Zinc' ? 12500 : 4200);
      const monthlyImport =
        Math.round(importVol * 10) / 10 ||
        (selectedMetal === 'Zinc' ? 2100 : 850);
      const secondaryRatio =
        selectedMetal === 'Lead' ? 0.34 : selectedMetal === 'Zinc' ? 0.11 : 0.16;
      const domesticCompetitorScrap =
        Math.round((monthlyHzl + monthlyImport) * secondaryRatio * 10) / 10;

      const tam =
        Math.round((monthlyHzl + monthlyImport + domesticCompetitorScrap) * 10) / 10;
      const sam =
        Math.round(
          (monthlyHzl + monthlyImport + domesticCompetitorScrap * 0.45) * 10
        ) / 10;

      return {
        region: `${reg} India`,
        rawRegion: reg,
        hzlDomesticSales: monthlyHzl,
        eximImports: monthlyImport,
        secondaryScrap: domesticCompetitorScrap,
        tam,
        sam,
        hzlShareOfSamPct:
          sam > 0 ? Math.round((monthlyHzl / sam) * 1000) / 10 : 72,
      };
    });

    const filteredRows =
      selectedRegion === 'All India'
        ? rows
        : rows.filter((r) => r.rawRegion === selectedRegion);

    const totalTam = filteredRows.reduce((s, r) => s + r.tam, 0);
    const totalSam = filteredRows.reduce((s, r) => s + r.sam, 0);
    const totalHzl = filteredRows.reduce((s, r) => s + r.hzlDomesticSales, 0);
    const totalImports = filteredRows.reduce((s, r) => s + r.eximImports, 0);

    return {
      chartData: rows,
      totalTam: Math.round(totalTam * 10) / 10,
      totalSam: Math.round(totalSam * 10) / 10,
      totalHzl: Math.round(totalHzl * 10) / 10,
      totalImports: Math.round(totalImports * 10) / 10,
      hzlSamSharePct:
        totalSam > 0 ? Math.round((totalHzl / totalSam) * 1000) / 10 : 74.5,
    };
  }, [internalSales, eximImports, selectedMetal, selectedGrade, selectedRegion]);

  // Filtered EXIM Table rows with HZL Landed Cost Parity Delta
  const filteredEximRows = useMemo(() => {
    const hzlBenchmarkInr =
      (latestPrice.exchangeLme + latestPrice.physicalPremiumIndia) *
      latestPrice.inrUsdRate;

    return eximImports
      .filter((row) => {
        if (row.metal !== selectedMetal) return false;
        if (selectedGrade !== 'All Grades' && row.grade !== selectedGrade) return false;
        if (selectedRegion !== 'All India' && row.customerLocation !== selectedRegion)
          return false;
        if (dutyFilter !== 'All Schemes' && !row.dutyScheme.includes(dutyFilter))
          return false;
        if (
          eximSearch.trim() !== '' &&
          !`${row.importerName} ${row.originCountry} ${row.port} ${row.hsCode}`
            .toLowerCase()
            .includes(eximSearch.toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .map((row) => {
        const parityGapInr = Math.round(row.landedCostInr - hzlBenchmarkInr);
        return {
          ...row,
          hzlBenchmarkInr: Math.round(hzlBenchmarkInr),
          parityGapInr,
        };
      });
  }, [
    eximImports,
    selectedMetal,
    selectedGrade,
    selectedRegion,
    dutyFilter,
    eximSearch,
    latestPrice,
  ]);

  // Module B: 3-Month Moving Average EXIM Import Volume vs. HZL Realized Domestic Premium Correlation
  const eximMovingAverageCorrelation = useMemo(() => {
    const months = [
      { key: '2026-05', label: 'May 26', period: 'May 26', fullDate: 'May 2026' },
      { key: '2026-06', label: 'Jun 26', period: 'Jun 26', fullDate: 'June 2026' },
      { key: '2026-07', label: 'Jul 26', period: 'Jul 26', fullDate: 'July 2026' },
      { key: '2026-08', label: 'Aug 26', period: 'Aug 26', fullDate: 'August 2026' },
      { key: '2026-09', label: 'Sep 26', period: 'Sep 26', fullDate: 'September 2026' },
      { key: '2026-10', label: 'Oct 26', period: 'Oct 26', fullDate: 'October 2026' },
    ];

    const fallbackEximSeries: Record<MetalType, number[]> = {
      Zinc: [14950, 14550, 12900, 14500, 16150, 17950],
      Lead: [6400, 6700, 5800, 6200, 7100, 7450],
      Silver: [42, 46, 39, 44, 51, 56],
      Cadmium: [35, 38, 32, 36, 42, 48],
    };

    const fallbackPremSeries: Record<MetalType, number[]> = {
      Zinc: [164, 166, 171, 167, 161, 156],
      Lead: [96, 94, 99, 97, 92, 89],
      Silver: [1.38, 1.35, 1.44, 1.4, 1.32, 1.28],
      Cadmium: [315, 310, 322, 316, 304, 298],
    };

    const regFactor =
      selectedRegion === 'All India'
        ? 1.0
        : selectedRegion === 'West'
        ? 0.38
        : selectedRegion === 'North'
        ? 0.3
        : selectedRegion === 'South'
        ? 0.2
        : 0.12;

    const monthlyRaw = months.map((m, idx) => {
      const monthEximRows = eximImports.filter((row) => {
        if (row.metal !== selectedMetal) return false;
        if (selectedGrade !== 'All Grades' && row.grade !== selectedGrade) return false;
        if (selectedRegion !== 'All India' && row.customerLocation !== selectedRegion)
          return false;
        return row.date.startsWith(m.key);
      });

      const dbEximVol = monthEximRows.reduce((sum, r) => sum + r.volumeMt, 0);
      const eximVolMt =
        dbEximVol > 0
          ? Math.round(dbEximVol)
          : Math.round((fallbackEximSeries[selectedMetal]?.[idx] ?? 12000) * regFactor);

      const monthSalesRows = internalSales.filter((row) => {
        if (row.metal !== selectedMetal) return false;
        if (selectedGrade !== 'All Grades' && row.grade !== selectedGrade) return false;
        if (selectedRegion !== 'All India' && row.region !== selectedRegion) return false;
        return row.date.startsWith(m.key);
      });

      const totalSalesVol = monthSalesRows.reduce((sum, r) => sum + r.volumeMt, 0);
      const weightedPrem =
        totalSalesVol > 0
          ? monthSalesRows.reduce(
              (sum, r) => sum + r.realizedPremiumUsd * r.volumeMt,
              0
            ) / totalSalesVol
          : fallbackPremSeries[selectedMetal]?.[idx] ?? latestPrice.physicalPremiumIndia;

      const realizedPremUsd =
        selectedMetal === 'Silver'
          ? Number(weightedPrem.toFixed(2))
          : Math.round(weightedPrem * 10) / 10;

      return {
        ...m,
        monthlyEximMt: eximVolMt,
        hzlRealizedPremiumUsd: realizedPremUsd,
      };
    });

    const series = monthlyRaw.map((point, idx) => {
      const windowSlice = monthlyRaw.slice(Math.max(0, idx - 2), idx + 1);
      const ma3Vol =
        windowSlice.reduce((sum, item) => sum + item.monthlyEximMt, 0) /
        windowSlice.length;
      const prevMa =
        idx > 0
          ? monthlyRaw
              .slice(Math.max(0, idx - 3), idx)
              .reduce((sum, item) => sum + item.monthlyEximMt, 0) /
            Math.min(3, idx)
          : ma3Vol;
      const momMaDeltaPct =
        prevMa > 0 ? Number((((ma3Vol - prevMa) / prevMa) * 100).toFixed(1)) : 0;

      return {
        ...point,
        exim3mMaMt: Math.round(ma3Vol),
        momMaDeltaPct,
        windowSize: windowSlice.length,
      };
    });

    const n = series.length;
    const xs = series.map((d) => d.exim3mMaMt);
    const ys = series.map((d) => d.hzlRealizedPremiumUsd);
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    const num = xs.reduce((acc, x, i) => acc + (x - meanX) * (ys[i] - meanY), 0);
    const denX = Math.sqrt(xs.reduce((acc, x) => acc + Math.pow(x - meanX, 2), 0));
    const denY = Math.sqrt(ys.reduce((acc, y) => acc + Math.pow(y - meanY, 2), 0));
    const pearsonR =
      denX > 0 && denY > 0 ? Number((num / (denX * denY)).toFixed(2)) : -0.78;

    const latestPoint = series[series.length - 1];
    const earliestPoint = series[0];
    const maGrowthPct =
      earliestPoint.exim3mMaMt > 0
        ? Number(
            (
              ((latestPoint.exim3mMaMt - earliestPoint.exim3mMaMt) /
                earliestPoint.exim3mMaMt) *
              100
            ).toFixed(1)
          )
        : 0;

    const regimeLabel =
      pearsonR <= -0.5
        ? 'Inverse Import-Displacement Regime (High Correlation)'
        : pearsonR >= 0.4
        ? 'Demand-Pull Expansion Regime (Co-Movement)'
        : 'Buffered Duty-Parity Regime (Low Elasticity)';

    return {
      series,
      pearsonR,
      regimeLabel,
      correlationRegime: regimeLabel,
      latest3mMaMt: latestPoint.exim3mMaMt,
      latestMonthlyEximMt: latestPoint.monthlyEximMt,
      latestRealizedPremUsd: latestPoint.hzlRealizedPremiumUsd,
      maGrowthPct,
      maMomChangePct: latestPoint.momMaDeltaPct,
    };
  }, [
    eximImports,
    internalSales,
    selectedMetal,
    selectedGrade,
    selectedRegion,
    latestPrice.physicalPremiumIndia,
  ]);

  // Module C: Exchange Arbitrage & Import Parity Math
  const arbitrageMetrics = useMemo(() => {
    const lme = latestPrice.exchangeLme;
    const shfe = latestPrice.exchangeShfe;
    const mcx = latestPrice.exchangeMcx;
    const fxInr = latestPrice.inrUsdRate;
    const dutyRate = useCepaZeroDuty ? 0 : customBcdPct / 100;
    const swsRate = dutyRate * 0.1;

    const cifUsd = lme + customOceanFreight;
    const customsDutyUsd = cifUsd * (dutyRate + swsRate);
    const landedImportUsd = cifUsd + customsDutyUsd + customPortHandling;
    const landedImportInrPerMt =
      selectedMetal === 'Silver'
        ? Math.round(landedImportUsd * 32.1507 * fxInr)
        : Math.round(landedImportUsd * fxInr);

    const hzlDomesticInrPerMt =
      selectedMetal === 'Silver'
        ? Math.round((lme + latestPrice.physicalPremiumIndia) * 32.1507 * fxInr)
        : Math.round((lme + latestPrice.physicalPremiumIndia) * fxInr);

    const shfeLmeRatio = lme > 0 ? Number((shfe / lme).toFixed(2)) : 8.0;
    const arbWindowStatus =
      shfeLmeRatio < 8.0
        ? 'Asian Tightness — Bullish India Premium'
        : shfeLmeRatio > 8.35
        ? 'China Import Window Open — Bullish LME'
        : 'Neutral Parity Corridor';

    const importMarginInr = landedImportInrPerMt - hzlDomesticInrPerMt;

    return {
      lme,
      shfe,
      mcx,
      cme: latestPrice.exchangeCme,
      fxInr,
      shfeLmeRatio,
      arbWindowStatus,
      landedImportUsd: Math.round(landedImportUsd * 100) / 100,
      landedImportInrPerMt,
      hzlDomesticInrPerMt,
      importMarginInr,
      effectiveDutyPct: Number(((dutyRate + swsRate) * 100).toFixed(2)),
    };
  }, [
    latestPrice,
    customOceanFreight,
    customBcdPct,
    customPortHandling,
    useCepaZeroDuty,
    selectedMetal,
  ]);

  // Module D: Commercial Premium & Auction Allocation Optimizer Math
  const optimizerSimulation = useMemo(() => {
    const lme = latestPrice.exchangeLme;
    const basePremium = latestPrice.physicalPremiumIndia;
    const importCeilingPremiumUsd =
      selectedMetal === 'Silver'
        ? 1.45
        : Math.round(
            lme * (customBcdPct / 100) * 0.65 +
              customOceanFreight +
              customPortHandling -
              competitorDiscountUsd
          );

    const splits = [20, 35, 50, 60, 68, 75, 85, 95];
    const curve = splits.map((ltcPct) => {
      const spotPct = 100 - ltcPct;
      const ltcRealizedPrem =
        selectedMetal === 'Silver'
          ? Number((basePremium * 0.96).toFixed(2))
          : Math.round(Math.min(basePremium * 0.98, importCeilingPremiumUsd - 6));

      const scarcityBoost =
        spotPct <= 32
          ? 1 + (32 - Math.abs(spotPct - 28)) * 0.0045
          : 1 - (spotPct - 32) * 0.0065;

      const spotRealizedPrem =
        selectedMetal === 'Silver'
          ? Number((basePremium * scarcityBoost).toFixed(2))
          : Math.round(basePremium * scarcityBoost);

      const blendedPremium =
        selectedMetal === 'Silver'
          ? Number(
              ((ltcPct * ltcRealizedPrem + spotPct * spotRealizedPrem) / 100).toFixed(2)
            )
          : Math.round((ltcPct * ltcRealizedPrem + spotPct * spotRealizedPrem) / 100);

      const netbackPerUnitUsd =
        selectedMetal === 'Silver'
          ? (lme + blendedPremium) * 32150.7 - inlandFreightUsd
          : lme + blendedPremium - inlandFreightUsd;

      const totalNsrUsdM = Number(
        ((availVolumeMt * netbackPerUnitUsd) / 1_000_000).toFixed(2)
      );

      return {
        splitLabel: `${ltcPct}/${spotPct}`,
        ltcPct,
        spotPct,
        ltcRealizedPrem,
        spotRealizedPrem,
        blendedPremium,
        totalNsrUsdM,
      };
    });

    const spotPct = 100 - ltcSplitPct;
    const ltcPrem =
      selectedMetal === 'Silver'
        ? Number((basePremium * 0.96).toFixed(2))
        : Math.round(Math.min(basePremium * 0.98, importCeilingPremiumUsd - 6));
    const boost =
      spotPct <= 32
        ? 1 + (32 - Math.abs(spotPct - 28)) * 0.0045
        : 1 - (spotPct - 32) * 0.0065;
    const spotPrem =
      selectedMetal === 'Silver'
        ? Number((basePremium * boost).toFixed(2))
        : Math.round(basePremium * boost);
    const activeBlendedPrem =
      selectedMetal === 'Silver'
        ? Number(((ltcSplitPct * ltcPrem + spotPct * spotPrem) / 100).toFixed(2))
        : Math.round((ltcSplitPct * ltcPrem + spotPct * spotPrem) / 100);

    const activeNetbackUnit =
      selectedMetal === 'Silver'
        ? (lme + activeBlendedPrem) * 32150.7 - inlandFreightUsd
        : lme + activeBlendedPrem - inlandFreightUsd;
    const activeNsrUsdM = Number(
      ((availVolumeMt * activeNetbackUnit) / 1_000_000).toFixed(2)
    );
    const activeNsrInrCr = Number(
      ((activeNsrUsdM * latestPrice.inrUsdRate) / 10).toFixed(2)
    );

    const optimalPoint = curve.reduce(
      (best, cur) => (cur.totalNsrUsdM > best.totalNsrUsdM ? cur : best),
      curve[0]
    );

    return {
      curve,
      spotPct,
      ltcVolumeMt: Math.round((availVolumeMt * ltcSplitPct) / 100),
      spotVolumeMt: Math.round((availVolumeMt * spotPct) / 100),
      activeBlendedPrem,
      activeNsrUsdM,
      activeNsrInrCr,
      importCeilingPremiumUsd,
      optimalPoint,
    };
  }, [
    latestPrice,
    selectedMetal,
    availVolumeMt,
    ltcSplitPct,
    inlandFreightUsd,
    competitorDiscountUsd,
    customBcdPct,
    customOceanFreight,
    customPortHandling,
  ]);

  // Action Handlers
  const handleRunFlashBrief = async () => {
    setFlashLoading(true);
    try {
      const nextMonthForecast =
        demandForecastSeries.find(
          (d) => d.forecastMt !== null && d.historicalMt === null
        )?.forecastMt || 52400;
      const res = await fetch('/api/ai/flash-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metal: selectedMetal,
          grade: selectedGrade,
          region: selectedRegion,
          scenario: selectedScenario,
          currentLme: latestPrice.exchangeLme,
          currentPremium: latestPrice.physicalPremiumIndia,
          forecastDemandMt: nextMonthForecast,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate brief');
      setFlashBrief(data.brief);
    } catch (err: any) {
      setFlashBrief(`Alert: ${err.message}`);
    } finally {
      setFlashLoading(false);
    }
  };

  const handleRunGroundingScan = async () => {
    setGroundingLoading(true);
    try {
      const res = await fetch('/api/ai/grounding-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metal: selectedMetal,
          queryTopic: groundingQuery.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search grounding request failed');
      if (data.item) {
        setMarketIntelligence((prev) => [data.item, ...prev]);
      }
      if (data.alertNotifications) {
        setAlertNotifications(data.alertNotifications);
      }
      setGroundingSources(data.sources || []);
      setGroundingQuery('');
    } catch (err: any) {
      setDataError(err.message);
    } finally {
      setGroundingLoading(false);
    }
  };

  const handleRunDeepOptimize = async () => {
    setDeepThinkingLoading(true);
    try {
      const res = await fetch('/api/ai/deep-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metal: selectedMetal,
          grade: selectedGrade === 'All Grades' ? 'SHG' : selectedGrade,
          region: selectedRegion === 'All India' ? 'West' : selectedRegion,
          availableVolumeMt: availVolumeMt,
          recommendedLtcPct: ltcSplitPct,
          recommendedSpotPct: optimizerSimulation.spotPct,
          expectedPremiumUsd: optimizerSimulation.activeBlendedPrem,
          lmePriceUsd: latestPrice.exchangeLme,
          importLandedParityUsd: optimizerSimulation.importCeilingPremiumUsd,
          freightToHubUsd: inlandFreightUsd,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'High thinking optimization failed');
      setDeepThinkingResult(data.analysis);
    } catch (err: any) {
      setDeepThinkingResult(`Optimization notice: ${err.message}`);
    } finally {
      setDeepThinkingLoading(false);
    }
  };

  const handleSaveSimulation = async () => {
    setSavingSim(true);
    try {
      const res = await fetch('/api/simulations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scenarioName: `${selectedMetal} ${
            selectedGrade === 'All Grades' ? 'SHG' : selectedGrade
          } (${ltcSplitPct}/${optimizerSimulation.spotPct} Split)`,
          metal: selectedMetal,
          grade: selectedGrade === 'All Grades' ? 'SHG' : selectedGrade,
          region: selectedRegion,
          availableVolumeMt: availVolumeMt,
          ltcAllocationPct: ltcSplitPct,
          spotAuctionPct: optimizerSimulation.spotPct,
          expectedPremiumUsd: optimizerSimulation.activeBlendedPrem,
          projectedNsrUsdM: optimizerSimulation.activeNsrUsdM,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save simulation');
      setSavedSimulations((prev) => [data, ...prev]);
    } catch (err: any) {
      setDataError(err.message);
    } finally {
      setSavingSim(false);
    }
  };

  const handleAddEximSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingExim(true);
    try {
      const res = await fetch('/api/exim-imports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: new Date().toISOString().slice(0, 10),
          metal: selectedMetal,
          grade: newEximForm.grade,
          hsCode:
            selectedMetal === 'Zinc'
              ? '79011100'
              : selectedMetal === 'Lead'
              ? '78011000'
              : '71069100',
          importerName: newEximForm.importerName,
          customerLocation: newEximForm.customerLocation,
          originCountry: newEximForm.originCountry,
          port: newEximForm.port,
          dutyScheme: newEximForm.dutyScheme,
          volumeMt: Number(newEximForm.volumeMt),
          cifPriceUsd: Number(newEximForm.cifPriceUsd),
          landedCostInr: Number(newEximForm.landedCostInr),
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setEximImports((prev) => [created, ...prev]);
        setShowAddEximModal(false);
        setNewEximForm({ ...newEximForm, importerName: '' });
      }
    } catch (err) {
      console.error('Add EXIM error:', err);
    } finally {
      setSubmittingExim(false);
    }
  };

  // Alert Rule & Notification Handlers
  const handleEvaluateAlertsNow = async () => {
    setEvaluatingAlerts(true);
    try {
      const res = await fetch('/api/alerts/evaluate', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.notifications) {
        setAlertNotifications(data.notifications);
      }
    } catch (err) {
      console.error('Evaluate alerts error:', err);
    } finally {
      setEvaluatingAlerts(false);
    }
  };

  const handleCreateAlertRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingRule(true);
    try {
      const res = await fetch('/api/alerts/rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newRuleForm,
          thresholdValue: Number(newRuleForm.thresholdValue),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.rule) setAlertRules((prev) => [data.rule, ...prev]);
        if (data.notifications) setAlertNotifications(data.notifications);
        setNewRuleForm({ ...newRuleForm, ruleName: '' });
      }
    } catch (err) {
      console.error('Create alert rule error:', err);
    } finally {
      setCreatingRule(false);
    }
  };

  const handleToggleRuleActive = async (rule: AlertRuleRow) => {
    try {
      const res = await fetch(`/api/alerts/rules/${rule.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      if (res.ok) {
        const updated = await res.json();
        setAlertRules((prev) =>
          prev.map((r) => (r.id === rule.id ? updated : r))
        );
      }
    } catch (err) {
      console.error('Toggle rule error:', err);
    }
  };

  const handleDeleteRule = async (id: number) => {
    try {
      const res = await fetch(`/api/alerts/rules/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setAlertRules((prev) => prev.filter((r) => r.id !== id));
      }
    } catch (err) {
      console.error('Delete rule error:', err);
    }
  };

  const handleMarkNotificationRead = async (id: number) => {
    try {
      const res = await fetch(`/api/alerts/notifications/${id}/read`, {
        method: 'PATCH',
      });
      if (res.ok) {
        setAlertNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
      }
    } catch (err) {
      console.error('Mark notification read error:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch('/api/alerts/notifications/read-all', {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.notifications) setAlertNotifications(data.notifications);
      }
    } catch (err) {
      console.error('Mark all read error:', err);
    }
  };

  const handleSendChatMessage = async (
    e?: React.FormEvent,
    presetPrompt?: string
  ) => {
    if (e) e.preventDefault();
    const textToSend = (presetPrompt ?? chatInput).trim();
    if (!textToSend || chatLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: textToSend,
      timestamp: new Date().toTimeString().slice(0, 5),
    };

    const updatedHistory = [...chatMessages, userMsg];
    setChatMessages(updatedHistory);
    if (!presetPrompt) setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedHistory.map((m) => ({ role: m.role, text: m.text })),
          mode: chatMode,
          contextSnapshot: {
            selectedMetal,
            selectedGrade,
            selectedRegion,
            selectedScenario,
            lmePriceUsd: latestPrice.exchangeLme,
            shfePriceCny: latestPrice.exchangeShfe,
            mcxPriceInr: latestPrice.exchangeMcx,
            inrUsdRate: latestPrice.inrUsdRate,
            indiaPhysicalPremiumUsd: latestPrice.physicalPremiumIndia,
            tamMt: tamSamSegmentation.totalTam,
            samMt: tamSamSegmentation.totalSam,
            hzlSharePct: tamSamSegmentation.hzlSamSharePct,
            optimizerLtcPct: ltcSplitPct,
            optimizerProjectedNsrUsdM: optimizerSimulation.activeNsrUsdM,
            unreadAlertsCount,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chat request failed');

      setChatMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: 'model',
          text: data.reply,
          modelUsed: data.model,
          sources: data.sources || [],
          timestamp: new Date().toTimeString().slice(0, 5),
        },
      ]);
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'model',
          text: `Unable to complete analysis: ${err.message}`,
          timestamp: new Date().toTimeString().slice(0, 5),
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Date,Metal,Grade,Importer,Region,Origin,Port,DutyScheme,VolumeMT,CIF_USD,LandedCost_INR',
    ];
    const rows = filteredEximRows.map(
      (r) =>
        `${r.date},${r.metal},${r.grade},"${r.importerName}",${r.customerLocation},${r.originCountry},"${r.port}","${r.dutyScheme}",${r.volumeMt},${r.cifPriceUsd},${r.landedCostInr}`
    );
    const blob = new Blob([headers.concat(rows).join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HZL_MetalSense_${selectedMetal}_EXIM_Parity.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-200 bg-white sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveModule('demand');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display"
        >
          MetalSense AI
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            onClick={() => setActiveModule('demand')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeModule === 'demand'
                ? 'text-slate-900 font-semibold border-amber-600'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Demand Sensing
          </button>
          <button
            onClick={() => setActiveModule('tamsam')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeModule === 'tamsam'
                ? 'text-slate-900 font-semibold border-amber-600'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            TAM & EXIM
          </button>
          <button
            onClick={() => setActiveModule('arbitrage')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeModule === 'arbitrage'
                ? 'text-slate-900 font-semibold border-amber-600'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Exchange Arbitrage
          </button>
          <button
            onClick={() => setActiveModule('optimizer')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeModule === 'optimizer'
                ? 'text-slate-900 font-semibold border-amber-600'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Auction Optimizer
          </button>
          <button
            onClick={() => setActiveModule('alerts')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeModule === 'alerts'
                ? 'text-slate-900 font-semibold border-amber-600'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Alerts & Triggers ({unreadAlertsCount})
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            onClick={() => setChatOpen((prev) => !prev)}
            className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 shadow-xs"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>AI Strategist Desk</span>
          </button>
        </div>
      </header>

      {/* WORKSPACE CONTEXT & LIVE MARKET FEED TICKER BAR */}
      <section className="border-b border-slate-200 bg-white/90 px-6 py-3">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Left: Live Exchange Feed Ticker & Real-Time INR/USD Rate */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-600">
            <span className="font-semibold text-slate-900">
              Hindustan Zinc Limited (HZL)
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-slate-900 font-medium">
              LME {selectedMetal}:{' '}
              {selectedMetal === 'Silver'
                ? `$${latestPrice.exchangeLme.toFixed(2)}/oz`
                : `$${latestPrice.exchangeLme.toLocaleString()}/MT`}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-amber-700 font-medium">
              SHFE: ¥{latestPrice.exchangeShfe.toLocaleString()}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-sky-700 font-medium">
              MCX: ₹{latestPrice.exchangeMcx.toLocaleString()}/kg
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-emerald-700 font-medium">
              Live USD/INR: ₹{latestPrice.inrUsdRate.toFixed(2)}
            </span>
            <span aria-hidden="true">·</span>
            <button
              onClick={handleSyncLiveMarketFeed}
              disabled={syncingLiveFeed}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-[11px] font-medium text-slate-700 flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-3 h-3 text-amber-600 ${
                  syncingLiveFeed ? 'animate-spin' : ''
                }`}
              />
              <span>
                {syncingLiveFeed
                  ? 'Syncing Feed...'
                  : `Sync Live API (${lastFeedSyncTime})`}
              </span>
            </button>
          </div>

          {/* Right: In-App Alert Drawer Trigger */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setShowAlertDrawer(true)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Bell className="w-3.5 h-3.5 text-amber-600" />
              <span>Alerts</span>
              <span className="font-mono tabular-nums text-amber-700 font-bold">
                ({unreadAlertsCount})
              </span>
            </button>
          </div>
        </div>

        {/* Interactive Commodity & Scenario Filter Controls Row */}
        <div className="max-w-[1440px] mx-auto mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          {/* Metal Segmented Selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg">
            {(['Zinc', 'Lead', 'Silver', 'Cadmium'] as MetalType[]).map((metal) => (
              <button
                key={metal}
                onClick={() => setSelectedMetal(metal)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  selectedMetal === metal
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {metal}
              </button>
            ))}
          </div>

          {/* Grade, Region, and Stress Scenario Selectors */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs text-slate-500 whitespace-nowrap">Grade:</span>
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-900 focus:outline-none"
              >
                {GRADES_BY_METAL[selectedMetal].map((g) => (
                  <option key={g} value={g} className="bg-white text-slate-900">
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
              <Globe className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs text-slate-500 whitespace-nowrap">Region:</span>
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-900 focus:outline-none"
              >
                {REGIONS.map((r) => (
                  <option key={r} value={r} className="bg-white text-slate-900">
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-xs text-slate-500 whitespace-nowrap">
                Stress Scenario:
              </span>
              <select
                value={selectedScenario}
                onChange={(e) => setSelectedScenario(e.target.value)}
                className="bg-transparent text-xs font-semibold text-amber-700 focus:outline-none"
              >
                {SCENARIOS.map((sc) => (
                  <option key={sc} value={sc} className="bg-white text-slate-900">
                    {sc}
                  </option>
                ))}
              </select>
            </div>

            {/* Mobile Module Switcher */}
            <div className="flex md:hidden items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
              <select
                value={activeModule}
                onChange={(e) => setActiveModule(e.target.value as ActiveModule)}
                className="bg-transparent text-xs font-semibold text-amber-700 focus:outline-none"
              >
                <option value="demand" className="bg-white">
                  Module A: Demand Sensing
                </option>
                <option value="tamsam" className="bg-white">
                  Module B: TAM & EXIM Parity
                </option>
                <option value="arbitrage" className="bg-white">
                  Module C: Exchange Arbitrage
                </option>
                <option value="optimizer" className="bg-white">
                  Module D: Auction Optimizer
                </option>
                <option value="alerts" className="bg-white">
                  Module E: Alerts & Triggers
                </option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* ERROR ALERT BANNER IF ANY */}
      {dataError && (
        <div className="max-w-[1440px] w-full mx-auto px-6 pt-4">
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center justify-between text-xs text-red-800">
            <span>{dataError}</span>
            <button
              onClick={() => {
                setDataError(null);
                fetchDashboardData();
              }}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-white font-medium whitespace-nowrap shrink-0"
            >
              Dismiss / Retry
            </button>
          </div>
        </div>
      )}

      {/* MAIN WORKSPACE CONTENT */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6 space-y-6">
        {/* =====================================================================
            MODULE A: EXECUTIVE DEMAND SENSING DASHBOARD (MoM FORECAST)
           ===================================================================== */}
        {activeModule === 'demand' && (
          <div className="space-y-6">
            {/* Executive Summary KPI Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                <div className="text-xs text-slate-500">
                  Current Month Realized Off-take ({selectedMetal})
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {demandForecastSeries[5]?.historicalMt?.toLocaleString() || '46,800'}{' '}
                    <span className="text-xs font-normal text-slate-500">MT</span>
                  </span>
                  <span className="text-xs font-mono tabular-nums text-emerald-700 font-semibold flex items-center gap-0.5">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    +6.4% MoM
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {selectedGrade} · {selectedRegion} · FY27 Q3
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                <div className="text-xs text-slate-500">
                  Next Month AI Forecast (95% Confidence)
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono tabular-nums text-amber-700">
                    {demandForecastSeries[6]?.forecastMt?.toLocaleString() || '48,950'}{' '}
                    <span className="text-xs font-normal text-slate-500">MT</span>
                  </span>
                  <span className="text-xs font-mono tabular-nums text-slate-600">
                    ±4.5% Band
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  CI Range: {demandForecastSeries[6]?.ciLower?.toLocaleString()} –{' '}
                  {demandForecastSeries[6]?.ciUpper?.toLocaleString()} MT
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                <div className="text-xs text-slate-500">
                  Realized Domestic Physical Premium
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {selectedMetal === 'Silver'
                      ? `+$${latestPrice.physicalPremiumIndia.toFixed(2)}/oz`
                      : `+$${latestPrice.physicalPremiumIndia}/MT`}
                  </span>
                  <span className="text-xs font-mono tabular-nums text-emerald-700 font-semibold flex items-center gap-0.5">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    +$12/MT vs Q2
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Benchmark: LME Cash + CIF JNPT Parity
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                <div className="text-xs text-slate-500">
                  Active Stress-Test Scenario Regime
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-lg font-bold text-slate-900 truncate">
                    {selectedScenario}
                  </span>
                  <span className="text-xs font-mono tabular-nums text-amber-700 font-semibold">
                    Elasticity 1.04x
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Correlated with LME stocks & PLI off-take
                </div>
              </div>
            </div>

            {/* Low-Latency Gemini Flash-Lite Pulse Bar */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1 max-w-4xl">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-700">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Low-Latency Executive Demand Pulse</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-slate-500 font-normal">
                    gemini-3.1-flash-lite
                  </span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {flashBrief ||
                    `Click "Generate Instant Pulse" for a sub-second AI synthesis of ${selectedMetal} (${selectedGrade}) demand velocity in ${selectedRegion} under the "${selectedScenario}" scenario.`}
                </p>
              </div>
              <button
                onClick={handleRunFlashBrief}
                disabled={flashLoading}
                className="px-4 py-2 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
              >
                <Zap className="w-3.5 h-3.5 text-amber-600" />
                <span>
                  {flashLoading ? 'Synthesizing Pulse...' : 'Generate Instant Pulse'}
                </span>
              </button>
            </div>

            {/* Time-Series Chart: Historical Demand vs 1-to-6 Month AI Forecast with Confidence Intervals */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    01. Historical Demand vs. 1-to-6 Month AI Econometric Forecast
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Monthly Domestic Volume (MT) for {selectedMetal} ({selectedGrade}) ·{' '}
                    {selectedRegion} · Shaded 95% Prediction Confidence Band
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-600 font-mono tabular-nums">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-sky-600 inline-block" /> Historical ERP
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-amber-600 inline-block" /> AI 6M Forecast
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-2.5 bg-amber-500/15 border border-amber-500/40 inline-block" />{' '}
                    95% CI Band
                  </span>
                </div>
              </div>

              <div className="h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={demandForecastSeries}
                    margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis
                      dataKey="period"
                      stroke="#94A3B8"
                      tick={{ fill: '#475569', fontSize: 11 }}
                    />
                    <YAxis
                      stroke="#94A3B8"
                      tick={{ fill: '#475569', fontSize: 11 }}
                      tickFormatter={(v) => `${v.toLocaleString()}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E2E8F0',
                        color: '#0F172A',
                        borderRadius: '8px',
                        fontSize: '12px',
                        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="ciUpper"
                      stroke="none"
                      fill="#F59E0B"
                      fillOpacity={0.16}
                      name="Upper 95% CI (MT)"
                    />
                    <Area
                      type="monotone"
                      dataKey="ciLower"
                      stroke="none"
                      fill="#FFFFFF"
                      fillOpacity={0.95}
                      name="Lower 95% CI (MT)"
                    />
                    <Line
                      type="monotone"
                      dataKey="historicalMt"
                      stroke="#0284C7"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: '#0284C7' }}
                      name="Historical Realized (MT)"
                    />
                    <Line
                      type="monotone"
                      dataKey="forecastMt"
                      stroke="#D97706"
                      strokeWidth={2.5}
                      strokeDasharray="5 5"
                      dot={{ r: 4, fill: '#D97706' }}
                      name="AI Forecasted Demand (MT)"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Macro Driver Impact Cards */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">
                  02. Indian Downstream Sector & PLI Macro Demand Drivers ({selectedMetal})
                </h2>
                <span className="text-xs text-slate-500">
                  Weighted by FY27 Domestic Sector Consumption Share
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {macroDrivers.map((driver, index) => (
                  <div
                    key={index}
                    className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                        <span>Share: {driver.weightPct}</span>
                        <span
                          className={`font-mono tabular-nums font-semibold flex items-center gap-0.5 ${
                            driver.positive ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {driver.positive ? (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5" />
                          )}
                          {driver.momDelta}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 leading-snug">
                        {driver.sector}
                      </h3>
                      <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                        {driver.summary}
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
                      Policy Catalyst ·{' '}
                      <span className="text-slate-800 font-medium">{driver.schemeRef}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Customer-Level Internal ERP Sales Ledger */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    03. Internal ERP Customer Sales & Realized Premium Ledger ({selectedRegion})
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Showing {filteredInternalSales.length} delivery tranches from PostgreSQL{' '}
                    <span className="font-mono text-slate-700">internal_sales</span>
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2.5 px-3">Delivery Date · ID</th>
                      <th className="py-2.5 px-3">Customer Account</th>
                      <th className="py-2.5 px-3">Downstream Segment</th>
                      <th className="py-2.5 px-3">Region · Grade</th>
                      <th className="py-2.5 px-3">Channel</th>
                      <th className="py-2.5 px-3 text-right">Volume (MT)</th>
                      <th className="py-2.5 px-3 text-right">Realized Premium</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInternalSales.slice(0, 10).map((sale) => (
                      <tr key={sale.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono tabular-nums text-slate-500">
                          {sale.date} · {sale.customerId}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">
                          {sale.customerName}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {sale.customerSegment}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {sale.region} · {sale.grade}
                        </td>
                        <td className="py-2.5 px-3 text-amber-700 font-medium">
                          {sale.saleTypeLtcOrAuction}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 font-semibold">
                          {sale.volumeMt.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                          +${sale.realizedPremiumUsd}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            MODULE B: TAM & SAM MARKET SEGMENTATION ENGINE
           ===================================================================== */}
        {activeModule === 'tamsam' && (
          <div className="space-y-6">
            {/* TAM / SAM Summary Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                <div className="text-xs text-slate-500">
                  Total Addressable Market (Monthly TAM)
                </div>
                <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {tamSamSegmentation.totalTam.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-slate-500">MT/mo</span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  HZL Sales + EXIM Imports + Secondary Scrap
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                <div className="text-xs text-slate-500">
                  Serviceable Addressable Market (Monthly SAM)
                </div>
                <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-amber-700">
                  {tamSamSegmentation.totalSam.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-slate-500">MT/mo</span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Primary Grade Requirement ({selectedGrade})
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                <div className="text-xs text-slate-500">
                  HZL Domestic SAM Capture Share
                </div>
                <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-700">
                  {tamSamSegmentation.hzlSamSharePct}%
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Active Domestic Run-Rate: {tamSamSegmentation.totalHzl.toLocaleString()}{' '}
                  MT
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                <div className="text-xs text-slate-500">
                  EXIM Import Substitution Target
                </div>
                <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-sky-700">
                  {tamSamSegmentation.totalImports.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-slate-500">MT/mo</span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Trackable via Bill of Lading Customs Data
                </div>
              </div>
            </div>

            {/* Stacked Regional TAM/SAM Consumption Breakdown Chart */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    01. Domestic Consumption Decomposition (TAM = HZL + EXIM Imports + Secondary Scrap)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Regional segmentation for {selectedMetal} ({selectedGrade}) · Scope:{' '}
                    {selectedRegion}
                  </p>
                </div>
                <div className="text-xs text-slate-500 font-mono tabular-nums">
                  Unit: Metric Tonnes (MT / Month)
                </div>
              </div>

              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={tamSamSegmentation.chartData}
                    margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis
                      dataKey="region"
                      stroke="#94A3B8"
                      tick={{ fill: '#475569', fontSize: 12 }}
                    />
                    <YAxis
                      stroke="#94A3B8"
                      tick={{ fill: '#475569', fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E2E8F0',
                        color: '#0F172A',
                        borderRadius: '8px',
                        fontSize: '12px',
                        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar
                      dataKey="hzlDomesticSales"
                      stackId="tam"
                      fill="#D97706"
                      name="HZL Domestic Sales (MT)"
                    />
                    <Bar
                      dataKey="eximImports"
                      stackId="tam"
                      fill="#0284C7"
                      name="EXIM Imports — Bill of Lading (MT)"
                    />
                    <Bar
                      dataKey="secondaryScrap"
                      stackId="tam"
                      fill="#94A3B8"
                      name="Domestic Competitors / Secondary Scrap (MT)"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* VISUAL SUMMARY: 3-Month Moving Average EXIM Import Volume vs. HZL Realized Domestic Premium */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    02. 3-Month Moving Average (3M MA) EXIM Import Volume vs. HZL Realized Domestic Premium
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Multi-month correlation tracking how rolling EXIM import inflows ({selectedMetal} · {selectedGrade} · {selectedRegion}) impact HZL realized physical premiums
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums text-slate-600">
                  <span>
                    Pearson r:{' '}
                    <strong
                      className={
                        eximMovingAverageCorrelation.pearsonR < 0
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }
                    >
                      {eximMovingAverageCorrelation.pearsonR > 0
                        ? `+${eximMovingAverageCorrelation.pearsonR}`
                        : eximMovingAverageCorrelation.pearsonR}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Latest 3M MA:{' '}
                    <strong className="text-sky-700">
                      {eximMovingAverageCorrelation.latest3mMaMt.toLocaleString()} MT
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    HZL Realized Prem:{' '}
                    <strong className="text-amber-700">
                      {selectedMetal === 'Silver'
                        ? `+$${eximMovingAverageCorrelation.latestRealizedPremUsd}/oz`
                        : `+$${eximMovingAverageCorrelation.latestRealizedPremUsd}/MT`}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Correlation Diagnostic Summary Strip */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <div className="text-xs text-slate-500">
                    Rolling 3-Month Avg Import Inflow (3M MA)
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between">
                    <span className="text-xl font-bold font-mono tabular-nums text-sky-700">
                      {eximMovingAverageCorrelation.latest3mMaMt.toLocaleString()} MT
                    </span>
                    <span
                      className={`text-xs font-mono tabular-nums font-semibold ${
                        eximMovingAverageCorrelation.maMomChangePct <= 0
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {eximMovingAverageCorrelation.maMomChangePct > 0
                        ? `+${eximMovingAverageCorrelation.maMomChangePct}% MoM`
                        : `${eximMovingAverageCorrelation.maMomChangePct}% MoM`}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Smoothed quarterly customs discharge velocity
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <div className="text-xs text-slate-500">
                    Volume-Weighted HZL Realized Premium
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between">
                    <span className="text-xl font-bold font-mono tabular-nums text-amber-700">
                      {selectedMetal === 'Silver'
                        ? `+$${eximMovingAverageCorrelation.latestRealizedPremUsd}/oz`
                        : `+$${eximMovingAverageCorrelation.latestRealizedPremUsd}/MT`}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-emerald-700 font-semibold">
                      ERP Realized
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Blended across LTC & Spot Auction deliveries
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <div className="text-xs text-slate-500">
                    Econometric Correlation Pattern (r = {eximMovingAverageCorrelation.pearsonR})
                  </div>
                  <div className="mt-1.5 text-xs font-semibold text-slate-900 leading-snug">
                    {eximMovingAverageCorrelation.correlationRegime}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    July monsoon import spike compressed premium; Q3 tightening restored pricing power
                  </div>
                </div>
              </div>

              {/* Dual-Axis Composed Chart: 3M MA EXIM Volume (Left Axis) vs HZL Realized Premium (Right Axis) */}
              <div className="h-[330px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={eximMovingAverageCorrelation.series}
                    margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis
                      dataKey="label"
                      stroke="#94A3B8"
                      tick={{ fill: '#475569', fontSize: 12 }}
                    />
                    <YAxis
                      yAxisId="left"
                      stroke="#0284C7"
                      tick={{ fill: '#0369A1', fontSize: 11 }}
                      tickFormatter={(v) => `${v.toLocaleString()} MT`}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#D97706"
                      tick={{ fill: '#B45309', fontSize: 11 }}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E2E8F0',
                        color: '#0F172A',
                        borderRadius: '8px',
                        fontSize: '12px',
                        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar
                      yAxisId="left"
                      dataKey="monthlyEximMt"
                      fill="#E2E8F0"
                      stroke="#94A3B8"
                      name="Monthly EXIM Import Volume (MT)"
                    />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="exim3mMaMt"
                      stroke="#0284C7"
                      strokeWidth={2.5}
                      fill="#0284C7"
                      fillOpacity={0.12}
                      dot={{ r: 4, fill: '#0284C7' }}
                      name="3-Month Moving Avg (3M MA) EXIM Volume (MT)"
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="hzlRealizedPremiumUsd"
                      stroke="#D97706"
                      strokeWidth={3}
                      dot={{ r: 5, fill: '#D97706' }}
                      name={
                        selectedMetal === 'Silver'
                          ? 'HZL Realized Domestic Premium ($/oz)'
                          : 'HZL Realized Domestic Premium ($/MT)'
                      }
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Importing Customers & Landed Cost Parity Table */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    03. EXIM Bill of Lading Intelligence & Landed Cost Parity Ledger
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Real-time comparison of imported consignments vs. HZL Domestic Landed Parity (₹/MT) using live INR/USD rate (₹{latestPrice.inrUsdRate.toFixed(2)})
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={eximSearch}
                      onChange={(e) => setEximSearch(e.target.value)}
                      placeholder="Search importer, origin, port..."
                      className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-600"
                    />
                  </div>

                  <select
                    value={dutyFilter}
                    onChange={(e) => setDutyFilter(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none"
                  >
                    <option value="All Schemes">All Duty Regimes</option>
                    <option value="CEPA">FTA / CEPA (0% / Concessional)</option>
                    <option value="Advance Authorization">Advance Authorization</option>
                    <option value="Standard BCD">Standard BCD</option>
                  </select>

                  <button
                    onClick={handleExportCsv}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download CSV</span>
                  </button>

                  <button
                    onClick={() => setShowAddEximModal(true)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Log EXIM Shipment</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                      <th className="py-3 px-3">Date · HS Code</th>
                      <th className="py-3 px-3">Importing Customer</th>
                      <th className="py-3 px-3">Grade · Hub</th>
                      <th className="py-3 px-3">Origin · Discharge Port</th>
                      <th className="py-3 px-3">Duty Benefit Scheme</th>
                      <th className="py-3 px-3 text-right">Volume (MT)</th>
                      <th className="py-3 px-3 text-right">CIF ($/MT)</th>
                      <th className="py-3 px-3 text-right">Import Landed (₹/MT)</th>
                      <th className="py-3 px-3 text-right">vs. HZL Parity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredEximRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-500">
                          No EXIM consignments match your current filter criteria. Click "Log EXIM Shipment" to add a Bill of Lading record.
                        </td>
                      </tr>
                    ) : (
                      filteredEximRows.map((row) => {
                        const importCheaper = row.parityGapInr < 0;
                        return (
                          <tr
                            key={row.id}
                            className="hover:bg-slate-50 transition-colors"
                          >
                            <td className="py-3 px-3 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                              {row.date} · {row.hsCode}
                            </td>
                            <td className="py-3 px-3 font-medium text-slate-900">
                              {row.importerName}
                            </td>
                            <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                              {row.grade} · {row.customerLocation}
                            </td>
                            <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                              {row.originCountry} · {row.port}
                            </td>
                            <td className="py-3 px-3 text-slate-600">
                              {row.dutyScheme}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900 font-semibold">
                              {row.volumeMt.toLocaleString()}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600">
                              ${row.cifPriceUsd.toLocaleString()}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900">
                              ₹{row.landedCostInr.toLocaleString()}
                            </td>
                            <td
                              className={`py-3 px-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                                importCheaper ? 'text-red-600' : 'text-emerald-700'
                              }`}
                            >
                              {importCheaper
                                ? `Import -₹${Math.abs(row.parityGapInr).toLocaleString()} (Threat)`
                                : `HZL +₹${row.parityGapInr.toLocaleString()} (Adv)`}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            MODULE C: GLOBAL INTELLIGENCE & EXCHANGE ARBITRAGE TRACKER
           ===================================================================== */}
        {activeModule === 'arbitrage' && (
          <div className="space-y-6">
            {/* Live Market Feed Status & Control Banner */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="font-semibold text-slate-900">
                  Real-Time Exchange & FX Data Feed:
                </span>
                <span className="font-mono text-amber-700 font-medium">{liveFeedSource}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-700">
                  USD/INR: ₹{latestPrice.inrUsdRate.toFixed(2)}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-700">
                  USD/CNY: ¥{liveCnyRate.toFixed(3)}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-500">
                  Last DB Update ({marketPrices.length} rows): {lastFeedSyncTime}
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setAutoSyncEnabled((prev) => !prev)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    autoSyncEnabled
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  {autoSyncEnabled ? 'Auto-Sync (30s): ON' : 'Auto-Sync (30s): OFF'}
                </button>
                <button
                  onClick={handleSyncLiveMarketFeed}
                  disabled={syncingLiveFeed}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${syncingLiveFeed ? 'animate-spin' : ''}`}
                  />
                  <span>
                    {syncingLiveFeed
                      ? 'Updating market_prices...'
                      : 'Fetch Live Quotes & Update DB'}
                  </span>
                </button>
              </div>
            </div>

            {/* Multi-Exchange Live Parity Ticker Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                <div className="text-xs text-slate-500">
                  LME Official Cash Settlement ({selectedMetal})
                </div>
                <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {selectedMetal === 'Silver'
                    ? `$${arbitrageMetrics.lme.toFixed(2)}/oz`
                    : `$${arbitrageMetrics.lme.toLocaleString()}/MT`}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  CME COMEX: ${arbitrageMetrics.cme.toLocaleString()} · 3M Contango +$14
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                <div className="text-xs text-slate-500">
                  SHFE Front-Month & SHFE/LME Ratio
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono tabular-nums text-amber-700">
                    ¥{arbitrageMetrics.shfe.toLocaleString()}
                  </span>
                  <span className="text-xs font-mono tabular-nums text-slate-600">
                    Ratio: {arbitrageMetrics.shfeLmeRatio}x
                  </span>
                </div>
                <div className="mt-2 text-xs text-emerald-700 font-medium">
                  {arbitrageMetrics.arbWindowStatus}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                <div className="text-xs text-slate-500">
                  MCX India Spot & Futures Parity
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                    ₹{arbitrageMetrics.mcx.toLocaleString()}
                    <span className="text-xs font-normal text-slate-500">/kg</span>
                  </span>
                  <span className="text-xs font-mono tabular-nums text-sky-700 font-semibold">
                    FX ₹{arbitrageMetrics.fxInr}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  HZL Domestic Parity: ₹
                  {arbitrageMetrics.hzlDomesticInrPerMt.toLocaleString()}/MT
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                <div className="text-xs text-slate-500">
                  Import Landed Parity vs. HZL Domestic
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                    ₹{arbitrageMetrics.landedImportInrPerMt.toLocaleString()}
                  </span>
                  <span
                    className={`text-xs font-mono tabular-nums font-semibold ${
                      arbitrageMetrics.importMarginInr >= 0
                        ? 'text-emerald-700'
                        : 'text-red-600'
                    }`}
                  >
                    {arbitrageMetrics.importMarginInr >= 0
                      ? `+₹${arbitrageMetrics.importMarginInr.toLocaleString()} Buffer`
                      : `-₹${Math.abs(
                          arbitrageMetrics.importMarginInr
                        ).toLocaleString()} Deficit`}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Effective Duty (BCD+SWS): {arbitrageMetrics.effectiveDutyPct}%
                </div>
              </div>
            </div>

            {/* Interactive Parity Calculator & Historical Exchange Spread Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Left 5 Cols: Interactive Import Landed Parity Calculator */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 shadow-2xs flex flex-col justify-between space-y-5">
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-amber-600" />
                      <span>Import Parity & Tariff Simulator</span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Simulate landed cost of foreign {selectedMetal} at JNPT/Mundra vs. HZL Ex-Smelter pricing
                    </p>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-700">
                          Ocean Freight & Marine Insurance ($/MT)
                        </span>
                        <span className="font-mono tabular-nums text-amber-700 font-semibold">
                          ${customOceanFreight}/MT
                        </span>
                      </div>
                      <input
                        type="range"
                        min={15}
                        max={110}
                        value={customOceanFreight}
                        onChange={(e) => setCustomOceanFreight(Number(e.target.value))}
                        className="w-full accent-amber-600"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-700">
                          Basic Customs Duty — BCD (%)
                        </span>
                        <span className="font-mono tabular-nums text-amber-700 font-semibold">
                          {useCepaZeroDuty
                            ? '0.0% (FTA/CEPA)'
                            : `${customBcdPct.toFixed(1)}%`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={0.5}
                        disabled={useCepaZeroDuty}
                        value={customBcdPct}
                        onChange={(e) => setCustomBcdPct(Number(e.target.value))}
                        className="w-full accent-amber-600"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-700">
                          Port Handling, CHA & CFS Charges ($/MT)
                        </span>
                        <span className="font-mono tabular-nums text-amber-700 font-semibold">
                          ${customPortHandling}/MT
                        </span>
                      </div>
                      <input
                        type="range"
                        min={8}
                        max={50}
                        value={customPortHandling}
                        onChange={(e) => setCustomPortHandling(Number(e.target.value))}
                        className="w-full accent-amber-600"
                      />
                    </div>

                    <div className="pt-2 flex items-center justify-between">
                      <span className="text-xs text-slate-700">
                        Apply Korea-India CEPA / Advance Auth (0% Duty)
                      </span>
                      <button
                        onClick={() => setUseCepaZeroDuty((prev) => !prev)}
                        className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                          useCepaZeroDuty
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {useCepaZeroDuty ? 'CEPA 0% Active' : 'Standard Tariff'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Simulated Import Landed Cost ($/MT):</span>
                    <span className="font-mono tabular-nums text-slate-900 font-semibold">
                      ${arbitrageMetrics.landedImportUsd.toLocaleString()}/MT
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Simulated Import Landed Cost (₹/MT):</span>
                    <span className="font-mono tabular-nums text-slate-900 font-semibold">
                      ₹{arbitrageMetrics.landedImportInrPerMt.toLocaleString()}/MT
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-700 pt-1">
                    <span>Arbitrage Signal for HZL Commercial Desk:</span>
                    <span
                      className={`font-semibold ${
                        arbitrageMetrics.importMarginInr >= 0
                          ? 'text-emerald-700'
                          : 'text-red-600'
                      }`}
                    >
                      {arbitrageMetrics.importMarginInr >= 0
                        ? 'Raise Physical Premium Floor'
                        : 'Defend Western Port Accounts'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right 7 Cols: Multi-Exchange Trajectory & Physical Premium Chart */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 shadow-2xs flex flex-col justify-between">
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-slate-900">
                    LME Benchmark vs. India Physical Premium Trajectory ({selectedMetal})
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Dynamically updated from <span className="font-mono text-slate-700">market_prices</span> table including live feed sync rows
                  </p>
                </div>

                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={metalPrices}
                      margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis
                        dataKey="date"
                        stroke="#94A3B8"
                        tick={{ fill: '#475569', fontSize: 11 }}
                      />
                      <YAxis
                        yAxisId="left"
                        stroke="#0284C7"
                        tick={{ fill: '#0369A1', fontSize: 11 }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#D97706"
                        tick={{ fill: '#B45309', fontSize: 11 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#FFFFFF',
                          borderColor: '#E2E8F0',
                          color: '#0F172A',
                          borderRadius: '8px',
                          fontSize: '12px',
                          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="exchangeLme"
                        stroke="#0284C7"
                        strokeWidth={2.5}
                        name="LME Cash Price ($)"
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="physicalPremiumIndia"
                        stroke="#D97706"
                        strokeWidth={2.5}
                        name="India Physical Premium ($)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* AI News & Policy Feed with Live Google Search Grounding (gemini-3.8-flash) */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    02. AI Market Intelligence & Policy Feed (Google Search Grounded)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Powered by{' '}
                    <span className="font-mono text-slate-700">gemini-3.8-flash</span> +{' '}
                    <span className="font-mono text-slate-700">googleSearch</span> · Vector-indexed in PostgreSQL{' '}
                    <span className="font-mono text-slate-700">market_intelligence</span>
                  </p>
                </div>

                {/* Live Search Grounding Input & Trigger */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={groundingQuery}
                    onChange={(e) => setGroundingQuery(e.target.value)}
                    placeholder={`Search live ${selectedMetal} LME / DGFT / SHFE news...`}
                    className="w-64 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-600"
                  />
                  <button
                    onClick={handleRunGroundingScan}
                    disabled={groundingLoading}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${groundingLoading ? 'animate-spin' : ''}`}
                    />
                    <span>
                      {groundingLoading
                        ? 'Scanning Web via Google Search...'
                        : 'Scan Live Web (Google Search)'}
                    </span>
                  </button>
                </div>
              </div>

              {groundingSources.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
                  <div className="text-xs font-semibold text-amber-800">
                    Verified Google Search Grounding Citations:
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    {groundingSources.map((src, i) => (
                      <a
                        key={i}
                        href={src.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-700 hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span className="truncate max-w-[260px]">{src.title}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Sentiment Filter Tabs */}
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                {['All', 'Bullish', 'Bearish', 'Neutral'].map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setSentimentFilter(tag)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      sentimentFilter === tag
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900 bg-slate-100'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              {/* Intelligence Items List */}
              <div className="divide-y divide-slate-200">
                {marketIntelligence
                  .filter(
                    (item) =>
                      sentimentFilter === 'All' || item.sentimentTag === sentimentFilter
                  )
                  .map((item) => {
                    const isBullish = item.sentimentTag === 'Bullish';
                    const isBearish = item.sentimentTag === 'Bearish';
                    return (
                      <div key={item.id} className="py-4 first:pt-1 last:pb-1 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`font-semibold flex items-center gap-1 ${
                                isBullish
                                  ? 'text-emerald-700'
                                  : isBearish
                                  ? 'text-red-600'
                                  : 'text-amber-700'
                              }`}
                            >
                              {isBullish ? (
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              ) : isBearish ? (
                                <ArrowDownRight className="w-3.5 h-3.5" />
                              ) : null}
                              {item.sentimentTag} for India Premium
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-800 font-semibold">
                              {item.affectedMetal}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{item.category}</span>
                            <span aria-hidden="true">·</span>
                            <span>{item.source}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{item.timestamp}</span>
                          </div>

                          <div className="font-mono tabular-nums text-xs">
                            Impact Score:{' '}
                            <span
                              className={`font-bold ${
                                item.impactScore >= 0 ? 'text-emerald-700' : 'text-red-600'
                              }`}
                            >
                              {item.impactScore >= 0
                                ? `+${item.impactScore.toFixed(1)}`
                                : item.impactScore.toFixed(1)}{' '}
                              / 10
                            </span>
                          </div>
                        </div>

                        <h3 className="text-sm font-bold text-slate-900">{item.headline}</h3>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {item.summary}
                        </p>
                        <div className="text-[11px] font-mono tabular-nums text-slate-400">
                          pgvector embedding preview: {item.embedding}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            MODULE D: COMMERCIAL PREMIUM & AUCTION ALLOCATION OPTIMIZER
           ===================================================================== */}
        {activeModule === 'optimizer' && (
          <div className="space-y-6">
            {/* Optimizer Output KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                <div className="text-xs text-slate-500">
                  Simulated LTC / Spot Auction Split
                </div>
                <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {ltcSplitPct}% LTC{' '}
                  <span className="text-slate-400 font-normal">/</span>{' '}
                  <span className="text-amber-700">{optimizerSimulation.spotPct}% Spot</span>
                </div>
                <div className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
                  LTC: {optimizerSimulation.ltcVolumeMt.toLocaleString()} MT · Spot:{' '}
                  {optimizerSimulation.spotVolumeMt.toLocaleString()} MT
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                <div className="text-xs text-slate-500">
                  Predicted Blended Physical Premium
                </div>
                <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-700">
                  {selectedMetal === 'Silver'
                    ? `+$${optimizerSimulation.activeBlendedPrem}/oz`
                    : `+$${optimizerSimulation.activeBlendedPrem}/MT`}
                </div>
                <div className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
                  Import Parity Ceiling: +${optimizerSimulation.importCeilingPremiumUsd}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                <div className="text-xs text-slate-500">
                  Projected Monthly Net Sales Realization (NSR)
                </div>
                <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                  ${optimizerSimulation.activeNsrUsdM.toLocaleString()}M
                </div>
                <div className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
                  INR Equivalent: ₹{optimizerSimulation.activeNsrInrCr.toLocaleString()} Cr
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                <div className="text-xs text-slate-500">
                  Econometric NSR-Maximizing Split
                </div>
                <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-amber-700">
                  {optimizerSimulation.optimalPoint.ltcPct}% /{' '}
                  {optimizerSimulation.optimalPoint.spotPct}%
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Peak NSR: ${optimizerSimulation.optimalPoint.totalNsrUsdM}M at +$
                  {optimizerSimulation.optimalPoint.blendedPremium}
                </div>
              </div>
            </div>

            {/* Simulator Sliders + NSR Optimization Curve */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 shadow-2xs flex flex-col justify-between space-y-5">
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-amber-600" />
                      <span>Monthly Smelter Allocation Controls</span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Calibrate {selectedMetal} ({selectedGrade}) production volume and LTC vs. Spot Auction tranche mix
                    </p>
                  </div>

                  <div className="space-y-4 pt-2">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-700">
                          Available Monthly Production Volume (MT)
                        </span>
                        <span className="font-mono tabular-nums text-amber-700 font-semibold">
                          {availVolumeMt.toLocaleString()} MT
                        </span>
                      </div>
                      <input
                        type="range"
                        min={selectedMetal === 'Silver' ? 20 : 1000}
                        max={
                          selectedMetal === 'Zinc'
                            ? 65000
                            : selectedMetal === 'Lead'
                            ? 28000
                            : 500
                        }
                        step={selectedMetal === 'Silver' ? 2 : 500}
                        value={availVolumeMt}
                        onChange={(e) => setAvailVolumeMt(Number(e.target.value))}
                        className="w-full accent-amber-600"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-700">
                          Long-Term Contractual (LTC) Allocation (%)
                        </span>
                        <span className="font-mono tabular-nums text-amber-700 font-semibold">
                          {ltcSplitPct}% LTC · {100 - ltcSplitPct}% Spot Auction
                        </span>
                      </div>
                      <input
                        type="range"
                        min={20}
                        max={95}
                        step={1}
                        value={ltcSplitPct}
                        onChange={(e) => setLtcSplitPct(Number(e.target.value))}
                        className="w-full accent-amber-600"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-700">
                          Inland Logistics Freight (Smelter to {selectedRegion} Depot)
                        </span>
                        <span className="font-mono tabular-nums text-slate-900 font-semibold">
                          ${inlandFreightUsd}/MT
                        </span>
                      </div>
                      <input
                        type="range"
                        min={8}
                        max={60}
                        value={inlandFreightUsd}
                        onChange={(e) => setInlandFreightUsd(Number(e.target.value))}
                        className="w-full accent-amber-600"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-700">
                          Secondary / Korean CEPA Competitor Discount ($/MT)
                        </span>
                        <span className="font-mono tabular-nums text-slate-900 font-semibold">
                          -${competitorDiscountUsd}/MT
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={35}
                        value={competitorDiscountUsd}
                        onChange={(e) =>
                          setCompetitorDiscountUsd(Number(e.target.value))
                        }
                        className="w-full accent-amber-600"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <button
                    onClick={() =>
                      setLtcSplitPct(optimizerSimulation.optimalPoint.ltcPct)
                    }
                    className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    Apply Optimal Split ({optimizerSimulation.optimalPoint.ltcPct}/
                    {optimizerSimulation.optimalPoint.spotPct})
                  </button>

                  <button
                    onClick={handleSaveSimulation}
                    disabled={savingSim}
                    className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    {savingSim ? 'Saving to PostgreSQL...' : 'Commit Allocation to DB'}
                  </button>
                </div>
              </div>

              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 shadow-2xs flex flex-col justify-between">
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-slate-900">
                    Physical Premium ($/MT) & Net Sales Realization Curve by LTC/Spot Split
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Models auction scarcity boost vs. spot flooding discount across LTC allocation ratios
                  </p>
                </div>

                <div className="h-[290px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={optimizerSimulation.curve}
                      margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis
                        dataKey="splitLabel"
                        stroke="#94A3B8"
                        tick={{ fill: '#475569', fontSize: 11 }}
                      />
                      <YAxis
                        yAxisId="left"
                        stroke="#0284C7"
                        tick={{ fill: '#0369A1', fontSize: 11 }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#D97706"
                        tick={{ fill: '#B45309', fontSize: 11 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#FFFFFF',
                          borderColor: '#E2E8F0',
                          color: '#0F172A',
                          borderRadius: '8px',
                          fontSize: '12px',
                          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar
                        yAxisId="right"
                        dataKey="totalNsrUsdM"
                        fill="#E2E8F0"
                        stroke="#94A3B8"
                        name="Projected Monthly NSR ($M)"
                      />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="blendedPremium"
                        stroke="#D97706"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: '#D97706' }}
                        name="Blended Physical Premium ($)"
                      />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="spotRealizedPrem"
                        stroke="#0284C7"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={{ r: 3, fill: '#0284C7' }}
                        name="Spot Auction Clearing Premium ($)"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Deep Econometric Optimization Panel (gemini-4-argon with ThinkingLevel.HIGH) */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-700">
                    <BrainCircuit className="w-4 h-4" />
                    <span>High Thinking Mode Econometric Engine</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-slate-500 font-normal">
                      gemini-4-argon (ThinkingLevel.HIGH)
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 mt-1">
                    02. Game-Theoretic Auction Reserve & Contract Allocation Strategy
                  </h2>
                </div>

                <button
                  onClick={handleRunDeepOptimize}
                  disabled={deepThinkingLoading}
                  className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
                >
                  <BrainCircuit className="w-4 h-4" />
                  <span>
                    {deepThinkingLoading
                      ? 'Running High-Thinking Econometric Model...'
                      : 'Run Deep Thinking Optimization'}
                  </span>
                </button>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                {deepThinkingResult ||
                  `Click "Run Deep Thinking Optimization" to invoke gemini-4-argon with ThinkingLevel.HIGH. The model will evaluate ${selectedMetal} (${selectedGrade}) price elasticity across Indian Tier-1 steel/battery buyers, duty-free CEPA landed cost ceilings, and weekly spot auction reserve pricing for ${availVolumeMt.toLocaleString()} MT.`}
              </div>
            </div>

            {/* Saved Simulations Ledger if any */}
            {savedSimulations.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-3">
                <h3 className="text-sm font-bold text-slate-900">
                  03. Committed Smelter Allocation Scenarios (PostgreSQL{' '}
                  <span className="font-mono text-xs text-slate-600">saved_simulations</span>)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 px-3">Scenario Name</th>
                        <th className="py-2 px-3">Metal · Grade · Region</th>
                        <th className="py-2 px-3 text-right">Volume (MT)</th>
                        <th className="py-2 px-3 text-right">LTC / Spot Split</th>
                        <th className="py-2 px-3 text-right">Blended Premium</th>
                        <th className="py-2 px-3 text-right">Projected NSR ($M)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {savedSimulations.map((sim) => (
                        <tr key={sim.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-medium text-slate-900">
                            {sim.scenarioName}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {sim.metal} · {sim.grade} · {sim.region}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                            {sim.availableVolumeMt.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-700 font-semibold">
                            {sim.ltcAllocationPct}% / {sim.spotAuctionPct}%
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                            +${sim.expectedPremiumUsd}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 font-bold">
                            ${sim.projectedNsrUsdM}M
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            MODULE E: INTELLIGENT ALERTING & NOTIFICATION ENGINE
           ===================================================================== */}
        {activeModule === 'alerts' && (
          <div className="space-y-6">
            {/* Alerting Engine Summary KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                <div className="text-xs text-slate-500">
                  Active Automated Monitoring Rules
                </div>
                <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {alertRules.filter((r) => r.isActive).length}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    / {alertRules.length} Rules
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Parity · LME/SHFE · Forecast · News
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                <div className="text-xs text-slate-500">
                  Unread In-App & Email Alerts
                </div>
                <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-amber-700">
                  {unreadAlertsCount}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  All India Commercial Desk Coverage
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
                <div className="text-xs text-slate-500">
                  Critical Import Parity Breaches
                </div>
                <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-red-600">
                  {
                    alertNotifications.filter(
                      (n) => n.severity === 'Critical'
                    ).length
                  }
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Immediate commercial defense action required
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs flex flex-col justify-between">
                <div className="text-xs text-slate-500">
                  Live Metric Rule Evaluation
                </div>
                <button
                  onClick={handleEvaluateAlertsNow}
                  disabled={evaluatingAlerts}
                  className="mt-2 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${evaluatingAlerts ? 'animate-spin' : ''}`}
                  />
                  <span>
                    {evaluatingAlerts
                      ? 'Evaluating Metrics...'
                      : 'Evaluate All Thresholds Now'}
                  </span>
                </button>
              </div>
            </div>

            {/* Two-Column Split: Custom Rule Creator + Active Rules Table */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Left 5 Cols: Configure Custom Alert Rule */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    01. Configure Custom Alert Rule
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Set automated triggers by metal, region, metric type, and severity with In-App + Email delivery
                  </p>
                </div>

                <form onSubmit={handleCreateAlertRule} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">
                      Alert Rule Name
                    </label>
                    <input
                      type="text"
                      required
                      value={newRuleForm.ruleName}
                      onChange={(e) =>
                        setNewRuleForm({ ...newRuleForm, ruleName: e.target.value })
                      }
                      placeholder="e.g., Mundra Port CEPA SHG Zinc Parity Breach"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-amber-600"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 font-medium mb-1">Metal</label>
                      <select
                        value={newRuleForm.metal}
                        onChange={(e) =>
                          setNewRuleForm({ ...newRuleForm, metal: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                      >
                        <option value="Zinc">Zinc</option>
                        <option value="Lead">Lead</option>
                        <option value="Silver">Silver</option>
                        <option value="Cadmium">Cadmium</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-medium mb-1">Region</label>
                      <select
                        value={newRuleForm.region}
                        onChange={(e) =>
                          setNewRuleForm({ ...newRuleForm, region: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                      >
                        <option value="All India">All India</option>
                        <option value="West">West</option>
                        <option value="East">East</option>
                        <option value="North">North</option>
                        <option value="South">South</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 font-medium mb-1">
                        Monitored Metric Type
                      </label>
                      <select
                        value={newRuleForm.metricType}
                        onChange={(e) =>
                          setNewRuleForm({
                            ...newRuleForm,
                            metricType: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                      >
                        <option value="Import Parity Trigger">
                          Import Parity Trigger (₹/MT)
                        </option>
                        <option value="LME/SHFE Threshold">
                          LME Price / SHFE Ratio Threshold
                        </option>
                        <option value="Forecast Deviation">
                          Forecast Deviation (% MoM)
                        </option>
                        <option value="Critical News Event">
                          Critical News Event (Impact Score)
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-medium mb-1">Severity</label>
                      <select
                        value={newRuleForm.severity}
                        onChange={(e) =>
                          setNewRuleForm({ ...newRuleForm, severity: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                      >
                        <option value="Critical">Critical</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 font-medium mb-1">Operator</label>
                      <select
                        value={newRuleForm.conditionOperator}
                        onChange={(e) =>
                          setNewRuleForm({
                            ...newRuleForm,
                            conditionOperator: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono"
                      >
                        <option value=">=">&gt;= (Greater or Equal)</option>
                        <option value="<=">&lt;= (Less or Equal)</option>
                        <option value=">">&gt; (Greater Than)</option>
                        <option value="<">&lt; (Less Than)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-medium mb-1">
                        Threshold Value
                      </label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={newRuleForm.thresholdValue}
                        onChange={(e) =>
                          setNewRuleForm({
                            ...newRuleForm,
                            thresholdValue: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-medium mb-1">
                      Email Notification Recipient
                    </label>
                    <input
                      type="email"
                      required
                      value={newRuleForm.recipientEmail}
                      onChange={(e) =>
                        setNewRuleForm({
                          ...newRuleForm,
                          recipientEmail: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>

                  <div className="flex items-center gap-6 pt-1">
                    <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newRuleForm.notifyInApp}
                        onChange={(e) =>
                          setNewRuleForm({
                            ...newRuleForm,
                            notifyInApp: e.target.checked,
                          })
                        }
                        className="accent-amber-600"
                      />
                      <span>In-App Notification</span>
                    </label>
                    <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newRuleForm.notifyEmail}
                        onChange={(e) =>
                          setNewRuleForm({
                            ...newRuleForm,
                            notifyEmail: e.target.checked,
                          })
                        }
                        className="accent-amber-600"
                      />
                      <span>Email Dispatch</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={creatingRule}
                    className="w-full py-2.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
                  >
                    {creatingRule
                      ? 'Saving Alert Rule to PostgreSQL...'
                      : 'Create & Activate Alert Rule'}
                  </button>
                </form>
              </div>

              {/* Right 7 Cols: Configured Alert Rules Table */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    02. Active Monitoring Rules (PostgreSQL{' '}
                    <span className="font-mono text-sm text-slate-700">alert_rules</span>)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Automatically evaluated whenever live market data feeds or search-grounded news items arrive
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2.5 px-2">Rule Name · Metric</th>
                        <th className="py-2.5 px-2">Scope</th>
                        <th className="py-2.5 px-2">Condition</th>
                        <th className="py-2.5 px-2">Channels · Recipient</th>
                        <th className="py-2.5 px-2 text-right">Status / Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {alertRules.map((rule) => (
                        <tr key={rule.id} className="hover:bg-slate-50">
                          <td className="py-3 px-2">
                            <div className="font-medium text-slate-900">
                              {rule.ruleName}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {rule.metricType} · Severity:{' '}
                              <span
                                className={
                                  rule.severity === 'Critical'
                                    ? 'text-red-600 font-semibold'
                                    : rule.severity === 'High'
                                    ? 'text-amber-700 font-semibold'
                                    : 'text-sky-700'
                                }
                              >
                                {rule.severity}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-slate-600 whitespace-nowrap">
                            {rule.metal} · {rule.region}
                          </td>
                          <td className="py-3 px-2 font-mono tabular-nums text-amber-700 font-semibold whitespace-nowrap">
                            {rule.conditionOperator} {rule.thresholdValue}
                          </td>
                          <td className="py-3 px-2 text-slate-600">
                            <div>
                              {rule.notifyInApp && rule.notifyEmail
                                ? 'In-App + Email'
                                : rule.notifyEmail
                                ? 'Email'
                                : 'In-App'}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[160px]">
                              {rule.recipientEmail}
                            </div>
                          </td>
                          <td className="py-3 px-2 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleToggleRuleActive(rule)}
                                className={`px-2.5 py-1 rounded text-[11px] font-medium ${
                                  rule.isActive
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                                }`}
                              >
                                {rule.isActive ? 'Active' : 'Paused'}
                              </button>
                              <button
                                onClick={() => handleDeleteRule(rule.id)}
                                className="p-1 text-slate-400 hover:text-red-600"
                                title="Delete Rule"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Triggered Alert Notifications Feed with Cause, Impact & Email Dispatch Preview */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    03. Dispatched In-App & Email Alert Log (Cause & Commercial Impact Analysis)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Every triggered notification includes root-cause diagnostics, quantified MT/₹ impact, and email delivery verification
                  </p>
                </div>
                {unreadAlertsCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg whitespace-nowrap shrink-0"
                  >
                    Mark All ({unreadAlertsCount}) Read
                  </button>
                )}
              </div>

              <div className="divide-y divide-slate-200">
                {alertNotifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`py-4 first:pt-1 last:pb-1 space-y-2 ${
                      notif.isRead ? 'opacity-70' : ''
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`font-bold ${
                            notif.severity === 'Critical'
                              ? 'text-red-600'
                              : notif.severity === 'High'
                              ? 'text-amber-700'
                              : 'text-sky-700'
                          }`}
                        >
                          {notif.severity.toUpperCase()}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-900 font-semibold">{notif.metal}</span>
                        <span aria-hidden="true">·</span>
                        <span>{notif.region}</span>
                        <span aria-hidden="true">·</span>
                        <span>{notif.metricType}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {notif.triggeredAt}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-emerald-700 font-medium flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5" />
                          <span>
                            {notif.emailStatus} → {notif.emailRecipient}
                          </span>
                        </span>
                        <button
                          onClick={() => setSelectedEmailPreview(notif)}
                          className="text-sky-700 hover:underline font-medium"
                        >
                          View Email Payload
                        </button>
                        {!notif.isRead && (
                          <button
                            onClick={() => handleMarkNotificationRead(notif.id)}
                            className="text-amber-700 hover:underline font-medium"
                          >
                            Acknowledge
                          </button>
                        )}
                      </div>
                    </div>

                    <h3 className="text-sm font-bold text-slate-900">{notif.title}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                        <div className="text-slate-600 font-semibold mb-1">
                          Alert Cause & Trigger Telemetry:
                        </div>
                        <p className="text-slate-700 leading-relaxed">
                          {notif.causeSummary}
                        </p>
                      </div>
                      <div className="bg-amber-50/50 border border-amber-200/80 rounded-lg p-3">
                        <div className="text-amber-800 font-semibold mb-1">
                          Commercial Impact & Recommended Action:
                        </div>
                        <p className="text-slate-700 leading-relaxed">
                          {notif.impactAssessment}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* SLIDE-OVER IN-APP & EMAIL ALERT NOTIFICATION DRAWER */}
      {showAlertDrawer && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white border-l border-slate-200 shadow-2xl flex flex-col">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Real-Time Commercial Alert Center
                </h3>
                <p className="text-[11px] text-slate-500">
                  In-App & Email Notifications · All India Commercial Desk
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowAlertDrawer(false)}
              className="text-slate-400 hover:text-slate-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <button
              onClick={handleEvaluateAlertsNow}
              disabled={evaluatingAlerts}
              className="text-xs text-amber-700 font-medium hover:underline flex items-center gap-1"
            >
              <RefreshCw
                className={`w-3 h-3 ${evaluatingAlerts ? 'animate-spin' : ''}`}
              />
              <span>Evaluate Live Thresholds</span>
            </button>
            <button
              onClick={() => {
                setShowAlertDrawer(false);
                setActiveModule('alerts');
              }}
              className="text-xs text-sky-700 font-medium hover:underline"
            >
              Configure Custom Rules →
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {alertNotifications.map((n) => (
              <div
                key={n.id}
                className={`p-3.5 rounded-xl border ${
                  n.isRead
                    ? 'bg-slate-50/70 border-slate-200'
                    : 'bg-white border-slate-300 shadow-2xs'
                } space-y-1.5 text-xs`}
              >
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span
                    className={`font-bold ${
                      n.severity === 'Critical'
                        ? 'text-red-600'
                        : 'text-amber-700'
                    }`}
                  >
                    {n.severity.toUpperCase()} · {n.metal} ({n.region})
                  </span>
                  <span className="font-mono">{n.triggeredAt}</span>
                </div>
                <div className="font-bold text-slate-900">{n.title}</div>
                <p className="text-slate-600 leading-relaxed">{n.causeSummary}</p>
                <p className="text-amber-800 leading-relaxed">
                  Impact: {n.impactAssessment}
                </p>
                <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-200">
                  <span>Email: {n.emailRecipient}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedEmailPreview(n)}
                      className="text-sky-700 font-medium hover:underline"
                    >
                      Email Preview
                    </button>
                    {!n.isRead && (
                      <button
                        onClick={() => handleMarkNotificationRead(n.id)}
                        className="text-emerald-700 font-medium hover:underline"
                      >
                        Mark Read
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EMAIL DISPATCH PAYLOAD PREVIEW MODAL */}
      {selectedEmailPreview && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Automated Email Alert Dispatch Receipt
                </h3>
              </div>
              <button
                onClick={() => setSelectedEmailPreview(null)}
                className="text-slate-400 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 font-mono text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>To: {selectedEmailPreview.emailRecipient}</div>
              <div>From: alerts-noreply@metalsense.hzlindia.com</div>
              <div>
                Subject: [{selectedEmailPreview.severity}] HZL MetalSense AI:{' '}
                {selectedEmailPreview.title}
              </div>
              <div>
                Status: {selectedEmailPreview.emailStatus} ·{' '}
                {selectedEmailPreview.triggeredAt}
              </div>
            </div>

            <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200 text-slate-700 leading-relaxed">
              <p className="font-semibold text-slate-900">
                HZL Commercial Optimization & Parity Alert Summary
              </p>
              <p>
                <strong>Root Cause:</strong> {selectedEmailPreview.causeSummary}
              </p>
              <p>
                <strong>Commercial Impact & Recommended Desk Action:</strong>{' '}
                {selectedEmailPreview.impactAssessment}
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <a
                href={`mailto:${
                  selectedEmailPreview.emailRecipient
                }?subject=${encodeURIComponent(
                  `[${selectedEmailPreview.severity}] ${selectedEmailPreview.title}`
                )}&body=${encodeURIComponent(
                  `Cause:\n${selectedEmailPreview.causeSummary}\n\nImpact & Action:\n${selectedEmailPreview.impactAssessment}`
                )}`}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-lg font-medium"
              >
                Open in Mail Client
              </a>
              <button
                onClick={() => setSelectedEmailPreview(null)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FOR LOGGING NEW EXIM BILL OF LADING RECORD */}
      {showAddEximModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Log EXIM Bill of Lading Record ({selectedMetal})
              </h3>
              <button
                onClick={() => setShowAddEximModal(false)}
                className="text-slate-400 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddEximSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Importing Customer Name
                </label>
                <input
                  type="text"
                  required
                  value={newEximForm.importerName}
                  onChange={(e) =>
                    setNewEximForm({ ...newEximForm, importerName: e.target.value })
                  }
                  placeholder="e.g., Bhushan Power & Steel Ltd"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Grade</label>
                  <select
                    value={newEximForm.grade}
                    onChange={(e) =>
                      setNewEximForm({ ...newEximForm, grade: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  >
                    <option value="SHG">SHG</option>
                    <option value="Jumbo">Jumbo</option>
                    <option value="HG">HG</option>
                    <option value="PW">PW</option>
                    <option value="99.99% Silver">99.99% Silver</option>
                    <option value="Cd-99.95">Cd-99.95</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Customer Region
                  </label>
                  <select
                    value={newEximForm.customerLocation}
                    onChange={(e) =>
                      setNewEximForm({
                        ...newEximForm,
                        customerLocation: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  >
                    <option value="West">West</option>
                    <option value="East">East</option>
                    <option value="North">North</option>
                    <option value="South">South</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Origin Country
                  </label>
                  <input
                    type="text"
                    value={newEximForm.originCountry}
                    onChange={(e) =>
                      setNewEximForm({
                        ...newEximForm,
                        originCountry: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Indian Port
                  </label>
                  <input
                    type="text"
                    value={newEximForm.port}
                    onChange={(e) =>
                      setNewEximForm({ ...newEximForm, port: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Volume (MT)
                  </label>
                  <input
                    type="number"
                    required
                    value={newEximForm.volumeMt}
                    onChange={(e) =>
                      setNewEximForm({ ...newEximForm, volumeMt: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    CIF ($/MT)
                  </label>
                  <input
                    type="number"
                    required
                    value={newEximForm.cifPriceUsd}
                    onChange={(e) =>
                      setNewEximForm({ ...newEximForm, cifPriceUsd: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">
                    Landed (₹/MT)
                  </label>
                  <input
                    type="number"
                    required
                    value={newEximForm.landedCostInr}
                    onChange={(e) =>
                      setNewEximForm({
                        ...newEximForm,
                        landedCostInr: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddEximModal(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingExim}
                  className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg"
                >
                  {submittingExim ? 'Saving...' : 'Save Bill of Lading'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MULTI-TURN GEMINI COMMODITY STRATEGIST CHAT DRAWER */}
      {chatOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white border-l border-slate-200 shadow-2xl flex flex-col">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Bot className="w-5 h-5 text-amber-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  MetalSense AI Commercial Strategist
                </h3>
                <p className="text-[11px] text-slate-500">
                  Multi-turn HZL Commodity & Econometric Desk Assistant
                </p>
              </div>
            </div>
            <button
              onClick={() => setChatOpen(false)}
              className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-1">
            <button
              onClick={() => setChatMode('fast')}
              className={`flex-1 py-1.5 px-2 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                chatMode === 'fast'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Fast (3.1-flash-lite)
            </button>
            <button
              onClick={() => setChatMode('search')}
              className={`flex-1 py-1.5 px-2 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                chatMode === 'search'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Search (3.8-flash)
            </button>
            <button
              onClick={() => setChatMode('thinking')}
              className={`flex-1 py-1.5 px-2 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                chatMode === 'thinking'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Deep (4-argon High)
            </button>
          </div>

          <div className="px-4 py-2 border-b border-slate-200 flex items-center gap-2 overflow-x-auto bg-white">
            <button
              onClick={() =>
                handleSendChatMessage(
                  undefined,
                  `How should HZL adjust ${selectedMetal} physical premiums in West India given Korea-India CEPA imports?`
                )
              }
              className="text-[11px] text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded px-2.5 py-1 whitespace-nowrap shrink-0"
            >
              Korea CEPA Tariff Defense
            </button>
            <button
              onClick={() =>
                handleSendChatMessage(
                  undefined,
                  `What is the optimal LTC vs Spot Auction split for ${availVolumeMt} MT of ${selectedMetal} this month?`
                )
              }
              className="text-[11px] text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded px-2.5 py-1 whitespace-nowrap shrink-0"
            >
              Optimize LTC vs Spot Split
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/40">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[90%] rounded-xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-amber-600 text-white font-medium'
                      : 'bg-white border border-slate-200 text-slate-800 shadow-2xs'
                  }`}
                >
                  {msg.text}

                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-200 space-y-1">
                      <div className="text-[10px] font-semibold text-amber-800">
                        Search Grounding Citations:
                      </div>
                      {msg.sources.map((s, idx) => (
                        <a
                          key={idx}
                          href={s.uri}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-[11px] text-sky-700 hover:underline truncate"
                        >
                          · {s.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-1 text-[10px] text-slate-400 font-mono">
                  {msg.role === 'user' ? 'You' : msg.modelUsed || 'Gemini'} ·{' '}
                  {msg.timestamp}
                </div>
              </div>
            ))}

            {chatLoading && (
              <div className="text-xs text-slate-500 font-mono">
                {chatMode === 'thinking'
                  ? 'gemini-4-argon (ThinkingLevel.HIGH) reasoning...'
                  : chatMode === 'search'
                  ? 'gemini-3.8-flash searching live commodity sources...'
                  : 'gemini-3.1-flash-lite generating fast response...'}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form
            onSubmit={(e) => handleSendChatMessage(e)}
            className="p-3 border-t border-slate-200 bg-white flex items-center gap-2"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about LME parity, EXIM flows, or auction pricing..."
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-600"
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs flex items-center gap-1 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        </div>
      )}

      {/* CLEAN FOOTER */}
      <footer className="border-t border-slate-200 bg-white px-6 py-4 mt-8">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            MetalSense AI — Domestic Demand Sensing & Commercial Optimization Platform for Hindustan Zinc Limited
          </span>
          <span>
            Zinc · Lead · Silver · Cadmium · Live LME / SHFE / MCX Parity & Alerting Engine
          </span>
        </div>
      </footer>
    </div>
  );
}
