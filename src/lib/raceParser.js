const DATE_REGEX = /(\d{1,2})(?:-(\d{1,2}))?\.(\d{1,2})\.(\d{4})/;

const MONTH_NAMES_REGEX =
  /(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)/i;

const SPACE_REGEX = /\s+/g;

const stripMarkdownImages = (text) =>
  text.replace(/!\[[^\]]*\]\([^)]*\)/g, "");

const stripMarkdownLinks = (text) =>
  text.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");

const stripMarkdownFormatting = (text) =>
  text
    .replace(/~~/g, "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/\*/g, "")
    .replace(/_/g, "")
    .replace(/`/g, "");

const normalizeText = (text) =>
  stripMarkdownFormatting(
    stripMarkdownLinks(stripMarkdownImages(text || ""))
  )
    .replace(SPACE_REGEX, " ")
    .trim();

const toComparable = (value) =>
  (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .trim();

const TYPE_KEYS = {
  road: "road",
  trail: "trail",
  bike: "bike",
  swim: "swim",
  orienteering: "orienteering",
};

const TYPE_TEXT_RULES = [
  { regex: /\u{1F6E3}/u, key: TYPE_KEYS.road },
  { regex: /[\u{1F333}\u{1F30B}]/u, key: TYPE_KEYS.trail },
  { regex: /\u{1F6B5}/u, key: TYPE_KEYS.bike },
  { regex: /\u{1F3CA}/u, key: TYPE_KEYS.swim },
  { regex: /\u{1F9ED}/u, key: TYPE_KEYS.orienteering },
];

const extractEmojiCodeFromUrl = (value) => {
  if (!value) {
    return "";
  }

  const match = value.match(/([0-9a-fA-F-]+)(?:\.\w+)?$/);
  return match ? match[1].toLowerCase() : "";
};

const matchTypeKeyFromEmojiCode = (code) => {
  if (!code) {
    return "";
  }

  if (code.startsWith("1f6e3")) {
    return TYPE_KEYS.road;
  }
  if (code.startsWith("1f333") || code.startsWith("1f30b")) {
    return TYPE_KEYS.trail;
  }
  if (code.startsWith("1f6b5")) {
    return TYPE_KEYS.bike;
  }
  if (code.startsWith("1f3ca")) {
    return TYPE_KEYS.swim;
  }
  if (code.startsWith("1f9ed")) {
    return TYPE_KEYS.orienteering;
  }

  return "";
};

const matchTypeKeyFromText = (value) => {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }

  for (const rule of TYPE_TEXT_RULES) {
    if (rule.regex.test(text)) {
      return rule.key;
    }
  }

  const normalized = toComparable(text);
  if (normalized.includes("yol")) {
    return TYPE_KEYS.road;
  }
  if (normalized.includes("patika") || normalized.includes("dag")) {
    return TYPE_KEYS.trail;
  }
  if (
    normalized.includes("bisiklet") ||
    normalized.includes("bike") ||
    normalized.includes("cycling")
  ) {
    return TYPE_KEYS.bike;
  }
  if (normalized.includes("yuzme") || normalized.includes("swim")) {
    return TYPE_KEYS.swim;
  }
  if (normalized.includes("oryantiring") || normalized.includes("macera")) {
    return TYPE_KEYS.orienteering;
  }

  return "";
};

const extractTypeKeyFromImageUrls = (urls) => {
  if (!urls || !urls.length) {
    return "";
  }

  for (const url of urls) {
    const code = extractEmojiCodeFromUrl(url);
    const key = matchTypeKeyFromEmojiCode(code);
    if (key) {
      return key;
    }
  }

  return "";
};

const resolveTypeKey = ({ text, imageUrls = [], imageAlts = [] }) => {
  const fromText = matchTypeKeyFromText(text);
  if (fromText) {
    return fromText;
  }

  for (const alt of imageAlts) {
    const fromAlt = matchTypeKeyFromText(alt);
    if (fromAlt) {
      return fromAlt;
    }
  }

  const fromImages = extractTypeKeyFromImageUrls(imageUrls);
  if (fromImages) {
    return fromImages;
  }

  return "";
};

const extractMarkdownImageUrls = (text) => {
  if (!text) {
    return [];
  }

  const urls = [];
  const regex = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match = regex.exec(text);

  while (match) {
    urls.push(match[1]);
    match = regex.exec(text);
  }

  return urls;
};

const extractFirstLink = (text) => {
  const match = text.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (!match) {
    return { text: normalizeText(text), url: null };
  }

  return {
    text: normalizeText(match[1]),
    url: match[2],
  };
};

const extractDateStart = (dateText) => {
  const match = dateText.match(DATE_REGEX);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[3]);
  const year = Number(match[4]);

  if (!day || !month || !year) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
};

const slugify = (value) =>
  (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const buildId = (name, dateText, location) =>
  [name, dateText, location].map(slugify).filter(Boolean).join("-");

const buildRace = ({ type, name, dateText, location, distances, notes, url }) => {
  const cleanDateText = normalizeText(dateText);
  const cleanLocation = normalizeText(location);

  return {
    id: buildId(name, cleanDateText, cleanLocation),
    type: normalizeText(type),
    name: normalizeText(name),
    dateText: cleanDateText,
    dateStart: extractDateStart(cleanDateText),
    location: cleanLocation,
    distances: normalizeText(distances),
    notes: normalizeText(notes),
    url: url || null,
  };
};

const isHeaderRow = ({ type, name, dateText }) => {
  const typeLabel = toComparable(type);
  const nameLabel = toComparable(name);
  const dateLabel = toComparable(dateText);

  if (typeLabel === "yaris tipi" && nameLabel === "yaris adi") {
    return true;
  }

  if (nameLabel === "yaris adi" && dateLabel === "tarih") {
    return true;
  }

  return false;
};

const shouldIncludeRow = ({ type, name, dateText }) => {
  if (!name || !name.trim()) {
    return false;
  }

  if (!dateText || !dateText.trim()) {
    return false;
  }

  if (isHeaderRow({ type, name, dateText })) {
    return false;
  }

  return true;
};

const sortRaces = (races) =>
  races
    .slice()
    .sort((a, b) => {
      if (a.dateStart && b.dateStart) {
        return a.dateStart.localeCompare(b.dateStart);
      }

      if (a.dateStart) {
        return -1;
      }

      if (b.dateStart) {
        return 1;
      }

      return a.name.localeCompare(b.name);
    })
    .filter((race) => race.name && race.dateText);

export const parseHtmlCalendar = (html) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const table = doc.querySelector("#tablepress-1");

  if (!table) {
    return [];
  }

  const rows = Array.from(table.querySelectorAll("tbody tr"));
  const races = [];

  rows.forEach((row) => {
    const cells = Array.from(row.querySelectorAll("td"));
    if (cells.length < 6) {
      return;
    }

    const typeCell = cells[0];
    const typeKey = resolveTypeKey({
      text: typeCell.textContent || "",
      imageUrls: Array.from(typeCell.querySelectorAll("img")).map((img) =>
        img.getAttribute("src")
      ),
      imageAlts: Array.from(typeCell.querySelectorAll("img")).map((img) =>
        img.getAttribute("alt")
      ),
    });
    const type = typeKey || typeCell.textContent || "";
    const nameCell = cells[1];
    const link = nameCell.querySelector("a");
    const name = link ? link.textContent : nameCell.textContent;
    const url = link ? link.href : null;
    const dateText = cells[2].textContent || "";
    const location = cells[3].textContent || "";
    const distances = cells[4].textContent || "";
    const notes = cells[5].textContent || "";

    if (!shouldIncludeRow({ type, name, dateText })) {
      return;
    }

    races.push(
      buildRace({
        type,
        name,
        dateText,
        location,
        distances,
        notes,
        url,
      })
    );
  });

  return sortRaces(races);
};

const extractMarkdownRows = (markdown) => {
  const lines = markdown.split(/\r?\n/).map((line) => line.trim());
  const rows = [];

  lines.forEach((line) => {
    if (!line.startsWith("|")) {
      return;
    }

    if (line.includes("---")) {
      return;
    }

    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 7) {
      return;
    }

    const columns = parts.slice(1, -1);
    if (columns.length < 6) {
      return;
    }

    if (
      toComparable(columns[0]) === "yaris tipi" ||
      toComparable(columns[1]) === "yaris adi"
    ) {
      return;
    }

    rows.push(columns.slice(0, 6));
  });

  return rows;
};

export const parseMarkdownCalendar = (markdown) => {
  const rows = extractMarkdownRows(markdown);
  const races = [];

  rows.forEach((columns) => {
    const [typeRaw, nameRaw, dateTextRaw, locationRaw, distancesRaw, notesRaw] =
      columns;

    const nameLink = extractFirstLink(nameRaw || "");
    const typeKey = resolveTypeKey({
      text: typeRaw || "",
      imageUrls: extractMarkdownImageUrls(typeRaw || ""),
    });
    const type = typeKey || normalizeText(typeRaw);
    const name = nameLink.text || normalizeText(nameRaw);
    const url = nameLink.url;
    const dateText = normalizeText(dateTextRaw || "");
    const location = normalizeText(locationRaw || "");
    const distances = normalizeText(distancesRaw || "");
    const notes = normalizeText(notesRaw || "");

    if (!shouldIncludeRow({ type, name, dateText })) {
      return;
    }

    const race = buildRace({
      type,
      name,
      dateText,
      location,
      distances,
      notes,
      url,
    });

    races.push(race);
  });

  return sortRaces(races);
};

export const getDateLabel = (race) => {
  if (race.dateStart) {
    return race.dateText;
  }

  if (MONTH_NAMES_REGEX.test(race.dateText)) {
    return race.dateText;
  }

  return race.dateText || "Tarih belirtilmedi";
};

export const toDateValue = (dateStart) => {
  if (!dateStart) {
    return null;
  }

  const date = new Date(`${dateStart}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};
