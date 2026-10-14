// Draws the mascot and unit cover illustrations as SVG files in assets/img.
// Usage: node scripts/generate-art.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const C = { navy: '#1F3A68', red: '#E2554A', gold: '#F2B544', green: '#4E9A6F', sky: '#A9C7EA', cream: '#FBF7F0', ink: '#2B2B33', white: '#FFFFFF', brown: '#B9773F', pink: '#EE8FB4' };
const svg = (body, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">` +
  (bg ? `<rect width="120" height="120" rx="28" fill="${bg}"/>` : '') + body + `</svg>\n`;
const S = `stroke="${C.ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;

const covers = {
  greetings: svg(`
    <path d="M18 30h56a10 10 0 0 1 10 10v22a10 10 0 0 1-10 10H40l-14 12v-12h-8a10 10 0 0 1-10-10V40a10 10 0 0 1 10-10z" fill="${C.white}" ${S}/>
    <circle cx="32" cy="51" r="4" fill="${C.navy}"/><circle cx="46" cy="51" r="4" fill="${C.navy}"/><circle cx="60" cy="51" r="4" fill="${C.navy}"/>
    <path d="M70 62h34a8 8 0 0 1 8 8v16a8 8 0 0 1-8 8h-4v10l-12-10H70a8 8 0 0 1-8-8V70a8 8 0 0 1 8-8z" fill="${C.red}" ${S}/>
    <path d="M78 79l6 6 12-12" fill="none" stroke="${C.white}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`, '#DCE8F7'),
  intro: svg(`
    <rect x="16" y="32" width="88" height="60" rx="10" fill="${C.white}" ${S}/>
    <rect x="16" y="32" width="88" height="16" rx="8" fill="${C.red}" ${S}/>
    <circle cx="40" cy="70" r="12" fill="${C.gold}" ${S}/>
    <path d="M60 64h32M60 76h22" ${S}/>
    <rect x="52" y="24" width="16" height="14" rx="4" fill="${C.navy}" ${S}/>`, '#FCE3D6'),
  numbers: svg(`
    <rect x="12" y="44" width="30" height="34" rx="8" fill="${C.navy}" ${S}/>
    <rect x="45" y="32" width="30" height="46" rx="8" fill="${C.white}" ${S}/>
    <rect x="78" y="22" width="30" height="56" rx="8" fill="${C.red}" ${S}/>
    <path d="M24 56l4-3v18" stroke="${C.white}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M53 48q7-8 13 0t-13 20h14" stroke="${C.ink}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M86 38h12l-7 10q9 0 9 9t-9 9-11-5" stroke="${C.white}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 92h96" ${S}/>`, '#FFF0C9'),
  colors: svg(`
    <path d="M60 18c26 0 44 18 44 38 0 14-12 18-22 16-8-2-12 6-8 12 4 7-2 16-14 16-26 0-44-18-44-42s18-40 44-40z" fill="${C.white}" ${S}/>
    <circle cx="36" cy="50" r="8" fill="${C.red}"/><circle cx="56" cy="36" r="8" fill="${C.gold}"/>
    <circle cx="80" cy="42" r="8" fill="${C.green}"/><circle cx="34" cy="74" r="8" fill="${C.navy}"/>
    <circle cx="56" cy="88" r="7" fill="${C.pink}"/>`, '#E5F1E6'),
  family: svg(`
    <circle cx="36" cy="44" r="14" fill="${C.gold}" ${S}/><path d="M14 98c0-18 10-30 22-30s22 12 22 30" fill="${C.navy}" ${S}/>
    <circle cx="84" cy="44" r="14" fill="${C.brown}" ${S}/><path d="M62 98c0-18 10-30 22-30s22 12 22 30" fill="${C.red}" ${S}/>
    <circle cx="60" cy="68" r="10" fill="${C.pink}" ${S}/><path d="M44 104c0-12 7-20 16-20s16 8 16 20" fill="${C.green}" ${S}/>`, '#F7E1EA'),
  food: svg(`
    <g transform="rotate(-35 60 60)"><rect x="12" y="48" width="96" height="24" rx="12" fill="#E2A65E" ${S}/>
    <path d="M30 52l8 16M50 52l8 16M70 52l8 16M90 52l6 12" stroke="${C.cream}" stroke-width="3" stroke-linecap="round"/></g>
    <circle cx="88" cy="86" r="16" fill="${C.red}" ${S}/><path d="M88 70q2-8 8-10" ${S} fill="none"/>
    <path d="M90 68q8-6 12 0q-6 4-12 0z" fill="${C.green}" ${S}/>`, '#FFF0C9'),
  animals: svg(`
    <path d="M28 36l8 26h48l8-26-20 12H48z" fill="${C.ink}"/>
    <ellipse cx="60" cy="70" rx="34" ry="28" fill="#F0A85A" ${S}/>
    <path d="M30 50l-2-22 20 14M90 50l2-22-20 14" fill="#F0A85A" ${S}/>
    <ellipse cx="47" cy="66" rx="4" ry="6" fill="${C.ink}"/><ellipse cx="73" cy="66" rx="4" ry="6" fill="${C.ink}"/>
    <path d="M56 78l4 4 4-4z" fill="${C.pink}" ${S}/><path d="M60 82q-4 6-10 4M60 82q4 6 10 4" ${S} fill="none"/>
    <path d="M20 74h18M20 82l18-2M100 74H82M100 82l-18-2" stroke="${C.ink}" stroke-width="2" stroke-linecap="round"/>`, '#E5F1E6'),
  cafe: svg(`
    <path d="M26 50h58v22a24 24 0 0 1-24 24h-10a24 24 0 0 1-24-24z" fill="${C.white}" ${S}/>
    <path d="M84 56h6a10 10 0 0 1 0 20h-8" fill="none" ${S}/>
    <path d="M16 100h80" ${S}/><path d="M34 60h42" stroke="${C.red}" stroke-width="4"/>
    <path d="M44 40q-6-8 0-14t0-14M60 40q-6-8 0-14t0-14M76 40q-6-8 0-14" fill="none" stroke="${C.brown}" stroke-width="3" stroke-linecap="round"/>`, '#F3E5D8'),
  days: svg(`
    <rect x="18" y="26" width="84" height="76" rx="12" fill="${C.white}" ${S}/>
    <path d="M18 38a12 12 0 0 1 12-12h60a12 12 0 0 1 12 12v8H18z" fill="${C.red}" ${S}/>
    <path d="M40 18v16M80 18v16" ${S}/>
    ${[0,1,2,3].map(c=>[0,1,2].map(r=>`<rect x="${30+c*17}" y="${56+r*14}" width="10" height="8" rx="2" fill="${c===2&&r===1?C.gold:C.sky}"/>`).join('')).join('')}`, '#DCE8F7'),
  weather: svg(`
    <circle cx="74" cy="44" r="20" fill="${C.gold}" ${S}/>
    <path d="M74 12v6M100 22l-4 4M106 44h-6M48 22l4 4" ${S}/>
    <path d="M30 92a16 16 0 0 1 0-32 22 22 0 0 1 42-4 16 16 0 0 1 14 36z" fill="${C.white}" ${S}/>
    <path d="M40 104l-3 8M56 104l-3 8M72 104l-3 8" stroke="${C.navy}" stroke-width="3" stroke-linecap="round"/>`, '#DCE8F7'),
  body: svg(`
    <circle cx="60" cy="58" r="34" fill="#F5C9A4" ${S}/>
    <path d="M28 50q4-30 32-30t32 30q-10-14-32-14t-32 14z" fill="${C.brown}" ${S}/>
    <circle cx="48" cy="58" r="4" fill="${C.ink}"/><circle cx="72" cy="58" r="4" fill="${C.ink}"/>
    <path d="M60 62v8h-4" ${S} fill="none"/><path d="M48 78q12 10 24 0" ${S} fill="none"/>
    <ellipse cx="25" cy="62" rx="5" ry="8" fill="#F5C9A4" ${S}/><ellipse cx="95" cy="62" rx="5" ry="8" fill="#F5C9A4" ${S}/>`, '#FCE3D6'),
  home: svg(`
    <path d="M22 58L60 24l38 34" fill="none" ${S}/>
    <path d="M30 52v48h60V52L60 26z" fill="${C.white}" ${S}/>
    <path d="M22 58L60 24l38 34" fill="none" stroke="${C.red}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="52" y="72" width="16" height="28" rx="2" fill="${C.navy}" ${S}/>
    <rect x="36" y="62" width="12" height="12" rx="2" fill="${C.sky}" ${S}/><rect x="72" y="62" width="12" height="12" rx="2" fill="${C.sky}" ${S}/>
    <path d="M78 34v-10h8v16" fill="${C.brown}" ${S}/>`, '#E5F1E6'),
  'grammar-book': svg(`
    <path d="M60 30c-12-8-28-10-42-8v66c14-2 30 0 42 8z" fill="${C.white}" ${S}/>
    <path d="M60 30c12-8 28-10 42-8v66c-14-2-30 0-42 8z" fill="${C.white}" ${S}/>
    <path d="M60 30v66" ${S}/>
    <text x="26" y="66" font-family="Georgia, serif" font-size="22" font-weight="700" fill="${C.navy}">Aa</text>
    <path d="M70 48h22M70 58h22M70 68h16" stroke="${C.red}" stroke-width="4" stroke-linecap="round"/>`, '#E3EAF6'),
  'grammar-pencil': svg(`
    <rect x="18" y="24" width="62" height="78" rx="8" fill="${C.white}" ${S}/>
    <path d="M30 44h38M30 58h38M30 72h24" stroke="${C.sky}" stroke-width="4" stroke-linecap="round"/>
    <g transform="rotate(35 84 60)"><rect x="76" y="20" width="16" height="64" rx="3" fill="${C.gold}" ${S}/>
    <path d="M76 84l8 16 8-16z" fill="#F5C9A4" ${S}/><rect x="76" y="20" width="16" height="10" rx="3" fill="${C.red}" ${S}/></g>`, '#FFF0C9'),
  'grammar-puzzle': svg(`
    <path d="M22 22h32v10a8 8 0 1 0 16 0V22h28v32H88a8 8 0 1 0 0 16h10v28H22z" fill="${C.white}" ${S}/>
    <path d="M60 22v28h-10a8 8 0 1 0 0 16h10v32" fill="none" ${S}/>
    <path d="M22 60h28" ${S}/><path d="M70 60h28" ${S}/>
    <rect x="28" y="28" width="22" height="26" rx="4" fill="${C.red}" opacity=".85"/>
    <rect x="70" y="72" width="22" height="20" rx="4" fill="${C.navy}" opacity=".85"/>`, '#F7E1EA'),
  numbers2: svg(`
    <rect x="16" y="28" width="88" height="64" rx="12" fill="${C.navy}" ${S}/>
    <text x="60" y="72" text-anchor="middle" font-family="Georgia, serif" font-size="32" font-weight="700" fill="${C.white}">100</text>
    <circle cx="96" cy="30" r="12" fill="${C.gold}" ${S}/><path d="M91 30h10M96 25v10" stroke="${C.ink}" stroke-width="3" stroke-linecap="round"/>`, '#FFF0C9'),
  clock: svg(`
    <circle cx="60" cy="62" r="38" fill="${C.white}" ${S}/>
    ${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<circle cx="${(60 + 30 * Math.sin(a)).toFixed(1)}" cy="${(62 - 30 * Math.cos(a)).toFixed(1)}" r="${i % 3 ? 1.8 : 3}" fill="${C.ink}"/>`; }).join('')}
    <path d="M60 62V40M60 62l14 8" stroke="${C.navy}" stroke-width="5" stroke-linecap="round"/>
    <circle cx="60" cy="62" r="4" fill="${C.red}"/>
    <path d="M30 26l-8-6M90 26l8-6" ${S}/>`, '#DCE8F7'),
  airport: svg(`
    <path d="M14 96h92" ${S}/>
    <path d="M20 70l70-36c8-4 16 2 10 8L64 66l-6 24-8 4 0-20-22 10-6 10-6 2z" fill="${C.white}" ${S}/>
    <path d="M44 56l-14-14 8-4 22 10" fill="${C.sky}" ${S}/>
    <path d="M88 20c2 4 6 6 10 6" fill="none" stroke="${C.red}" stroke-width="3" stroke-linecap="round"/>
    <path d="M80 92l4-8 4 8M78 88h12" stroke="${C.red}" stroke-width="3" stroke-linecap="round" fill="none"/>`, '#DCE8F7'),
  grocery: svg(`
    <path d="M14 30h14l12 46h50l10-34H34" fill="none" ${S}/>
    <circle cx="46" cy="92" r="7" fill="${C.ink}"/><circle cx="84" cy="92" r="7" fill="${C.ink}"/>
    <circle cx="54" cy="36" r="9" fill="${C.red}" ${S}/><rect x="66" y="26" width="16" height="22" rx="4" fill="${C.white}" ${S}/>
    <path d="M72 26v-4" ${S}/><path d="M38 52h58" stroke="${C.green}" stroke-width="4" stroke-linecap="round"/>`, '#E5F1E6'),
  phone: svg(`
    <rect x="36" y="16" width="48" height="88" rx="10" fill="${C.navy}" ${S}/>
    <rect x="42" y="28" width="36" height="58" rx="4" fill="${C.white}"/>
    <circle cx="60" cy="96" r="3.5" fill="${C.white}"/>
    <path d="M50 46h20M50 56h14" stroke="${C.sky}" stroke-width="4" stroke-linecap="round"/>
    <path d="M90 36q8 8 0 16M96 30q14 14 0 28" fill="none" stroke="${C.red}" stroke-width="3" stroke-linecap="round"/>
    <rect x="48" y="66" width="24" height="12" rx="3" fill="${C.green}"/>`, '#FCE3D6'),
};

// Coco the rooster, wearing a beret.
const mascot = svg(`
  <path d="M86 70q22-6 26-30-14 6-20 2 6 12-8 22" fill="${C.navy}" ${S}/>
  <path d="M84 64q22 4 30-14-12 2-16-2 2 10-14 12" fill="${C.red}" ${S}/>
  <ellipse cx="60" cy="74" rx="34" ry="32" fill="${C.white}" ${S}/>
  <path d="M42 30q-4-12 6-12 0-8 8-6 4-8 12 0 8-2 6 10" fill="${C.red}" ${S}/>
  <ellipse cx="58" cy="30" rx="24" ry="9" fill="${C.navy}" ${S}/><path d="M58 21v-6" ${S}/>
  <circle cx="50" cy="56" r="4.5" fill="${C.ink}"/><circle cx="51.5" cy="54.5" r="1.4" fill="${C.white}"/>
  <path d="M30 60l-12 6 12 6z" fill="${C.gold}" ${S}/>
  <path d="M30 72q-4 10 4 14 4-6 0-14" fill="${C.red}" ${S}/>
  <circle cx="44" cy="66" r="5" fill="${C.pink}" opacity=".6"/>
  <path d="M66 76q10 10 22 0" fill="none" ${S}/>
  <path d="M52 104v10M68 104v10M48 114h8M64 114h8" stroke="${C.gold}" stroke-width="4" stroke-linecap="round"/>`);

mkdirSync(join(root, 'assets/img/units'), { recursive: true });
for (const [name, content] of Object.entries(covers)) writeFileSync(join(root, `assets/img/units/${name}.svg`), content);
writeFileSync(join(root, 'assets/img/mascot.svg'), mascot);
writeFileSync(join(root, 'assets/img/icon.svg'), svg(mascot.replace(/^<svg[^>]*>|<\/svg>\n$/g, ''), C.cream));
console.log(`Art: ${Object.keys(covers).length} covers + mascot + icon written.`);
