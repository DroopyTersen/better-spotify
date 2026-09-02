import type {
  BuildPlaylistTrack,
  NewStuffAmount,
} from "../../app/spotify/playlistBuilder/playlistBuilder.types";
import type { PlaylistEvalCase } from "./schemas";

type TrackSeed = {
  id: string;
  name: string;
  artist: string;
};

type CaseSeed = {
  id: string;
  title: string;
  split?: PlaylistEvalCase["split"];
  rationale: string;
  vibe: string;
  mustHave: string[];
  mustAvoid: string[];
  arc?: string;
  novelty: string;
  selectedTracks?: TrackSeed[];
  selectedArtists?: string[];
  familiar?: TrackSeed[];
  newSongs?: TrackSeed[];
  instructions?: string;
  newStuffAmount: NewStuffAmount;
  songCount?: number;
  allowUnresolved?: boolean;
};

export const playlistQualityCases: PlaylistEvalCase[] = [
  playlistCase({
    id: "artist-only-indie-folk",
    title: "Artist-only warm indie folk",
    rationale:
      "Checks whether artist selections alone provide enough evidence for a coherent vibe.",
    vibe:
      "Weathered, intimate indie folk with warm guitars, conversational vocals, and enough forward motion for a long rural drive.",
    mustHave: ["Organic texture", "Emotional intimacy", "Steady momentum"],
    mustAvoid: ["Glossy pop production", "Arena-rock bombast"],
    novelty: "A small number of adjacent artists without losing the anchors",
    selectedArtists: ["Big Thief", "Waxahatchee"],
    familiar: [
      seed("artist-f1", "Not", "Big Thief"),
      seed("artist-f2", "Vampire Empire", "Big Thief"),
      seed("artist-f3", "Fire", "Waxahatchee"),
      seed("artist-f4", "Right Back to It", "Waxahatchee"),
      seed("artist-f5", "Lilacs", "Waxahatchee"),
      seed("artist-f6", "Simulation Swarm", "Big Thief"),
      seed("artist-f7", "Blue", "Waxahatchee"),
    ],
    newSongs: [
      seed("artist-n1", "True Love", "Hovvdy"),
      seed("artist-n2", "Red Bird Pt. 2 (Morning)", "Florist"),
      seed("artist-n3", "Chosen to Deserve", "Wednesday"),
      seed("artist-n4", "She's Leaving You", "MJ Lenderman"),
      seed("artist-n5", "Something to Believe", "Weyes Blood"),
      seed("artist-n6", "Highway Queen", "Nikki Lane"),
    ],
    newStuffAmount: "sprinkle",
  }),
  playlistCase({
    id: "track-only-neon-drive",
    title: "Track-only neon night drive",
    rationale:
      "Checks whether selected tracks can define a vibe without selected artists or prose instructions.",
    vibe:
      "Nocturnal synth-pop: neon reflections, propulsive bass, cool vocals, and a slightly dangerous cinematic glow.",
    mustHave: ["Night-drive momentum", "Synth-led production", "Cool restraint"],
    mustAvoid: ["Acoustic singer-songwriter tracks", "Festival EDM drops"],
    arc: "Start sleek, accelerate through the middle, and finish in a hazy afterglow",
    novelty: "Half fixture-new tracks that feel naturally adjacent to the two anchors",
    selectedTracks: [
      seed("track-f1", "Midnight City", "M83"),
      seed("track-f2", "Under Your Spell", "Desire"),
    ],
    familiar: [
      seed("track-f3", "Kim & Jessie", "M83"),
      seed("track-f4", "Wait", "M83"),
      seed("track-f5", "If I Can't Hold You", "Desire"),
      seed("track-f6", "Mirroir mirroir", "Desire"),
    ],
    newSongs: [
      seed("track-n1", "Sunset", "The Midnight"),
      seed("track-n2", "A Real Hero", "College"),
      seed("track-n3", "Propagation", "Com Truise"),
      seed("track-n4", "Fire for You", "Cannons"),
      seed("track-n5", "Killshot", "Magdalena Bay"),
      seed("track-n6", "Shadow", "Chromatics"),
    ],
    newStuffAmount: "half",
  }),
  playlistCase({
    id: "mixed-indie-dance",
    title: "Mixed-anchor indie dance floor",
    rationale:
      "Exercises selected tracks, selected artists, and narrowing instructions together.",
    vibe:
      "A sweaty, urgent indie-dance floor with live-drum energy, wiry guitars, and synths that stay human rather than polished.",
    mustHave: ["Escalating physical energy", "Tension and release", "A human live-band edge"],
    mustAvoid: ["Acoustic ballads", "Big-room EDM", "Passive background music"],
    arc: "Open with tension, hit a crowded-room peak, and end exhilarated rather than exhausted",
    novelty: "A balanced mix of anchors and credible adjacent discoveries",
    selectedTracks: [seed("dance-f1", "All My Friends", "LCD Soundsystem")],
    selectedArtists: ["Yeah Yeah Yeahs"],
    familiar: [
      seed("dance-f2", "Dance Yrself Clean", "LCD Soundsystem"),
      seed("dance-f3", "Heads Will Roll", "Yeah Yeah Yeahs"),
      seed("dance-f4", "Zero", "Yeah Yeah Yeahs"),
      seed("dance-f5", "Tribulations", "LCD Soundsystem"),
    ],
    newSongs: [
      seed("dance-n1", "NY Excuse", "Soulwax"),
      seed("dance-n2", "Over and Over", "Hot Chip"),
      seed("dance-n3", "House of Jealous Lovers", "The Rapture"),
      seed("dance-n4", "Holiday", "Confidence Man"),
      seed("dance-n5", "The Wall", "Yard Act"),
      seed("dance-n6", "Tournament", "Nation of Language"),
    ],
    instructions:
      "Make it feel like a tiny club at 1 a.m.: urgent and communal, with no acoustic comedown.",
    newStuffAmount: "half",
  }),
  playlistCase({
    id: "instructions-only-predawn-jazz",
    title: "Instructions-only predawn jazz",
    rationale:
      "Verifies that a sparse request can be judged fairly when the model must use music knowledge and leave IDs unresolved.",
    vibe:
      "Quiet, devotional modern jazz for the hour before sunrise: spacious, patient, mostly instrumental, and emotionally luminous.",
    mustHave: ["Space and patience", "Acoustic detail", "Predawn calm"],
    mustAvoid: ["Showy fusion solos", "Vocal standards", "Cocktail-lounge cheer"],
    arc: "Nearly still at the opening, gradually warmer, then return to silence",
    novelty: "All selections come from music knowledge; unresolved IDs are expected",
    instructions:
      "Quiet devotional modern jazz for the hour before sunrise. Mostly instrumental, spacious, patient, and never showy.",
    newStuffAmount: "all",
    allowUnresolved: true,
  }),
  playlistCase({
    id: "conflicting-dark-electronic",
    title: "Conflicting anchors redirected toward dark electronic",
    rationale:
      "Tests whether explicit instructions can redirect acoustic anchors without discarding their intimacy and harmony.",
    vibe:
      "Dark, close-mic electronic music that preserves the anchors' intimacy and layered harmony while removing their acoustic surface.",
    mustHave: ["Shadowy electronic texture", "Intimate vocals or human detail", "Subtle harmonic richness"],
    mustAvoid: ["Acoustic guitar", "Campfire folk", "Bright festival production"],
    novelty: "Only fixture-new artists; familiar selections are style references",
    selectedTracks: [seed("conflict-f1", "Blue Ridge Mountains", "Fleet Foxes")],
    selectedArtists: ["Bon Iver"],
    familiar: [
      seed("conflict-f2", "Holocene", "Bon Iver"),
      seed("conflict-f3", "33 GOD", "Bon Iver"),
      seed("conflict-f4", "Mykonos", "Fleet Foxes"),
    ],
    newSongs: [
      seed("conflict-n1", "Bad Kingdom", "Moderat"),
      seed("conflict-n2", "Archangel", "Burial"),
      seed("conflict-n3", "The Highest Flood", "Forest Swords"),
      seed("conflict-n4", "Keep the Streets Empty for Me", "Fever Ray"),
      seed("conflict-n5", "Retrograde", "James Blake"),
      seed("conflict-n6", "Luminous Beings", "Jon Hopkins"),
      seed("conflict-n7", "On", "Kelly Lee Owens"),
      seed("conflict-n8", "Anvil", "Lorn"),
    ],
    instructions:
      "Use the anchors only for intimacy and layered harmony. Make the actual playlist dark electronic with no acoustic guitar.",
    newStuffAmount: "all",
  }),
  playlistCase({
    id: "instrumental-energy-arc",
    title: "Instrumental electronic energy arc",
    rationale:
      "Makes ordering observable by requesting a restrained opening, a clear peak, and a gentle landing.",
    vibe:
      "Detailed instrumental electronic music with tactile percussion, melodic patience, and a cinematic sense of motion.",
    mustHave: ["Instrumental focus", "Textural continuity", "One unmistakable peak"],
    mustAvoid: ["Pop vocals", "Abrupt genre changes", "Peak energy in the opening"],
    arc: "Two restrained openers, a steady four-track climb, one peak, and a weightless final landing",
    novelty: "Half fixture-new tracks woven through familiar anchors",
    selectedTracks: [seed("arc-f1", "A Walk", "Tycho")],
    selectedArtists: ["Jon Hopkins"],
    familiar: [
      seed("arc-f2", "Open Eye Signal", "Jon Hopkins"),
      seed("arc-f3", "Abandon Window", "Jon Hopkins"),
      seed("arc-f4", "Awake", "Tycho"),
      seed("arc-f5", "Hours", "Tycho"),
    ],
    newSongs: [
      seed("arc-n1", "Recovery", "Rival Consoles"),
      seed("arc-n2", "Order from Chaos", "Max Cooper"),
      seed("arc-n3", "Looped", "Kiasmos"),
      seed("arc-n4", "Silhouettes (I, II & III)", "Floating Points"),
      seed("arc-n5", "Says", "Nils Frahm"),
      seed("arc-n6", "Two Thousand and Seventeen", "Four Tet"),
    ],
    instructions:
      "Sequence an instrumental arc: restrained opening, steady climb, one unmistakable peak, then a weightless landing.",
    newStuffAmount: "half",
  }),
  playlistCase({
    id: "familiar-only-slow-groove",
    title: "Familiar-only slow groove",
    split: "holdout",
    rationale:
      "Holdout control for the none setting and for coherence across two compatible but distinct anchors.",
    vibe:
      "Unhurried, elegant groove music with warm bass, negative space, and understated sensuality.",
    mustHave: ["Slow groove", "Warm bass", "Elegant restraint"],
    mustAvoid: ["Aggressive percussion", "Rock distortion", "Novel tracks"],
    novelty: "No fixture-new tracks",
    selectedArtists: ["Khruangbin", "Sade"],
    familiar: [
      seed("none-f1", "Friday Morning", "Khruangbin"),
      seed("none-f2", "August 10", "Khruangbin"),
      seed("none-f3", "White Gloves", "Khruangbin"),
      seed("none-f4", "Time (You and I)", "Khruangbin"),
      seed("none-f5", "No Ordinary Love", "Sade"),
      seed("none-f6", "Kiss of Life", "Sade"),
      seed("none-f7", "Cherish the Day", "Sade"),
      seed("none-f8", "Like a Tattoo", "Sade"),
      seed("none-f9", "Paradise", "Sade"),
    ],
    newSongs: [
      seed("none-n1", "First Class", "Hania Rani"),
      seed("none-n2", "Tadow", "Masego"),
    ],
    instructions:
      "Keep it familiar, unhurried, warm, and elegant. Favor space over density.",
    newStuffAmount: "none",
  }),
  playlistCase({
    id: "all-new-intimate-songwriters",
    title: "All-new intimate songwriters",
    split: "holdout",
    rationale:
      "Holdout case for new-artist exposure where a familiar selected track is reference-only.",
    vibe:
      "Intimate, literate indie songwriting with dry-room detail, emotional specificity, and restrained arrangements.",
    mustHave: ["Close emotional detail", "Distinctive writing", "Restrained arrangement"],
    mustAvoid: ["Arena crescendos", "Generic coffeehouse folk", "The selected familiar artist"],
    novelty: "Every track comes from fixture-new artists",
    selectedTracks: [seed("all-f1", "Motion Sickness", "Phoebe Bridgers")],
    familiar: [
      seed("all-f2", "Garden Song", "Phoebe Bridgers"),
      seed("all-f3", "Scott Street", "Phoebe Bridgers"),
    ],
    newSongs: [
      seed("all-n1", "Song for Nick Drake", "Skullcrusher"),
      seed("all-n2", "Any Other Way", "Tomberlin"),
      seed("all-n3", "Hard Drive", "Cassandra Jenkins"),
      seed("all-n4", "Cool Dry Place", "Katy Kirby"),
      seed("all-n5", "The Bug Collector", "Haley Heynderickx"),
      seed("all-n6", "Aquamarine", "Hand Habits"),
      seed("all-n7", "Bad Dreams", "Teddy Geiger"),
      seed("all-n8", "Hannah Sun", "Lomelda"),
      seed("all-n9", "Golden Age", "Ethel Cain"),
    ],
    instructions:
      "Use the selected track only as a writing and intimacy reference. Recommend different artists, keep arrangements restrained, and avoid arena-sized crescendos.",
    newStuffAmount: "all",
  }),
];

function playlistCase(seedCase: CaseSeed): PlaylistEvalCase {
  const selectedTracks = seedCase.selectedTracks ?? [];
  const familiar = seedCase.familiar ?? [];
  const newSongs = seedCase.newSongs ?? [];
  const formData = {
    customInstructions: seedCase.instructions,
    newStuffAmount: seedCase.newStuffAmount,
    songCount: seedCase.songCount ?? 8,
  };

  return {
    id: seedCase.id,
    title: seedCase.title,
    split: seedCase.split ?? "development",
    rationale: seedCase.rationale,
    intent: {
      vibe: seedCase.vibe,
      mustHave: seedCase.mustHave,
      mustAvoid: seedCase.mustAvoid,
      arc: seedCase.arc,
      novelty: seedCase.novelty,
    },
    allowUnresolved: seedCase.allowUnresolved ?? false,
    input: {
      formData,
      data: {
        selectedTracks: selectedTracks.map((track) => ({
          track_id: track.id,
          track_name: track.name,
          artist_id: artistId(track.artist),
          artist_name: track.artist,
        })),
        selectedArtists: (seedCase.selectedArtists ?? []).map((name) => ({
          artist_id: artistId(name),
          artist_name: name,
        })),
        familiarSongsPool: {
          specifiedTracks: selectedTracks.map(buildTrack),
          topTracks: familiar.filter((_, index) => index % 2 === 0).map(buildTrack),
          likedTracks: familiar.filter((_, index) => index % 2 === 1).map(buildTrack),
          artistCatalogs: [],
          recentlyPlayedTracks: [],
        },
        recommendedArtists: uniqueArtists(newSongs),
        formData,
      },
      newSongs: newSongs.map(buildTrack),
    },
  };
}

function seed(id: string, name: string, artist: string): TrackSeed {
  return { id, name, artist };
}

function buildTrack(track: TrackSeed): BuildPlaylistTrack {
  return {
    id: track.id,
    name: track.name,
    artist_id: artistId(track.artist),
    artist_name: track.artist,
    popularity: null,
  };
}

function uniqueArtists(tracks: TrackSeed[]) {
  return Array.from(new Set(tracks.map(({ artist }) => artist))).map((name) => ({
    artist_id: artistId(name),
    artist_name: name,
  }));
}

function artistId(name: string): string {
  return `artist-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
