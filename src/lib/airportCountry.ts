export interface AirportInfo {
  country: string
  flag: string
}

const AIRPORT_COUNTRY: Record<string, AirportInfo> = {
  // United Kingdom
  LHR: { country: 'United Kingdom', flag: '🇬🇧' },
  LGW: { country: 'United Kingdom', flag: '🇬🇧' },
  STN: { country: 'United Kingdom', flag: '🇬🇧' },
  LTN: { country: 'United Kingdom', flag: '🇬🇧' },
  LCY: { country: 'United Kingdom', flag: '🇬🇧' },
  MAN: { country: 'United Kingdom', flag: '🇬🇧' },
  BHX: { country: 'United Kingdom', flag: '🇬🇧' },
  EDI: { country: 'United Kingdom', flag: '🇬🇧' },
  GLA: { country: 'United Kingdom', flag: '🇬🇧' },
  BRS: { country: 'United Kingdom', flag: '🇬🇧' },
  NCL: { country: 'United Kingdom', flag: '🇬🇧' },
  LPL: { country: 'United Kingdom', flag: '🇬🇧' },
  // France
  CDG: { country: 'France', flag: '🇫🇷' },
  ORY: { country: 'France', flag: '🇫🇷' },
  NCE: { country: 'France', flag: '🇫🇷' },
  LYS: { country: 'France', flag: '🇫🇷' },
  MRS: { country: 'France', flag: '🇫🇷' },
  TLS: { country: 'France', flag: '🇫🇷' },
  BOD: { country: 'France', flag: '🇫🇷' },
  // Germany
  FRA: { country: 'Germany', flag: '🇩🇪' },
  MUC: { country: 'Germany', flag: '🇩🇪' },
  BER: { country: 'Germany', flag: '🇩🇪' },
  DUS: { country: 'Germany', flag: '🇩🇪' },
  HAM: { country: 'Germany', flag: '🇩🇪' },
  STR: { country: 'Germany', flag: '🇩🇪' },
  CGN: { country: 'Germany', flag: '🇩🇪' },
  // Spain
  MAD: { country: 'Spain', flag: '🇪🇸' },
  BCN: { country: 'Spain', flag: '🇪🇸' },
  AGP: { country: 'Spain', flag: '🇪🇸' },
  ALC: { country: 'Spain', flag: '🇪🇸' },
  VLC: { country: 'Spain', flag: '🇪🇸' },
  SVQ: { country: 'Spain', flag: '🇪🇸' },
  IBZ: { country: 'Spain', flag: '🇪🇸' },
  PMI: { country: 'Spain', flag: '🇪🇸' },
  TFS: { country: 'Spain', flag: '🇪🇸' },
  LPA: { country: 'Spain', flag: '🇪🇸' },
  // Italy
  FCO: { country: 'Italy', flag: '🇮🇹' },
  MXP: { country: 'Italy', flag: '🇮🇹' },
  LIN: { country: 'Italy', flag: '🇮🇹' },
  VCE: { country: 'Italy', flag: '🇮🇹' },
  NAP: { country: 'Italy', flag: '🇮🇹' },
  CTA: { country: 'Italy', flag: '🇮🇹' },
  BLQ: { country: 'Italy', flag: '🇮🇹' },
  FLR: { country: 'Italy', flag: '🇮🇹' },
  // Netherlands
  AMS: { country: 'Netherlands', flag: '🇳🇱' },
  EIN: { country: 'Netherlands', flag: '🇳🇱' },
  // Belgium
  BRU: { country: 'Belgium', flag: '🇧🇪' },
  CRL: { country: 'Belgium', flag: '🇧🇪' },
  // Switzerland
  ZRH: { country: 'Switzerland', flag: '🇨🇭' },
  GVA: { country: 'Switzerland', flag: '🇨🇭' },
  BSL: { country: 'Switzerland', flag: '🇨🇭' },
  // Austria
  VIE: { country: 'Austria', flag: '🇦🇹' },
  // Portugal
  LIS: { country: 'Portugal', flag: '🇵🇹' },
  OPO: { country: 'Portugal', flag: '🇵🇹' },
  FAO: { country: 'Portugal', flag: '🇵🇹' },
  // Greece
  ATH: { country: 'Greece', flag: '🇬🇷' },
  SKG: { country: 'Greece', flag: '🇬🇷' },
  HER: { country: 'Greece', flag: '🇬🇷' },
  RHO: { country: 'Greece', flag: '🇬🇷' },
  CFU: { country: 'Greece', flag: '🇬🇷' },
  // Turkey
  IST: { country: 'Turkey', flag: '🇹🇷' },
  SAW: { country: 'Turkey', flag: '🇹🇷' },
  AYT: { country: 'Turkey', flag: '🇹🇷' },
  ESB: { country: 'Turkey', flag: '🇹🇷' },
  ADB: { country: 'Turkey', flag: '🇹🇷' },
  // UAE
  DXB: { country: 'UAE', flag: '🇦🇪' },
  AUH: { country: 'UAE', flag: '🇦🇪' },
  SHJ: { country: 'UAE', flag: '🇦🇪' },
  // Qatar
  DOH: { country: 'Qatar', flag: '🇶🇦' },
  // Saudi Arabia
  RUH: { country: 'Saudi Arabia', flag: '🇸🇦' },
  JED: { country: 'Saudi Arabia', flag: '🇸🇦' },
  DMM: { country: 'Saudi Arabia', flag: '🇸🇦' },
  // Kuwait
  KWI: { country: 'Kuwait', flag: '🇰🇼' },
  // Bahrain
  BAH: { country: 'Bahrain', flag: '🇧🇭' },
  // Oman
  MCT: { country: 'Oman', flag: '🇴🇲' },
  // Egypt
  CAI: { country: 'Egypt', flag: '🇪🇬' },
  HRG: { country: 'Egypt', flag: '🇪🇬' },
  SSH: { country: 'Egypt', flag: '🇪🇬' },
  // Morocco
  CMN: { country: 'Morocco', flag: '🇲🇦' },
  RAK: { country: 'Morocco', flag: '🇲🇦' },
  // Tunisia
  TUN: { country: 'Tunisia', flag: '🇹🇳' },
  // South Africa
  JNB: { country: 'South Africa', flag: '🇿🇦' },
  CPT: { country: 'South Africa', flag: '🇿🇦' },
  // Kenya
  NBO: { country: 'Kenya', flag: '🇰🇪' },
  // Ethiopia
  ADD: { country: 'Ethiopia', flag: '🇪🇹' },
  // Nigeria
  LOS: { country: 'Nigeria', flag: '🇳🇬' },
  ABV: { country: 'Nigeria', flag: '🇳🇬' },
  // Ghana
  ACC: { country: 'Ghana', flag: '🇬🇭' },
  // USA
  JFK: { country: 'USA', flag: '🇺🇸' },
  LGA: { country: 'USA', flag: '🇺🇸' },
  EWR: { country: 'USA', flag: '🇺🇸' },
  LAX: { country: 'USA', flag: '🇺🇸' },
  ORD: { country: 'USA', flag: '🇺🇸' },
  ATL: { country: 'USA', flag: '🇺🇸' },
  DFW: { country: 'USA', flag: '🇺🇸' },
  MIA: { country: 'USA', flag: '🇺🇸' },
  SFO: { country: 'USA', flag: '🇺🇸' },
  SEA: { country: 'USA', flag: '🇺🇸' },
  BOS: { country: 'USA', flag: '🇺🇸' },
  IAD: { country: 'USA', flag: '🇺🇸' },
  DEN: { country: 'USA', flag: '🇺🇸' },
  LAS: { country: 'USA', flag: '🇺🇸' },
  MCO: { country: 'USA', flag: '🇺🇸' },
  PHX: { country: 'USA', flag: '🇺🇸' },
  MSP: { country: 'USA', flag: '🇺🇸' },
  DTW: { country: 'USA', flag: '🇺🇸' },
  PHL: { country: 'USA', flag: '🇺🇸' },
  CLT: { country: 'USA', flag: '🇺🇸' },
  IAH: { country: 'USA', flag: '🇺🇸' },
  HNL: { country: 'USA', flag: '🇺🇸' },
  // Canada
  YYZ: { country: 'Canada', flag: '🇨🇦' },
  YVR: { country: 'Canada', flag: '🇨🇦' },
  YUL: { country: 'Canada', flag: '🇨🇦' },
  YYC: { country: 'Canada', flag: '🇨🇦' },
  YEG: { country: 'Canada', flag: '🇨🇦' },
  YOW: { country: 'Canada', flag: '🇨🇦' },
  // Mexico
  MEX: { country: 'Mexico', flag: '🇲🇽' },
  CUN: { country: 'Mexico', flag: '🇲🇽' },
  GDL: { country: 'Mexico', flag: '🇲🇽' },
  // Brazil
  GRU: { country: 'Brazil', flag: '🇧🇷' },
  GIG: { country: 'Brazil', flag: '🇧🇷' },
  BSB: { country: 'Brazil', flag: '🇧🇷' },
  // Argentina
  EZE: { country: 'Argentina', flag: '🇦🇷' },
  AEP: { country: 'Argentina', flag: '🇦🇷' },
  // Colombia
  BOG: { country: 'Colombia', flag: '🇨🇴' },
  // Peru
  LIM: { country: 'Peru', flag: '🇵🇪' },
  // Chile
  SCL: { country: 'Chile', flag: '🇨🇱' },
  // Japan
  NRT: { country: 'Japan', flag: '🇯🇵' },
  HND: { country: 'Japan', flag: '🇯🇵' },
  KIX: { country: 'Japan', flag: '🇯🇵' },
  NGO: { country: 'Japan', flag: '🇯🇵' },
  CTS: { country: 'Japan', flag: '🇯🇵' },
  // China
  PEK: { country: 'China', flag: '🇨🇳' },
  PKX: { country: 'China', flag: '🇨🇳' },
  PVG: { country: 'China', flag: '🇨🇳' },
  SHA: { country: 'China', flag: '🇨🇳' },
  CAN: { country: 'China', flag: '🇨🇳' },
  SZX: { country: 'China', flag: '🇨🇳' },
  CTU: { country: 'China', flag: '🇨🇳' },
  // Hong Kong
  HKG: { country: 'Hong Kong', flag: '🇭🇰' },
  // South Korea
  ICN: { country: 'South Korea', flag: '🇰🇷' },
  GMP: { country: 'South Korea', flag: '🇰🇷' },
  // Singapore
  SIN: { country: 'Singapore', flag: '🇸🇬' },
  // Thailand
  BKK: { country: 'Thailand', flag: '🇹🇭' },
  DMK: { country: 'Thailand', flag: '🇹🇭' },
  HKT: { country: 'Thailand', flag: '🇹🇭' },
  CNX: { country: 'Thailand', flag: '🇹🇭' },
  // Malaysia
  KUL: { country: 'Malaysia', flag: '🇲🇾' },
  PEN: { country: 'Malaysia', flag: '🇲🇾' },
  // Indonesia
  CGK: { country: 'Indonesia', flag: '🇮🇩' },
  DPS: { country: 'Indonesia', flag: '🇮🇩' },
  // Vietnam
  HAN: { country: 'Vietnam', flag: '🇻🇳' },
  SGN: { country: 'Vietnam', flag: '🇻🇳' },
  DAD: { country: 'Vietnam', flag: '🇻🇳' },
  // Philippines
  MNL: { country: 'Philippines', flag: '🇵🇭' },
  CEB: { country: 'Philippines', flag: '🇵🇭' },
  // India
  DEL: { country: 'India', flag: '🇮🇳' },
  BOM: { country: 'India', flag: '🇮🇳' },
  BLR: { country: 'India', flag: '🇮🇳' },
  MAA: { country: 'India', flag: '🇮🇳' },
  CCU: { country: 'India', flag: '🇮🇳' },
  HYD: { country: 'India', flag: '🇮🇳' },
  AMD: { country: 'India', flag: '🇮🇳' },
  COK: { country: 'India', flag: '🇮🇳' },
  // Pakistan
  KHI: { country: 'Pakistan', flag: '🇵🇰' },
  LHE: { country: 'Pakistan', flag: '🇵🇰' },
  ISB: { country: 'Pakistan', flag: '🇵🇰' },
  // Sri Lanka
  CMB: { country: 'Sri Lanka', flag: '🇱🇰' },
  // Bangladesh
  DAC: { country: 'Bangladesh', flag: '🇧🇩' },
  // Australia
  SYD: { country: 'Australia', flag: '🇦🇺' },
  MEL: { country: 'Australia', flag: '🇦🇺' },
  BNE: { country: 'Australia', flag: '🇦🇺' },
  PER: { country: 'Australia', flag: '🇦🇺' },
  ADL: { country: 'Australia', flag: '🇦🇺' },
  // New Zealand
  AKL: { country: 'New Zealand', flag: '🇳🇿' },
  CHC: { country: 'New Zealand', flag: '🇳🇿' },
  WLG: { country: 'New Zealand', flag: '🇳🇿' },
  // Ireland
  DUB: { country: 'Ireland', flag: '🇮🇪' },
  ORK: { country: 'Ireland', flag: '🇮🇪' },
  // Scandinavia
  CPH: { country: 'Denmark', flag: '🇩🇰' },
  OSL: { country: 'Norway', flag: '🇳🇴' },
  BGO: { country: 'Norway', flag: '🇳🇴' },
  ARN: { country: 'Sweden', flag: '🇸🇪' },
  GOT: { country: 'Sweden', flag: '🇸🇪' },
  HEL: { country: 'Finland', flag: '🇫🇮' },
  // Poland
  WAW: { country: 'Poland', flag: '🇵🇱' },
  KRK: { country: 'Poland', flag: '🇵🇱' },
  // Czech Republic
  PRG: { country: 'Czech Republic', flag: '🇨🇿' },
  // Hungary
  BUD: { country: 'Hungary', flag: '🇭🇺' },
  // Romania
  OTP: { country: 'Romania', flag: '🇷🇴' },
  CLJ: { country: 'Romania', flag: '🇷🇴' },
  // Croatia
  ZAG: { country: 'Croatia', flag: '🇭🇷' },
  SPU: { country: 'Croatia', flag: '🇭🇷' },
  DBV: { country: 'Croatia', flag: '🇭🇷' },
  // Serbia
  BEG: { country: 'Serbia', flag: '🇷🇸' },
  // Russia
  SVO: { country: 'Russia', flag: '🇷🇺' },
  DME: { country: 'Russia', flag: '🇷🇺' },
  LED: { country: 'Russia', flag: '🇷🇺' },
  // Israel
  TLV: { country: 'Israel', flag: '🇮🇱' },
  // Jordan
  AMM: { country: 'Jordan', flag: '🇯🇴' },
  // Lebanon
  BEY: { country: 'Lebanon', flag: '🇱🇧' },
  // Iran
  IKA: { country: 'Iran', flag: '🇮🇷' },
  // Iraq
  BGW: { country: 'Iraq', flag: '🇮🇶' },
  BSR: { country: 'Iraq', flag: '🇮🇶' },
  // Sudan
  KRT: { country: 'Sudan', flag: '🇸🇩' },
  // Maldives
  MLE: { country: 'Maldives', flag: '🇲🇻' },
  // Mauritius
  MRU: { country: 'Mauritius', flag: '🇲🇺' },
  // Seychelles
  SEZ: { country: 'Seychelles', flag: '🇸🇨' },
  // Cyprus
  LCA: { country: 'Cyprus', flag: '🇨🇾' },
  PFO: { country: 'Cyprus', flag: '🇨🇾' },
  // Malta
  MLA: { country: 'Malta', flag: '🇲🇹' },
  // Iceland
  KEF: { country: 'Iceland', flag: '🇮🇸' },
  // Luxembourg
  LUX: { country: 'Luxembourg', flag: '🇱🇺' },
  // Slovakia
  BTS: { country: 'Slovakia', flag: '🇸🇰' },
  // Slovenia
  LJU: { country: 'Slovenia', flag: '🇸🇮' },
  // Bulgaria
  SOF: { country: 'Bulgaria', flag: '🇧🇬' },
  VAR: { country: 'Bulgaria', flag: '🇧🇬' },
  // Albania
  TIA: { country: 'Albania', flag: '🇦🇱' },
  // North Macedonia
  SKP: { country: 'North Macedonia', flag: '🇲🇰' },
  // Bosnia
  SJJ: { country: 'Bosnia', flag: '🇧🇦' },
  // Montenegro
  TGD: { country: 'Montenegro', flag: '🇲🇪' },
  // Ukraine
  KBP: { country: 'Ukraine', flag: '🇺🇦' },
  // Georgia
  TBS: { country: 'Georgia', flag: '🇬🇪' },
  // Armenia
  EVN: { country: 'Armenia', flag: '🇦🇲' },
  // Azerbaijan
  GYD: { country: 'Azerbaijan', flag: '🇦🇿' },
  // Kazakhstan
  ALA: { country: 'Kazakhstan', flag: '🇰🇿' },
  NQZ: { country: 'Kazakhstan', flag: '🇰🇿' },
}

export function getAirportInfo(code: string): AirportInfo {
  return AIRPORT_COUNTRY[code?.toUpperCase()] ?? { country: code ?? '?', flag: '✈️' }
}

export default AIRPORT_COUNTRY
