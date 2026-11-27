// The sky over a place at a moment, for the Star Map and the Phone Case makers. Needs sky_data.js first.
'use strict';
const D2R = Math.PI / 180;
// name | latitude | longitude | time zone
const CITIES = `Amsterdam|52.37|4.90|Europe/Amsterdam
Athens|37.98|23.73|Europe/Athens
Auckland|-36.85|174.76|Pacific/Auckland
Bangkok|13.76|100.50|Asia/Bangkok
Barcelona|41.39|2.17|Europe/Madrid
Beijing|39.90|116.40|Asia/Shanghai
Berlin|52.52|13.40|Europe/Berlin
Bogotá|4.71|-74.07|America/Bogota
Boston|42.36|-71.06|America/New_York
Brussels|50.85|4.35|Europe/Brussels
Budapest|47.50|19.04|Europe/Budapest
Buenos Aires|-34.60|-58.38|America/Argentina/Buenos_Aires
Cairo|30.04|31.24|Africa/Cairo
Cape Town|-33.92|18.42|Africa/Johannesburg
Chicago|41.88|-87.63|America/Chicago
Copenhagen|55.68|12.57|Europe/Copenhagen
Dallas|32.78|-96.80|America/Chicago
Delhi|28.61|77.21|Asia/Kolkata
Denver|39.74|-104.99|America/Denver
Dubai|25.20|55.27|Asia/Dubai
Dublin|53.35|-6.26|Europe/Dublin
Edinburgh|55.95|-3.19|Europe/London
Eilat|29.56|34.95|Asia/Jerusalem
Frankfurt|50.11|8.68|Europe/Berlin
Geneva|46.20|6.14|Europe/Zurich
Haifa|32.79|34.99|Asia/Jerusalem
Hamburg|53.55|9.99|Europe/Berlin
Helsinki|60.17|24.94|Europe/Helsinki
Hong Kong|22.32|114.17|Asia/Hong_Kong
Honolulu|21.31|-157.86|Pacific/Honolulu
Istanbul|41.01|28.98|Europe/Istanbul
Jerusalem|31.77|35.21|Asia/Jerusalem
Johannesburg|-26.20|28.05|Africa/Johannesburg
Kyiv|50.45|30.52|Europe/Kyiv
Lisbon|38.72|-9.14|Europe/Lisbon
London|51.51|-0.13|Europe/London
Los Angeles|34.05|-118.24|America/Los_Angeles
Luxembourg|49.61|6.13|Europe/Luxembourg
Lyon|45.76|4.84|Europe/Paris
Madrid|40.42|-3.70|Europe/Madrid
Manchester|53.48|-2.24|Europe/London
Melbourne|-37.81|144.96|Australia/Melbourne
Mexico City|19.43|-99.13|America/Mexico_City
Miami|25.76|-80.19|America/New_York
Milan|45.46|9.19|Europe/Rome
Montreal|45.50|-73.57|America/Toronto
Moscow|55.76|37.62|Europe/Moscow
Mumbai|19.08|72.88|Asia/Kolkata
Munich|48.14|11.58|Europe/Berlin
Nairobi|-1.29|36.82|Africa/Nairobi
New York|40.71|-74.01|America/New_York
Nice|43.70|7.27|Europe/Paris
Oslo|59.91|10.75|Europe/Oslo
Paris|48.86|2.35|Europe/Paris
Prague|50.08|14.44|Europe/Prague
Reykjavík|64.15|-21.94|Atlantic/Reykjavik
Rio de Janeiro|-22.91|-43.17|America/Sao_Paulo
Rome|41.90|12.50|Europe/Rome
San Francisco|37.77|-122.42|America/Los_Angeles
Santiago|-33.45|-70.67|America/Santiago
São Paulo|-23.55|-46.63|America/Sao_Paulo
Seattle|47.61|-122.33|America/Los_Angeles
Seoul|37.57|126.98|Asia/Seoul
Singapore|1.35|103.82|Asia/Singapore
Stockholm|59.33|18.07|Europe/Stockholm
Sydney|-33.87|151.21|Australia/Sydney
Taipei|25.03|121.57|Asia/Taipei
Tel Aviv|32.09|34.78|Asia/Jerusalem
Tokyo|35.68|139.69|Asia/Tokyo
Toronto|43.65|-79.38|America/Toronto
Vancouver|49.28|-123.12|America/Vancouver
Vienna|48.21|16.37|Europe/Vienna
Warsaw|52.23|21.01|Europe/Warsaw
Washington|38.91|-77.04|America/New_York
Zürich|47.38|8.54|Europe/Zurich`.split('\n').map(l => { const [name, lat, lon, zone] = l.split('|'); return {name, lat: +lat, lon: +lon, zone}; });

// The moment in UTC, from the wall-clock time in the place's zone (so summer time is right on that date).
function momentAt(date, time, zone) {
  const [y, mo, d] = (date || '2000-01-01').split('-').map(Number), [h, mi] = (time || '00:00').split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const offset = t => {
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric',
        day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'}).formatToParts(new Date(t)).map(q => [q.type, q.value]));
      return Date.UTC(+parts.year, parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second) - t;
    } catch (e) { return 0; }
  };
  let t = wall - offset(wall);
  t = wall - offset(t);
  return t;
}
// Every star and constellation line as seen from the place: x right, y down, in units of the horizon's radius,
// stereographic so the figures keep their shapes. North is up and east is on the left, as when looking up.
function skyAt(pl, t, limit) {
  const d = t / 86400000 + 2440587.5 - 2451545.0;
  const lst = (280.46061837 + 360.98564736629 * d + pl.lon) % 360;
  const sl = Math.sin(pl.lat * D2R), cl = Math.cos(pl.lat * D2R);
  const project = (ra, dec) => {
    const H = (lst - ra) * D2R, dd = dec * D2R;
    const sa = sl * Math.sin(dd) + cl * Math.cos(dd) * Math.cos(H), alt = Math.asin(Math.max(-1, Math.min(1, sa)));
    const az = Math.atan2(-Math.cos(dd) * Math.sin(H), Math.sin(dd) * cl - Math.cos(dd) * sl * Math.cos(H));
    const r = Math.tan((Math.PI / 2 - alt) / 2);
    return [-r * Math.sin(az), -r * Math.cos(az), alt];
  };
  const stars = [];
  for (let k = 0; k < SKY.stars.length; k += 3) {
    if (SKY.stars[k + 2] > limit) break;
    const q = project(SKY.stars[k], SKY.stars[k + 1]);
    if (q[2] > 0) stars.push([q[0], q[1], SKY.stars[k + 2]]);
  }
  const lines = SKY.lines.map(l => { const out = []; for (let k = 0; k < l.length; k += 2) out.push(project(l[k], l[k + 1])); return out; });
  return {stars, lines, lst};
}

