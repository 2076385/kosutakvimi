import { useEffect, useMemo, useState } from "react";
import {
  getDateLabel,
  parseHtmlCalendar,
  parseMarkdownCalendar,
  toDateValue,
} from "./lib/raceParser";
import teamRunboLogo from "./assets/team-runbo-logo.jpeg";

const SOURCE_URL = "https://teamrunbo.com/yaristakvimimiz/";
const MIRROR_URL = "https://r.jina.ai/http://teamrunbo.com/yaristakvimimiz/";

const STORAGE_KEY = "kosu-takvimi-registrations-v1";
const CACHE_KEY = "kosu-takvimi-cache-v1";
const CACHE_META_KEY = "kosu-takvimi-cache-meta-v1";
const START_DATE = "2026-01-01";
const TURKEY_CITIES = [
  "adana",
  "adiyaman",
  "afyonkarahisar",
  "agri",
  "amasya",
  "ankara",
  "antalya",
  "artvin",
  "aydin",
  "balikesir",
  "bilecik",
  "bingol",
  "bitlis",
  "bolu",
  "burdur",
  "bursa",
  "canakkale",
  "cankiri",
  "corum",
  "denizli",
  "diyarbakir",
  "edirne",
  "elazig",
  "erzincan",
  "erzurum",
  "eskisehir",
  "gaziantep",
  "giresun",
  "gumushane",
  "hakkari",
  "hatay",
  "isparta",
  "mersin",
  "istanbul",
  "izmir",
  "kars",
  "kastamonu",
  "kayseri",
  "kirklareli",
  "kirsehir",
  "kocaeli",
  "konya",
  "kutahya",
  "malatya",
  "manisa",
  "kahramanmaras",
  "mardin",
  "mugla",
  "mus",
  "nevsehir",
  "nigde",
  "ordu",
  "rize",
  "sakarya",
  "samsun",
  "siirt",
  "sinop",
  "sivas",
  "tekirdag",
  "tokat",
  "trabzon",
  "tunceli",
  "sanliurfa",
  "usak",
  "van",
  "yozgat",
  "zonguldak",
  "aksaray",
  "bayburt",
  "karaman",
  "kirikkale",
  "batman",
  "sirnak",
  "bartin",
  "ardahan",
  "igdir",
  "yalova",
  "karabuk",
  "kilis",
  "osmaniye",
  "duzce",
];

const loadJson = (key, fallback) => {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
};

const storeJson = (key, value) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Ignore storage errors (private mode, quota, etc.).
  }
};

const tryFetchCalendar = async (url, parser) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const text = await response.text();
  const races = parser(text);

  if (!races.length) {
    throw new Error("No races parsed");
  }

  return races;
};

const formatUpdatedAt = (value) => {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleString("tr-TR");
};

const sourceLabelMap = {
  direct: "teamrunbo.com (dogrudan)",
  mirror: "jina.ai aynasi",
  cache: "yerel onbellek",
};

const toComparable = (value) =>
  (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .trim();

const isTurkeyRace = (race) => {
  const location = toComparable(race.location);
  if (!location) {
    return false;
  }

  if (location.includes("turkiye") || location.includes("turkey")) {
    return true;
  }

  return TURKEY_CITIES.some((city) => location.includes(city));
};

const parseDistanceOptions = (distances) => {
  if (!distances) {
    return [];
  }

  const items = distances
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set(items));
};

const TYPE_LABELS = {
  road: "🛣️ Yol Koşuları",
  trail: "🌲🏔️ Patika Koşuları, Dağ Yarışları",
  bike: "🚵‍♂️ Bisiklet",
  swim: "🏊‍♀️ Yüzme",
  orienteering: "🧭 Oryantiring, Macera Yarışları",
};

const getTypeLabel = (race) => {
  const raw = (race && race.type ? race.type : "").trim();
  if (!raw) {
    return "Yaris";
  }
  return TYPE_LABELS[raw] || raw;
};

const App = () => {
  const [races, setRaces] = useState(() => loadJson(CACHE_KEY, []));
  const [status, setStatus] = useState(races.length ? "idle" : "loading");
  const [error, setError] = useState("");
  const [source, setSource] = useState(races.length ? "cache" : "");
  const [updatedAt, setUpdatedAt] = useState(() =>
    loadJson(CACHE_META_KEY, "")
  );
  const [registrations, setRegistrations] = useState(() =>
    loadJson(STORAGE_KEY, {})
  );
  const [query, setQuery] = useState("");
  const [distanceFilter, setDistanceFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [tab, setTab] = useState("all");
  const [showUpcomingOnly, setShowUpcomingOnly] = useState(false);
  const [view, setView] = useState("grid");
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState({
    name: "",
    dateStart: "",
    distances: "",
    location: "",
    registered: true,
    distanceChoice: "",
    finishMinutes: "",
    notes: "",
  });

  const saveRegistrations = (updater) => {
    setRegistrations((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      storeJson(STORAGE_KEY, next);
      return next;
    });
  };

  const commitCalendar = (data, sourceKey) => {
    setRaces(data);
    setSource(sourceKey);
    const now = new Date().toISOString();
    setUpdatedAt(now);
    storeJson(CACHE_KEY, data);
    storeJson(CACHE_META_KEY, now);
    setStatus("idle");
  };

  const refreshCalendar = async () => {
    setStatus("loading");
    setError("");

    try {
      const direct = await tryFetchCalendar(SOURCE_URL, parseHtmlCalendar);
      commitCalendar(direct, "direct");
      return;
    } catch (directError) {
      try {
        const mirror = await tryFetchCalendar(
          MIRROR_URL,
          parseMarkdownCalendar
        );
        commitCalendar(mirror, "mirror");
        return;
      } catch (mirrorError) {
        setStatus("error");
        setError("Takvim su anda yuklenemedi. Tekrar deneyin.");
      }
    }
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!active) {
        return;
      }
      await refreshCalendar();
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  const registeredCount = useMemo(() => {
    return Object.values(registrations).filter((item) => item.registered)
      .length;
  }, [registrations]);

  const availableDistances = useMemo(() => {
    const set = new Set();
    races.forEach((race) => {
      parseDistanceOptions(race.distances).forEach((d) => set.add(d));
    });
    return Array.from(set).sort((a, b) => {
      const valA = parseFloat(a);
      const valB = parseFloat(b);
      if (!Number.isNaN(valA) && !Number.isNaN(valB)) {
        return valA - valB;
      }
      return a.localeCompare(b, undefined, { numeric: true });
    });
  }, [races]);

  const availableTypes = useMemo(() => {
    const map = new Map();
    const addType = (label) => {
      const safeLabel = (label || "").trim() || "Yaris";
      const key = toComparable(safeLabel);
      if (!map.has(key)) {
        map.set(key, safeLabel);
      }
    };

    Object.values(TYPE_LABELS).forEach(addType);

    races.forEach((race) => addType(getTypeLabel(race)));

    Object.values(registrations).forEach((reg) => {
      if (reg.manual) {
        addType("Manuel");
      }
    });

    return Array.from(map.values());
  }, [races, registrations]);

  const filteredRaces = useMemo(() => {
    let list = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (tab === "registered") {
      // Start with races that are registered in the calendar
      list = races.filter((race) => registrations[race.id]?.registered);

      // Append manual registrations (stored only in registrations)
      Object.entries(registrations).forEach(([id, reg]) => {
        if (reg.registered && !races.some((r) => r.id === id)) {
          list.push({
            id,
            name: reg.name || "Manuel yarış",
            dateStart: reg.dateStart || "",
            distances: reg.distances || reg.distanceChoice || "",
            location: reg.location || "",
            url: null,
            notes: reg.notes || "",
            type: "Manuel",
          });
        }
      });
    } else {
      list = races.filter((race) => {
        if (!race.dateStart) {
          return false;
        }
        if (race.dateStart < START_DATE) {
          return false;
        }
        const dateValue = toDateValue(race.dateStart);
        return dateValue ? dateValue >= today : false;
      });

      list = list.filter((race) => isTurkeyRace(race));
    }

    if (distanceFilter) {
      list = list.filter((race) => {
        const options = parseDistanceOptions(race.distances);
        return options.includes(distanceFilter);
      });
    }

    if (typeFilter) {
      const normalizedType = toComparable(typeFilter);
      list = list.filter(
        (race) => toComparable(getTypeLabel(race)) === normalizedType
      );
    }

    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery) {
      list = list.filter((race) => {
        return [
          race.name,
          race.location,
          race.dateText,
          race.distances,
          race.notes,
        ]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(normalizedQuery));
      });
    }

    if (showUpcomingOnly && tab !== "registered") {
      list = list.filter((race) => {
        const dateValue = toDateValue(race.dateStart);
        return dateValue ? dateValue >= today : false;
      });
    }

    return list;
  }, [
    races,
    registrations,
    tab,
    query,
    showUpcomingOnly,
    distanceFilter,
    typeFilter,
  ]);

  const groupedByType = useMemo(() => {
    const groups = new Map();

    filteredRaces.forEach((race) => {
      const label = getTypeLabel(race);
      const key = toComparable(label) || label || "yaris";
      if (!groups.has(key)) {
        groups.set(key, { key, label, races: [] });
      }
      groups.get(key).races.push(race);
    });

    return Array.from(groups.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
  }, [filteredRaces]);

  const updateRegistration = (raceId, next) => {
    saveRegistrations((prev) => {
      const prevEntry = prev[raceId] || {};
      const merged = {
        ...prevEntry,
        ...next,
        registered: next.registered ?? prevEntry.registered ?? false,
        finishMinutes: next.finishMinutes ?? prevEntry.finishMinutes ?? "",
        distanceChoice: next.distanceChoice ?? prevEntry.distanceChoice ?? "",
      };
      return { ...prev, [raceId]: merged };
    });
  };

  const handleToggle = (raceId) => {
    const current = registrations[raceId] || {
      registered: false,
      finishMinutes: "",
      distanceChoice: "",
    };

    updateRegistration(raceId, {
      ...current,
      registered: !current.registered,
    });
  };

  const handleFinishChange = (raceId, value) => {
    const current = registrations[raceId] || {
      registered: true,
      finishMinutes: "",
      distanceChoice: "",
    };

    updateRegistration(raceId, {
      registered: true,
      finishMinutes: value,
      distanceChoice: current.distanceChoice ?? "",
    });
  };

  const handleDistanceChange = (raceId, value) => {
    const current = registrations[raceId] || {
      registered: true,
      finishMinutes: "",
      distanceChoice: "",
    };

    updateRegistration(raceId, {
      registered: true,
      finishMinutes: current.finishMinutes ?? "",
      distanceChoice: value,
    });
  };

  const handleAddManual = (event) => {
    if (event && event.preventDefault) event.preventDefault();
    const id = `manual-${Date.now()}`;
    saveRegistrations((prev) => ({
      ...prev,
      [id]: {
        registered: !!manualForm.registered,
        finishMinutes: manualForm.finishMinutes ?? "",
        distanceChoice: manualForm.distanceChoice ?? "",
        manual: true,
        name: manualForm.name,
        dateStart: manualForm.dateStart,
        distances: manualForm.distances,
        location: manualForm.location,
        notes: manualForm.notes,
      },
    }));

    setManualForm({
      name: "",
      dateStart: "",
      distances: "",
      location: "",
      registered: true,
      distanceChoice: "",
      finishMinutes: "",
      notes: "",
    });
    setShowManualForm(false);
  };

  const handleDeleteManual = (id) => {
    saveRegistrations((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const rows = filteredRaces
      .map((race) => {
        const reg = registrations[race.id] || {};
        const chosen = reg.distanceChoice || "";
        const minutes = reg.finishMinutes || "";
        return `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 12px;">${race.name}</td>
        <td style="padding: 12px;">${getDateLabel(race)}</td>
        <td style="padding: 12px;">${chosen}</td>
        <td style="padding: 12px;">${minutes}</td>
      </tr>`;
      })
      .join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Başvurduklarım Listesi</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            h2 { text-align: center; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th { text-align: left; padding: 12px; border-bottom: 2px solid #ddd; background: #f9f9f9; }
          </style>
        </head>
        <body>
          <h2>Başvurduklarım</h2>
          <table>
            <thead>
              <tr>
                <th>Yarış Adı</th>
                <th>Tarih</th>
                <th>Mesafe</th>
                <th>Süre (dk)</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const sourceLabel = sourceLabelMap[source] || "";
  const updatedLabel = formatUpdatedAt(updatedAt);

  return (
    <div className="app">
      <header className="hero">
        <div>
          <div className="brand">
            <img src={teamRunboLogo} alt="Team RunBo logo" />
          </div>
          <p className="eyebrow">Team RunBo Koşu Takvimi</p>
          <h1> Kosu Takvimi ve Takibi</h1>
          <p>
            Takviminden yaris listesini cek, basvurularini
            isaretle ve bitis suresini dakika cinsinden kaydet.
          </p>
          <button className="primary" onClick={refreshCalendar}>
            Takvimi yenile
          </button>
        </div>
        <div className="hero-card">
          <div className="stat">
            <span>Toplam yaris</span>
            <strong>{races.length}</strong>
          </div>
          <div className="stat">
            <span>Basvurulanlar</span>
            <strong>{registeredCount}</strong>
          </div>
          <div className="stat">
            <span>Liste gorunen</span>
            <strong>{filteredRaces.length}</strong>
          </div>
        </div>
      </header>

      <section className="controls">
        <div className="search">
          <input
            type="search"
            placeholder="Ara: yaris adi, sehir, tarih"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div>
          <select
            value={distanceFilter}
            onChange={(e) => setDistanceFilter(e.target.value)}
            style={{ padding: "10px", borderRadius: "4px", border: "1px solid #ccc" }}
          >
            <option value="">Tüm Mesafeler</option>
            {availableDistances.map((dist) => (
              <option key={dist} value={dist}>{dist}</option>
            ))}
          </select>
        </div>
        <div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ padding: "10px", borderRadius: "4px", border: "1px solid #ccc" }}
          >
            <option value="">Tum kosu tipleri</option>
            {availableTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={showUpcomingOnly}
            onChange={(event) => setShowUpcomingOnly(event.target.checked)}
          />
          Yalnizca yaklasanlar
        </label>
        <div className="view-toggle" role="group" aria-label="Gorunum">
          <button
            className={`view-btn ${view === "grid" ? "active" : ""}`}
            type="button"
            onClick={() => setView("grid")}
          >
            Grid
          </button>
          <button
            className={`view-btn ${view === "list" ? "active" : ""}`}
            type="button"
            onClick={() => setView("list")}
          >
            Liste
          </button>
        </div>
      </section>

      <div className="tabs" role="tablist">
        <button
          className={`tab ${tab === "all" ? "active" : ""}`}
          onClick={() => setTab("all")}
          type="button"
        >
          Tum yarislar
        </button>
        <button
          className={`tab ${tab === "registered" ? "active" : ""}`}
          onClick={() => setTab("registered")}
          type="button"
        >
          Basvurduklarim
        </button>
        <button
          className="tab"
          onClick={() => setShowManualForm((s) => !s)}
          type="button"
          style={{ marginLeft: "8px" }}
        >
          Manuel Ekle
        </button>
      </div>

      {showManualForm ? (
        <form onSubmit={handleAddManual} className="manual-form" style={{ marginTop: "12px", display: "grid", gap: "8px", gridTemplateColumns: "1fr 160px 160px auto", alignItems: "center" }}>
          <input
            placeholder="Yarış Adı"
            required
            value={manualForm.name}
            onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
            style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}
          />
          <input
            type="date"
            value={manualForm.dateStart}
            onChange={(e) => setManualForm({ ...manualForm, dateStart: e.target.value })}
            style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}
          />
          <input
            placeholder="Mesafeler (virgülle ayrılmış)"
            value={manualForm.distances}
            onChange={(e) => setManualForm({ ...manualForm, distances: e.target.value })}
            style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}
          />
          <input
            placeholder="Yer (opsiyonel)"
            value={manualForm.location}
            onChange={(e) => setManualForm({ ...manualForm, location: e.target.value })}
            style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}
          />
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={manualForm.registered}
              onChange={(e) => setManualForm({ ...manualForm, registered: e.target.checked })}
            />
            Kayıtlı olarak ekle
          </label>
          <input
            placeholder="Başvurulan mesafe"
            value={manualForm.distanceChoice}
            onChange={(e) => setManualForm({ ...manualForm, distanceChoice: e.target.value })}
            style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}
          />
          <input
            type="number"
            placeholder="Süre (dk)"
            value={manualForm.finishMinutes}
            onChange={(e) => setManualForm({ ...manualForm, finishMinutes: e.target.value })}
            style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}
          />
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="primary" type="submit">Ekle</button>
            <button type="button" onClick={() => setShowManualForm(false)}>İptal</button>
          </div>
        </form>
      ) : null}

      <section className="status">
        {sourceLabel ? <span>Kaynak: {sourceLabel}</span> : null}
        {updatedLabel ? <span>Guncellendi: {updatedLabel}</span> : null}
        {status === "loading" ? <span>Yukleniyor...</span> : null}
      </section>

      {status === "error" ? (
        <div className="notice error">
          <strong>Hata:</strong> {error}
        </div>
      ) : null}

      {status === "loading" && !races.length ? (
        <div className="notice loading">Takvim yukleniyor...</div>
      ) : null}

      {filteredRaces.length ? (
        tab === "registered" ? (
          <div className="registered-container" style={{ marginTop: "20px" }}>
            <div style={{ textAlign: "right", marginBottom: "10px" }}>
              <button onClick={handlePrint} style={{ cursor: "pointer", padding: "8px 16px", fontSize: "0.9em" }}>
                📄 PDF Olarak İndir
              </button>
            </div>
            <div className="registered-table-wrapper" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #ddd" }}>
                  <th style={{ padding: "12px" }}>Yarış Adı</th>
                  <th style={{ padding: "12px" }}>Tarih</th>
                  <th style={{ padding: "12px" }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filteredRaces.map((race) => {
                  const reg = registrations[race.id] || {};
                  const distanceOptions = parseDistanceOptions(race.distances);
                  return (
                    <tr key={race.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "12px" }}>
                        {race.url ? (
                          <a href={race.url} target="_blank" rel="noreferrer" style={{ fontWeight: "bold" }}>
                            {race.name}
                          </a>
                        ) : (
                          <span style={{ fontWeight: "bold" }}>{race.name}</span>
                        )}
                      </td>
                      <td style={{ padding: "12px" }}>{getDateLabel(race)}</td>
                      <td style={{ padding: "12px", display: "flex", gap: "8px", alignItems: "center" }}>
                        {distanceOptions.length ? (
                          <select
                            value={reg.distanceChoice || ""}
                            onChange={(e) => handleDistanceChange(race.id, e.target.value)}
                            disabled={!reg.registered}
                            style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}
                          >
                            <option value="">-- Mesafe seçin --</option>
                            {distanceOptions.map((d) => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            placeholder="Mesafe (ör: 10K)"
                            value={reg.distanceChoice || ""}
                            onChange={(e) => handleDistanceChange(race.id, e.target.value)}
                            disabled={!reg.registered}
                            style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}
                          />
                        )}

                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          step="1"
                          placeholder="Süre (dk)"
                          value={reg.finishMinutes || ""}
                          onChange={(e) => handleFinishChange(race.id, e.target.value)}
                          disabled={!reg.registered}
                          style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc", width: "100px" }}
                        />

                        <button onClick={() => handleToggle(race.id)} style={{ cursor: "pointer", fontSize: "0.9em" }}>
                          Listeden Çıkar
                        </button>
                        {reg.manual ? (
                          <button onClick={() => handleDeleteManual(race.id)} style={{ cursor: "pointer", fontSize: "0.9em", marginLeft: "8px", background: "#fff", border: "1px solid #ddd" }}>
                            Sil
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div> 
          </div>
        ) : (
          view === "list" ? (
            <div className="registered-container" style={{ marginTop: "20px" }}>
              <div className="registered-table-wrapper" style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #ddd" }}>
                      <th style={{ padding: "12px" }}>Yarış Adı</th>
                      <th style={{ padding: "12px" }}>Tarih</th>
                      <th style={{ padding: "12px" }}>Mesafe</th>
                      <th style={{ padding: "12px" }}>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedByType.flatMap((group) => {
                      return [
                        <tr
                          key={`type-${group.key}`}
                          style={{ background: "rgba(42, 157, 143, 0.08)", fontWeight: "600" }}
                        >
                          <td colSpan={4} style={{ padding: "10px 12px" }}>
                            {group.label} ({group.races.length} yaris)
                          </td>
                        </tr>,
                        ...group.races.map((race) => {
                      const isRegistered = registrations[race.id]?.registered;
                      return (
                        <tr key={race.id} style={{ borderBottom: "1px solid #eee" }}>
                          <td style={{ padding: "12px" }}>
                            {race.url ? (
                              <a href={race.url} target="_blank" rel="noreferrer" style={{ fontWeight: "bold" }}>
                                {race.name}
                              </a>
                            ) : (
                              <span style={{ fontWeight: "bold" }}>{race.name}</span>
                            )}
                          </td>
                          <td style={{ padding: "12px" }}>{getDateLabel(race)}</td>
                          <td style={{ padding: "12px" }}>{race.distances}</td>
                          <td style={{ padding: "12px" }}>
                            <button onClick={() => handleToggle(race.id)} style={{ cursor: "pointer", fontSize: "0.9em" }}>
                              {isRegistered ? "Listeden Çıkar" : "Listeye Ekle"}
                            </button>
                            {registrations[race.id]?.manual ? (
                              <button onClick={() => handleDeleteManual(race.id)} style={{ cursor: "pointer", fontSize: "0.9em", marginLeft: "8px", background: "#fff", border: "1px solid #ddd" }}>
                                Sil
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                        }),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="month-groups">
              {groupedByType.map((group) => (
                <section className="month-group" key={group.key}>
                  <div className="month-header">
                    <div>
                      <h2 className="month-title">{group.label}</h2>
                      <p className="month-subtitle">
                        {group.races.length} yaris
                      </p>
                    </div>
                  </div>
                  <div className="race-grid">
                    {group.races.map((race, index) => {
                      const registration = registrations[race.id] || {
                        registered: false,
                        finishMinutes: "",
                        distanceChoice: "",
                      };
                      const typeLabel = getTypeLabel(race);
                      const distanceOptions = parseDistanceOptions(race.distances);
                      const distanceListId = `distance-${race.id}`;

                      return (
                        <article
                          key={race.id}
                          className="race-card"
                          style={{
                            "--delay": `${Math.min(index, 12) * 40}ms`,
                          }}
                        >
                          <span className="badge">{typeLabel}</span>
                          <h3>
                            {race.url ? (
                              <a href={race.url} target="_blank" rel="noreferrer">
                                {race.name}
                              </a>
                            ) : (
                              race.name
                            )}
                          </h3>
                          <div className="meta">
                            <span>Tarih: {getDateLabel(race)}</span>
                            {race.location ? (
                              <span>Yer: {race.location}</span>
                            ) : null}
                            {race.distances ? (
                              <span>Mesafe: {race.distances}</span>
                            ) : null}
                            {race.notes ? <span>Not: {race.notes}</span> : null}
                          </div>
                          <div className="card-actions">
                            <label className="checkbox">
                              <input
                                type="checkbox"
                                checked={registration.registered}
                                onChange={() => handleToggle(race.id)}
                              />
                              Basvurdum
                            </label>
                            <label className="field">
                              <span>Basvurulan mesafe</span>
                              <input
                                className="field-input"
                                type="text"
                                list={
                                  distanceOptions.length
                                    ? distanceListId
                                    : undefined
                                }
                                placeholder="Ornek: 10K"
                                value={registration.distanceChoice}
                                onChange={(event) =>
                                  handleDistanceChange(
                                    race.id,
                                    event.target.value
                                  )
                                }
                                disabled={!registration.registered}
                              />
                              {distanceOptions.length ? (
                                <datalist id={distanceListId}>
                                  {distanceOptions.map((option) => (
                                    <option key={option} value={option} />
                                  ))}
                                </datalist>
                              ) : null}
                            </label>
                            <label className="field">
                              <span>Bitis suresi (dk)</span>
                              <input
                                className="field-input"
                                type="number"
                                inputMode="numeric"
                                min="0"
                                step="1"
                                placeholder="Ornek: 95"
                                value={registration.finishMinutes}
                                onChange={(event) =>
                                  handleFinishChange(
                                    race.id,
                                    event.target.value
                                  )
                                }
                                disabled={!registration.registered}
                              />
                            </label>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )
        )
      ) : (
        <div className="empty-state">
          Liste bos. Filtreleri temizleyin ya da takvimi yenileyin.
        </div>
      )}
    </div>
  );
};

export default App;
