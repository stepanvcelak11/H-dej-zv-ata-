// Vygeneruje img/world.svg – obrys pevnin ve Web Mercatoru (stejné zobrazení jako mapové dlaždice iNaturalistu).
// Data: Natural Earth (volné dílo) přes balíček world-atlas; použití:
//   node tools/make_worldmap.js <cesta k world-atlas/land-110m.json> <cesta k topojson-client>
const fs = require('fs');
const [, , landPath, topoPath] = process.argv;
const topojson = require(topoPath);
const topo = JSON.parse(fs.readFileSync(landPath, 'utf8'));
const land = topojson.feature(topo, topo.objects.land);
const S = 512;
const proj = ([lon, lat]) => {
  lat = Math.max(-85.0511, Math.min(85.0511, lat));
  const x = (lon + 180) / 360 * S;
  const y = (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2 * S;
  return [x.toFixed(1), y.toFixed(1)];
};
let d = '';
const ring = r => { d += 'M' + r.map(p => proj(p).join(',')).join('L') + 'Z'; };
for (const f of land.features) {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  polys.forEach(p => p.forEach(ring));
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}"><path d="${d}" fill="#c9bfa9"/></svg>`;
fs.writeFileSync(__dirname + '/../img/world.svg', svg);
console.log('img/world.svg', svg.length, 'B');
