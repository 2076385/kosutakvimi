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
    .trim();

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

const shouldIncludeRow = ({ name, dateText }) => {
  if (!name || !name.trim()) {
    return false;
  }

  if (!dateText || !dateText.trim()) {
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

    const type = cells[0].textContent || "";
    const nameCell = cells[1];
    const link = nameCell.querySelector("a");
    const name = link ? link.textContent : nameCell.textContent;
    const url = link ? link.href : null;
    const dateText = cells[2].textContent || "";
    const location = cells[3].textContent || "";
    const distances = cells[4].textContent || "";
    const notes = cells[5].textContent || "";

    if (!shouldIncludeRow({ name, dateText })) {
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
    const type = normalizeText(typeRaw);
    const name = nameLink.text || normalizeText(nameRaw);
    const url = nameLink.url;
    const dateText = normalizeText(dateTextRaw || "");
    const location = normalizeText(locationRaw || "");
    const distances = normalizeText(distancesRaw || "");
    const notes = normalizeText(notesRaw || "");

    if (!shouldIncludeRow({ name, dateText })) {
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
