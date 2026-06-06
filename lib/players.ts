// Player pool generated from public World Cup 2026 squad pages. Player photos
// prefer static cached Wikimedia images and fall back to local SVG caricatures.
import { GENERATED_PLAYERS } from "./generated/player-data";
import { PLAYER_PHOTOS } from "./generated/player-photos";

export type Player = {
  id: string;
  name: string;
  zh: string;
  team: string; // team code
  number: number;
  position: "GK" | "DF" | "MF" | "FW";
  age: number;
  club: string;
  rating: number; // 0-10 tournament form rating
  photo?: string;
  styleTags: string[];
  // radar attributes 0-100: pace, shooting, passing, dribbling, defending, physical
  attrs: [number, number, number, number, number, number];
  stats: { apps: number; goals: number; assists: number; xg: number };
};

export const PLAYERS: Player[] = GENERATED_PLAYERS;

export function playerById(id: string): Player | undefined {
  return PLAYERS.find((p) => p.id === id);
}
export function playersByTeam(code: string): Player[] {
  return PLAYERS.filter((p) => p.team === code);
}
export function playerPhoto(p: Player): string {
  return PLAYER_PHOTOS[p.id] ?? p.photo ?? cartoonPortrait(p);
}

type PortraitConfig = {
  skin: string;
  hair: string;
  shirt: string;
  accent: string;
  hairStyle: "crop" | "fade" | "curls" | "long" | "slick";
  beard?: boolean;
  label: string;
};

const PORTRAITS: Record<string, PortraitConfig> = {
  "Lionel Messi": { skin: "#d79a68", hair: "#3b2418", shirt: "#6bd8ff", accent: "#ffffff", hairStyle: "crop", beard: true, label: "10" },
  "Kylian Mbappé": { skin: "#7b4a32", hair: "#171717", shirt: "#284dff", accent: "#ff3b3b", hairStyle: "fade", label: "10" },
  "Lamine Yamal": { skin: "#a86a43", hair: "#171717", shirt: "#d62633", accent: "#243dff", hairStyle: "curls", label: "19" },
  "Jude Bellingham": { skin: "#6f412c", hair: "#151515", shirt: "#ffffff", accent: "#d92626", hairStyle: "curls", label: "10" },
  "Cristiano Ronaldo": { skin: "#c98557", hair: "#171717", shirt: "#cc223a", accent: "#1f9b57", hairStyle: "slick", label: "7" },
  "Erling Haaland": { skin: "#e1b184", hair: "#f4d56f", shirt: "#77c7ff", accent: "#ffffff", hairStyle: "long", label: "9" },
  "Vinícius Júnior": { skin: "#5b3325", hair: "#111111", shirt: "#ffe167", accent: "#1e9f54", hairStyle: "fade", label: "7" },
  "Kevin De Bruyne": { skin: "#e0a473", hair: "#c56a2d", shirt: "#d72828", accent: "#ffe45c", hairStyle: "crop", beard: true, label: "17" },
};

function cartoonPortrait(player: Player): string {
  const c = PORTRAITS[player.name] ?? {
    skin: "#c98557",
    hair: "#222222",
    shirt: "#27f58a",
    accent: "#13e0c4",
    hairStyle: "crop" as const,
    label: String(player.number),
  };
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <radialGradient id="bg" cx="45%" cy="30%" r="70%">
          <stop offset="0" stop-color="#153143"/>
          <stop offset="1" stop-color="#07121b"/>
        </radialGradient>
        <linearGradient id="shirt" x1="0" x2="1">
          <stop offset="0" stop-color="${c.shirt}"/>
          <stop offset="1" stop-color="${c.accent}"/>
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="34" fill="url(#bg)"/>
      <path d="M22 126c10-27 31-42 58-42s48 15 58 42v34H22v-34z" fill="url(#shirt)"/>
      <path d="M48 125h64" stroke="#07121b" stroke-opacity=".35" stroke-width="8"/>
      <text x="80" y="136" text-anchor="middle" font-family="Arial Black, Arial" font-size="24" fill="#07121b" opacity=".72">${c.label}</text>
      <circle cx="80" cy="68" r="39" fill="${c.skin}"/>
      ${hair(c)}
      <path d="M54 78c8 8 44 8 52 0" stroke="#2b1711" stroke-width="4" stroke-linecap="round" opacity=".26"/>
      <circle cx="66" cy="68" r="4" fill="#121212"/>
      <circle cx="94" cy="68" r="4" fill="#121212"/>
      <path d="M58 58c8-5 15-4 21 0M84 58c8-5 15-4 21 0" stroke="${c.hair}" stroke-width="4" stroke-linecap="round"/>
      <path d="M72 82c5 3 12 3 17 0" stroke="#21110e" stroke-width="4" stroke-linecap="round"/>
      ${c.beard ? '<path d="M56 84c6 18 42 18 48 0 0 21-48 21-48 0z" fill="#3b2418" opacity=".62"/>' : ""}
      <path d="M30 30h100" stroke="#27f58a" stroke-opacity=".2"/>
      <path d="M22 112h116" stroke="#27f58a" stroke-opacity=".16"/>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function hair(c: PortraitConfig): string {
  if (c.hairStyle === "fade") {
    return `<path d="M44 67c2-31 25-43 50-39 20 4 28 18 24 39-15-16-48-18-74 0z" fill="${c.hair}"/>
      <path d="M48 52c18-14 44-14 62 0" stroke="#27f58a" stroke-opacity=".18" stroke-width="3"/>`;
  }
  if (c.hairStyle === "curls") {
    return Array.from({ length: 9 }, (_, i) => {
      const x = 45 + i * 8;
      const y = i % 2 ? 34 : 31;
      return `<circle cx="${x}" cy="${y}" r="12" fill="${c.hair}"/>`;
    }).join("") + `<path d="M43 54c12-23 60-26 75 2-22-9-50-10-75-2z" fill="${c.hair}"/>`;
  }
  if (c.hairStyle === "long") {
    return `<path d="M42 56c2-28 19-42 42-42 26 0 42 18 38 50-5 26-8 44-2 58-20-10-19-32-17-49-20 7-39 5-61-17z" fill="${c.hair}"/>
      <path d="M55 40c14 10 32 13 56 12" stroke="#fff8b0" stroke-opacity=".25" stroke-width="5" stroke-linecap="round"/>`;
  }
  if (c.hairStyle === "slick") {
    return `<path d="M42 58c8-27 28-38 53-34 14 2 24 10 28 23-23-4-50-6-81 11z" fill="${c.hair}"/>
      <path d="M55 39c17 0 35 3 55 10" stroke="#ffffff" stroke-opacity=".16" stroke-width="4" stroke-linecap="round"/>`;
  }
  return `<path d="M42 62c4-28 23-40 48-37 17 2 29 12 33 30-25-10-54-9-81 7z" fill="${c.hair}"/>`;
}
