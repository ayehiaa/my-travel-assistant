// Mock data — Sojourn travel planner prototype
// Schema mirrors the latest API: trips have trip_type, source, legs[], days_outside_uk, attribution
window.MOCK = (() => {
  const palette = [
    ['#ff6f5e', '#ffb400'], // coral-yellow
    ['#4cc4f5', '#1a73d6'], // sky-blue
    ['#2bc28a', '#1a8fc2'], // mint-teal
    ['#8b6fdb', '#ec4ea0'], // lavender-rose
    ['#ff9a6c', '#ff6f5e'], // peach-coral
    ['#ffb400', '#ff9a6c'], // yellow-peach
    ['#1a73d6', '#8b6fdb'], // blue-lavender
    ['#ec4ea0', '#8b6fdb'], // rose-lavender
  ];
  const grad = (i) => `linear-gradient(135deg, ${palette[i % palette.length][0]} 0%, ${palette[i % palette.length][1]} 100%)`;

  // Airport metadata — used for flags + city/country lookup
  const AIRPORTS = {
    LHR: { city:'London',     country:'United Kingdom', flag:'🇬🇧' },
    LGW: { city:'London',     country:'United Kingdom', flag:'🇬🇧' },
    JFK: { city:'New York',   country:'USA',            flag:'🇺🇸' },
    CDG: { city:'Paris',      country:'France',         flag:'🇫🇷' },
    DXB: { city:'Dubai',      country:'UAE',            flag:'🇦🇪' },
    BKK: { city:'Bangkok',    country:'Thailand',       flag:'🇹🇭' },
    BCN: { city:'Barcelona',  country:'Spain',          flag:'🇪🇸' },
    MAD: { city:'Madrid',     country:'Spain',          flag:'🇪🇸' },
    AMS: { city:'Amsterdam',  country:'Netherlands',    flag:'🇳🇱' },
    IST: { city:'Istanbul',   country:'Turkey',         flag:'🇹🇷' },
    CAI: { city:'Cairo',      country:'Egypt',          flag:'🇪🇬' },
    LIS: { city:'Lisbon',     country:'Portugal',       flag:'🇵🇹' },
    DUS: { city:'Düsseldorf', country:'Germany',        flag:'🇩🇪' },
    FCO: { city:'Rome',       country:'Italy',          flag:'🇮🇹' },
    NRT: { city:'Tokyo',      country:'Japan',          flag:'🇯🇵' },
  };
  const airport = (code) => AIRPORTS[code] || { city: code, country: '—', flag:'✈️' };

  // Helper to build a trip
  function leg(from, to, depAt, airline, flt) {
    return { from_airport: from, to_airport: to, departure_at: depAt, airline, flight_number: flt };
  }
  function trip({ id, type='round_trip', source='search', legs, savedBy='Ziad', editedBy=null, color, tag='Trip' }) {
    const first = legs[0], last = legs[legs.length - 1];
    const days = Math.max(1, Math.round((new Date(last.departure_at) - new Date(first.departure_at))/86400000) - 1);
    const dest = legs[0].to_airport;
    const route = [...legs.map(l => l.from_airport), legs[legs.length - 1].to_airport].join(' → ');
    return {
      id, trip_type: type, source, legs, days_outside_uk: days,
      created_by: savedBy, last_modified_by: editedBy || savedBy,
      cover: color, tag, route, dest,
      city: airport(dest).city, country: airport(dest).country, flag: airport(dest).flag,
    };
  }

  const upcoming = [
    trip({
      id: 1, savedBy:'Ziad', color: grad(0), tag:'Business',
      legs:[
        leg('LHR','JFK','2026-05-18T08:30:00','British Airways','BA177'),
        leg('JFK','LHR','2026-05-25T18:45:00','British Airways','BA178'),
      ]
    }),
    trip({
      id: 2, savedBy:'Sara', editedBy:'Ziad', color: grad(1), tag:'Leisure',
      legs:[
        leg('LHR','CDG','2026-06-04T07:15:00','British Airways','BA304'),
        leg('CDG','LHR','2026-06-08T20:30:00','Air France','AF1681'),
      ]
    }),
    // Multi-city
    trip({
      id: 3, type:'multi_city', savedBy:'Ziad', color: grad(2), tag:'Multi-city',
      legs:[
        leg('LHR','DUS','2026-07-03T09:10:00','British Airways','BA936'),
        leg('DUS','CDG','2026-07-07T11:25:00','Air France','AF1311'),
        leg('CDG','LHR','2026-07-10T18:00:00','British Airways','BA305'),
      ]
    }),
    trip({
      id: 4, savedBy:'Ziad', color: grad(3), tag:'Family',
      legs:[
        leg('LHR','DXB','2026-07-22T22:00:00','Emirates','EK0002'),
        leg('DXB','LHR','2026-08-04T05:30:00','Emirates','EK0001'),
      ]
    }),
    trip({
      id: 5, savedBy:'Ziad', color: grad(7), tag:'Holiday',
      legs:[
        leg('LHR','BKK','2026-09-12T11:30:00','Thai Airways','TG911'),
        leg('BKK','LHR','2026-09-26T13:00:00','Thai Airways','TG910'),
      ]
    }),
  ];

  const past = [
    trip({
      id: 11, savedBy:'Ziad', color: grad(4),
      legs:[
        leg('LHR','BCN','2026-04-12T09:00:00','British Airways','BA478'),
        leg('BCN','LHR','2026-04-16T19:30:00','Vueling','VY7811'),
      ]
    }),
    trip({
      id: 12, savedBy:'Sara', color: grad(5),
      legs:[
        leg('LHR','AMS','2026-03-22T07:30:00','KLM','KL1010'),
        leg('AMS','LHR','2026-03-24T18:00:00','KLM','KL1009'),
      ]
    }),
    trip({
      id: 13, savedBy:'Ziad', color: grad(6),
      legs:[
        leg('LHR','IST','2026-02-08T14:30:00','Turkish Airlines','TK1980'),
        leg('IST','LHR','2026-02-15T03:00:00','Turkish Airlines','TK1979'),
      ]
    }),
    // Manual entry
    trip({
      id: 14, source:'manual', savedBy:'Ziad', color: grad(7),
      legs:[
        leg('LHR','CAI','2026-01-04T00:00:00', null, null),
        leg('CAI','LHR','2026-01-18T00:00:00', null, null),
      ]
    }),
    trip({
      id: 15, savedBy:'Sara', color: grad(0),
      legs:[
        leg('LHR','LIS','2025-11-12T08:00:00','TAP Portugal','TP1359'),
        leg('LIS','LHR','2025-11-15T20:00:00','TAP Portugal','TP1358'),
      ]
    }),
  ];

  // Flight search results — for LHR → JFK
  const outboundResults = [
    { id: 'o1', code: 'BA', name: 'British Airways', flt: 'BA177', dep: '08:30', arr: '11:25', dur: '7h 55m', stops: 'Direct', price: 642, isBA: true, color: '#1a73d6' },
    { id: 'o2', code: 'BA', name: 'British Airways', flt: 'BA117', dep: '14:15', arr: '17:10', dur: '7h 55m', stops: 'Direct', price: 689, isBA: true, color: '#1a73d6' },
    { id: 'o3', code: 'VS', name: 'Virgin Atlantic', flt: 'VS003', dep: '11:00', arr: '13:55', dur: '7h 55m', stops: 'Direct', price: 612, color: '#ec4ea0' },
    { id: 'o4', code: 'AA', name: 'American Airlines', flt: 'AA101', dep: '10:45', arr: '13:40', dur: '7h 55m', stops: 'Direct', price: 598, color: '#003B95' },
    { id: 'o5', code: 'DL', name: 'Delta', flt: 'DL3', dep: '18:30', arr: '21:25', dur: '7h 55m', stops: 'Direct', price: 654, color: '#8b6fdb' },
  ];
  const returnResults = [
    { id: 'r1', code: 'BA', name: 'British Airways', flt: 'BA178', dep: '18:45', arr: '06:50+1', dur: '7h 5m', stops: 'Direct', price: 642, isBA: true, color: '#1a73d6' },
    { id: 'r2', code: 'BA', name: 'British Airways', flt: 'BA112', dep: '21:50', arr: '09:55+1', dur: '7h 5m', stops: 'Direct', price: 678, isBA: true, color: '#1a73d6' },
    { id: 'r3', code: 'VS', name: 'Virgin Atlantic', flt: 'VS004', dep: '20:30', arr: '08:35+1', dur: '7h 5m', stops: 'Direct', price: 624, color: '#ec4ea0' },
    { id: 'r4', code: 'AA', name: 'American Airlines', flt: 'AA100', dep: '19:20', arr: '07:25+1', dur: '7h 5m', stops: 'Direct', price: 588, color: '#003B95' },
    { id: 'r5', code: 'DL', name: 'Delta', flt: 'DL2', dep: '22:30', arr: '10:35+1', dur: '7h 5m', stops: 'Direct', price: 661, color: '#8b6fdb' },
  ];

  const audit = [
    { when: '07 May · 14:32', who: 'Ziad',  role: 'main',      onBehalfOf:null,    avBg: '#1a73d6', action: 'created', what: 'Trip · LHR → JFK · 18 May 2026' },
    { when: '07 May · 14:18', who: 'Sara',  role: 'assistant', onBehalfOf:'Ziad',  avBg: '#ec4ea0', action: 'updated', what: 'Trip to CDG — return flight changed to AF1681' },
    { when: '06 May · 09:55', who: 'Ziad',  role: 'main',      onBehalfOf:null,    avBg: '#1a73d6', action: 'created', what: 'Multi-city · LHR → DUS → CDG → LHR · 03 Jul 2026' },
    { when: '03 May · 17:21', who: 'Ziad',  role: 'main',      onBehalfOf:null,    avBg: '#1a73d6', action: 'deleted', what: 'Trip to MAD · cancelled' },
    { when: '01 May · 11:04', who: 'Sara',  role: 'assistant', onBehalfOf:'Ziad',  avBg: '#ec4ea0', action: 'created', what: 'Trip · LHR → DXB · 22 Jul 2026' },
    { when: '28 Apr · 15:48', who: 'Ziad',  role: 'main',      onBehalfOf:null,    avBg: '#1a73d6', action: 'updated', what: 'Trip to BCN — outbound time slot changed to morning' },
    { when: '24 Apr · 08:12', who: 'Ziad',  role: 'main',      onBehalfOf:null,    avBg: '#1a73d6', action: 'created', what: 'Trip · LHR → BCN · 12 Apr 2026 (manual)' },
  ];

  // Multi-account state
  const accounts = {
    main:      { id:'u1', displayName:'Ziad Elsayed',  email:'ziad@example.com', initials:'Z', color:'#1a73d6' },
    assistant: { id:'u2', displayName:'Sara Hassan',   email:'sara@example.com', initials:'S', color:'#ec4ea0' },
    other:     { id:'u3', displayName:'Maya Chen',     email:'maya@example.com', initials:'M', color:'#2bc28a' },
  };
  // Linked assistants for the main account view
  const linkedAssistants = [
    { id:'l1', assistantUserId:'u2', displayName:'Sara Hassan', email:'sara@example.com', createdAt:'2026-02-14' },
    { id:'l2', assistantUserId:'u3', displayName:'Maya Chen',   email:'maya@example.com', createdAt:'2026-04-02' },
  ];
  // Linked main accounts that an assistant could view (for switcher)
  const assistantViewing = [
    { id:'u1', displayName:'Ziad Elsayed', initials:'Z', color:'#1a73d6' },
    { id:'u4', displayName:'Omar Khalid',  initials:'O', color:'#ff9a6c' },
  ];

  // Annual days-abroad reference setup
  const settings = {
    referenceDate: '2026-04-05',  // end of UK tax year-style window
    annualDaysAbroad: 73,         // pre-calculated for the 12-mo window
    annualMax: 90,
  };

  return {
    upcoming, past, outboundResults, returnResults, audit,
    palette, grad, AIRPORTS, airport,
    accounts, linkedAssistants, assistantViewing, settings,
  };
})();
