
console.log("[WQP] config.js loaded");

const SUPABASE_URL = 'https://cwrlnfcgryhmohopdwrs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_cZS7gdA_x9PVboQs1bFoYA_I2YTaUaM';
const STORAGE_KEY = 'window-quote-pro-v5-settings';

const DEFAULT_SETTINGS = {
  businessName: '',
  contactName: '',
  businessPhone: '',
  businessEmail: '',
  businessAbn: '',
  businessWebsite: '',
  businessAddress: '',
  customMessage: '',
  pricingMode: 'per-window',
  hourlyRate: 0,
  travelFee: 0,
  discount: 0,
  externalOnlyPercent: 60,
  gstEnabled: true,
  gstRate: 10,
  quoteFormat: 'itemised',
  secondStoreyPricingEnabled: false,
  secondStoreyMode: 'percent',
  secondStoreyPercent: 20,
  secondStoreyFixedAmount: 5
};

const DEFAULT_QUOTE_STATE = {
  externalOnly: false,
  secondStoreyEnabled: false,
  upstairsCounts: { sw: 0, lw: 0, sd: 0 }
};

const DEFAULT_SERVICES = [
  { id: 'sw',  name: 'Standard Windows', count: 0, rate: 10, minutes: 7,  unit: 'each',  icon: '<path d="M3 3h18v18H3z"></path><path d="M12 3v18"></path><path d="M3 12h18"></path>' },
  { id: 'lw',  name: 'Large Windows',    count: 0, rate: 18, minutes: 10, unit: 'each',  icon: '<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M12 3v18"></path><path d="M3 12h18"></path>' },
  { id: 'sd',  name: 'Sliding Doors',    count: 0, rate: 25, minutes: 12, unit: 'each',  icon: '<path d="M18 3v18"></path><path d="M3 3h15"></path><path d="M3 21h15"></path><path d="M3 3v18"></path>' },
  { id: 'fs',  name: 'Fly Screens',      count: 0, rate: 5,  minutes: 4,  unit: 'each',  icon: '<path d="M3 3h18v18H3z"></path><path d="M9 3v18"></path><path d="M15 3v18"></path><path d="M3 9h18"></path><path d="M3 15h18"></path>' },
  { id: 'tr',  name: 'Tracks/Sills',     count: 0, rate: 5,  minutes: 3,  unit: 'each',  icon: '<path d="M3 21h18"></path><path d="M5 21V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14"></path>' },
  { id: 'bal', name: 'Balustrade Glass', count: 0, rate: 12, minutes: 6,  unit: 'each',  icon: '<path d="M4 20h16"></path><path d="M7 20V6"></path><path d="M12 20V6"></path><path d="M17 20V6"></path><path d="M6 6h12"></path>' },
  { id: 'gut', name: 'Gutters',          count: 0, rate: 8,  minutes: 4,  unit: 'lm',    icon: '<path d="M3 7h18"></path><path d="M5 7v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7"></path>' },
  { id: 'sol', name: 'Solar Panels',     count: 0, rate: 6,  minutes: 3,  unit: 'panel', icon: '<path d="M4 6h16v10H4z"></path><path d="M8 6v10"></path><path d="M12 6v10"></path><path d="M16 6v10"></path><path d="M4 11h16"></path>' },
  { id: 'pw',  name: 'Pressure Washing', count: 0, rate: 5,  minutes: 2,  unit: 'm²',    icon: '<path d="M4 20h6"></path><path d="M7 20v-8"></path><path d="M7 12 18 5"></path><path d="M18 5v5"></path><path d="M18 5h-5"></path>' }
];

const DEFAULT_PRO_STATE = {
  user: null,
  teamId: null,
  teamName: '',
  teamRole: '',
  inviteCode: '',
  jobs: [],
  subscription: null,
  entitlementSource: null,
  logoDataUrl: null
};
