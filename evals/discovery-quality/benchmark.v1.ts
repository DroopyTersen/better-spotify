import type { VibeBrief } from "../../app/spotify/playlistBuilder/vibeBrief";

export type DiscoveryEvalCase = {
  id: string;
  title: string;
  intent: string;
  knownArtists: string[];
  referenceVibeBrief: VibeBrief;
};

export const discoveryQualityCases: DiscoveryEvalCase[] = [
  {
    id: "weathered-indie-folk",
    title: "Weathered indie folk with forward motion",
    intent:
      "Find credible current and left-field artists without drifting into glossy folk-pop or arena rock.",
    knownArtists: ["Big Thief", "Waxahatchee", "Hovvdy", "Wednesday"],
    referenceVibeBrief: {
      source: {
        selectedArtists: ["Big Thief", "Waxahatchee"],
        selectedTracks: [],
        explicitInstructions:
          "Warm, weathered indie folk for a rural drive, but leave room for one surprising turn.",
      },
      profile: {
        summary: "Intimate indie folk with organic texture and steady momentum.",
        mood: ["warm", "restless", "intimate"],
        energy: "medium",
        tempoFeel: "Unhurried but continually moving.",
        genres: { include: ["indie folk", "alt-country"], avoid: ["arena rock"] },
        era: ["2020s"],
        positiveAnchors: ["conversational vocals", "weathered guitars"],
        vocals: "Close, human, and conversational.",
        instrumentation: ["acoustic guitar", "restrained live drums"],
        productionTexture: ["organic", "dry", "lightly rough-edged"],
        negativeConstraints: ["no glossy pop production", "no bombast"],
        arc: "Open gently, gain road-speed momentum, and land softly.",
      },
    },
  },
  {
    id: "dark-intimate-electronic",
    title: "Dark intimate electronic",
    intent:
      "Find shadowy electronic artists with human detail and harmonic depth, including non-obvious scene connections.",
    knownArtists: ["Fever Ray", "James Blake", "Burial", "Moderat"],
    referenceVibeBrief: {
      source: {
        selectedArtists: ["Bon Iver"],
        selectedTracks: [
          { name: "Blue Ridge Mountains", artist: "Fleet Foxes" },
        ],
        explicitInstructions:
          "Preserve intimacy and layered harmony, but make the actual sound dark electronic with no acoustic guitar.",
      },
      profile: {
        summary: "Shadowy electronic music with close human detail.",
        mood: ["dark", "intimate", "suspended"],
        energy: "dynamic",
        tempoFeel: "Patient pulses with occasional forward pressure.",
        genres: { include: ["art electronic", "ambient pop"], avoid: ["folk"] },
        era: ["2010s", "2020s"],
        positiveAnchors: ["layered harmony", "close-mic emotional detail"],
        vocals: "Sparse, intimate, or textural.",
        instrumentation: ["sub-bass", "processed voice", "granular percussion"],
        productionTexture: ["shadowy", "detailed", "spacious"],
        negativeConstraints: ["no acoustic guitar", "no festival drops"],
        arc: "Begin nearly weightless, deepen into a pulse, then dissolve.",
      },
    },
  },
  {
    id: "predawn-modern-jazz",
    title: "Predawn modern jazz",
    intent:
      "Find spacious, emotionally luminous modern jazz with trustworthy evidence and useful discoveries beyond obvious names.",
    knownArtists: ["Nala Sinephro", "Matthew Halsall", "Floating Points"],
    referenceVibeBrief: {
      source: {
        selectedArtists: [],
        selectedTracks: [],
        explicitInstructions:
          "Quiet devotional modern jazz for the hour before sunrise: mostly instrumental, spacious, patient, and never showy.",
      },
      profile: {
        summary: "Quiet, devotional modern jazz for the hour before sunrise.",
        mood: ["calm", "luminous", "contemplative"],
        energy: "low",
        tempoFeel: "Patient and spacious.",
        genres: { include: ["modern jazz", "spiritual jazz"], avoid: ["fusion"] },
        era: ["2020s"],
        positiveAnchors: ["acoustic detail", "restraint", "open space"],
        vocals: "Mostly instrumental.",
        instrumentation: ["piano", "soft horns", "upright bass"],
        productionTexture: ["natural", "airy", "quietly detailed"],
        negativeConstraints: ["no showy solos", "no cocktail-lounge cheer"],
        arc: "Start nearly still, warm gradually, and return to silence.",
      },
    },
  },
];
