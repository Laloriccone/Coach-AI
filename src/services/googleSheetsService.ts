import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./firebase";

// Define a global JSONP callback to prevent unhandled ReferenceErrors/Script errors in the browser.
if (typeof window !== "undefined") {
  (window as any).ignore = function() {
    // No-op for JSONP callback
  };
}

const SHEETS_ADMIN_URL = "https://script.google.com/macros/s/AKfycbyeCg7DyouhIdshy4mOVybTNH_3nUE0dGU5gwGFs4h1GIJbaD6AEgm8bizC8bcBvfWi/exec";

export async function enviarDatosAdmin(tipo: string, datos: object) {
  try {
    const response = await fetch("/api/sheets/admin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ tipo, ...datos })
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error enviando a Sheets admin a través del servidor:", error);
    try {
      // Direct browser fallback if backend endpoint is unavailable
      const payload = encodeURIComponent(JSON.stringify({ tipo, ...datos }));
      const script = document.createElement('script');
      script.src = `${SHEETS_ADMIN_URL}?data=${payload}&callback=ignore`;
      document.head.appendChild(script);
      setTimeout(() => {
        if (script.parentNode) script.parentNode.removeChild(script);
      }, 3000);
    } catch (fbErr) {
      console.error("Error en fallback de envío a Sheets admin:", fbErr);
    }
  }
}

const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/spreadsheets");
provider.addScope("https://www.googleapis.com/auth/drive.file");

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("No se pudo obtener el token de acceso de Google.");
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("Error al iniciar sesión con Google:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

export interface SpreadsheetInfo {
  spreadsheetId: string;
  spreadsheetUrl: string;
}

export const createGoogleSpreadsheet = async (
  accessToken: string,
  stats: any
): Promise<SpreadsheetInfo> => {
  const response = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: { title: "CoachAI - Mi Rendimiento Deportivo y Progreso" },
      sheets: [
        { properties: { title: "Resumen Atletico", gridProperties: { rowCount: 30, columnCount: 10 } } },
        { properties: { title: "Registro de Entrenamientos", gridProperties: { rowCount: 100, columnCount: 6 } } },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error al crear la planilla: ${errText}`);
  }

  const data = await response.json();
  const spreadsheetId = data.spreadsheetId;
  const spreadsheetUrl = data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  await syncDataToGoogleSpreadsheet(accessToken, spreadsheetId, stats);
  return { spreadsheetId, spreadsheetUrl };
};

export const ensureSheetsExist = async (
  accessToken: string,
  spreadsheetId: string
): Promise<string[]> => {
  try {
    const metadataResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!metadataResponse.ok) return [];
    const metadata = await metadataResponse.json();
    const existingTitles: string[] = (metadata.sheets || []).map((s: any) => s.properties?.title || "");
    const requests: any[] = [];
    if (!existingTitles.some(t => t.toLowerCase().includes("resumen"))) {
      requests.push({ addSheet: { properties: { title: "Resumen Atletico", gridProperties: { rowCount: 30, columnCount: 10 } } } });
      existingTitles.push("Resumen Atletico");
    }
    if (!existingTitles.some(t => t.toLowerCase().includes("entrena"))) {
      requests.push({ addSheet: { properties: { title: "Registro de Entrenamientos", gridProperties: { rowCount: 100, columnCount: 6 } } } });
      existingTitles.push("Registro de Entrenamientos");
    }
    if (requests.length > 0) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ requests }),
      });
    }
    return existingTitles;
  } catch (err) {
    console.error("ensureSheetsExist error:", err);
    return [];
  }
};

export const syncDataToGoogleSpreadsheet = async (
  accessToken: string,
  spreadsheetId: string,
  stats: any
): Promise<any> => {
  const existingTitles = await ensureSheetsExist(accessToken, spreadsheetId);
  const lastSync = new Date().toLocaleString();
  const summaryTabName = existingTitles.find(t => t.toLowerCase().includes("resumen")) || "Resumen Atletico";
  const workoutsTabName = existingTitles.find(t => t.toLowerCase().includes("entrena")) || "Registro de Entrenamientos";

  const summaryHeaders = ["Sincronizado Hace", "Nivel Atlético", "XP Total", "Racha (Días)", "Disciplina Principal", "Frecuencia Semanal", "Meta Próxima", "Peso (kg)", "Edad", "Altura (cm)"];
  const summaryValues = [lastSync, stats.level.toString(), stats.xp.toString(), stats.streak.toString(), stats.profile?.sport || "No definido", stats.training?.frequency || "No definido", stats.goal || "No definido", (stats.weight || 75).toString(), (stats.profile?.age || 25).toString(), (stats.profile?.height || 175).toString()];

  const summaryRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(summaryTabName)}!A1:J2?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ range: `${summaryTabName}!A1:J2`, majorDimension: "ROWS", values: [summaryHeaders, summaryValues] }),
    }
  );
  if (!summaryRes.ok) {
    const errText = await summaryRes.text();
    throw new Error(`Error sincronizando resumen: ${errText}`);
  }

  const workoutHeadersDefault = ["ID", "Tipo de Entrenamiento", "Duración (min)", "Intensidad", "Energía", "Fecha de Sesión"];
  let workoutHeaders = [...workoutHeadersDefault];
  let useAlternativeFormat = false;

  if (workoutsTabName.toLowerCase() === "entrenamientos") {
    useAlternativeFormat = true;
    workoutHeaders = ["Usuario", "Fecha", "Entrenó", "Intensidad", "Energía"];
  } else {
    try {
      const resp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(workoutsTabName)}!A1:Z1`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (resp.ok) {
        const d = await resp.json();
        const firstRow = d.values?.[0] || [];
        if (firstRow.length > 0 && firstRow.some((h: string) => {
          const hn = h ? h.toLowerCase() : "";
          return hn.includes("usuario") || hn.includes("entrenó") || hn.includes("entreno") || hn.includes("fecha");
        })) {
          useAlternativeFormat = true;
          workoutHeaders = firstRow.map((str: string) => str || "");
        }
      }
    } catch (e) {
      console.warn("No se pudieron verificar los encabezados existentes en Google Sheets, continuando con el formato estándar:", e);
    }
  }

  const athleteName = `${stats.profile?.name || ""} ${stats.profile?.lastName || ""}`.trim() || stats.nombre || "Atleta";
  const workouts = stats.workouts || [];
  
  const workoutRows = workouts.map((w: any) => {
    if (useAlternativeFormat) {
      return workoutHeaders.map((header: string) => {
        const hNorm = header.toLowerCase().replace(/[áéíóúü]/g, (char) => {
          const map: any = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u' };
          return map[char] || char;
        }).trim();
        
        if (hNorm === "usuario" || hNorm === "nombre" || hNorm === "atleta") {
          return athleteName;
        }
        if (hNorm === "fecha" || hNorm === "fecha de sesion" || hNorm === "fecha de sesión" || hNorm === "dia" || hNorm === "día") {
          return w.date ? new Date(w.date).toLocaleDateString("es-ES") : new Date().toLocaleDateString("es-ES");
        }
        if (hNorm === "entreno" || hNorm === "entrenamiento" || hNorm === "entrenó") {
          return "Sí";
        }
        if (hNorm === "intensidad") {
          return w.intensityRaw || (w.intensity === 'high' ? 'Alta' : w.intensity === 'low' ? 'Baja' : 'Media');
        }
        if (hNorm === "energia" || hNorm === "energía") {
          return w.energy === 'Media' ? 'Normal' : (w.energy || 'Normal');
        }
        if (hNorm === "id") {
          return w.id || "";
        }
        if (hNorm === "duracion" || hNorm === "duracion (min)" || hNorm === "duración (min)" || hNorm === "duración") {
          return (w.duration || 60).toString();
        }
        if (hNorm === "tipo" || hNorm === "tipo de entrenamiento" || hNorm === "ejercicio") {
          return w.type || "";
        }
        return "";
      });
    } else {
      return [
        w.id || "",
        w.type || "",
        (w.duration || 0).toString(),
        w.intensityRaw || (w.intensity === 'high' ? 'Alta' : w.intensity === 'low' ? 'Baja' : 'Media'),
        w.energy || "Media",
        w.date ? new Date(w.date).toLocaleString() : "",
      ];
    }
  });

  const finalWorkoutValues = [workoutHeaders, ...workoutRows];
  if (workoutRows.length === 0) {
    if (useAlternativeFormat) {
      finalWorkoutValues.push(workoutHeaders.map((h: string) => {
        const hn = h.toLowerCase();
        if (hn.includes("usuario")) return athleteName;
        if (hn.includes("fecha")) return new Date().toLocaleDateString("es-ES");
        if (hn.includes("entreno") || hn.includes("entrenó")) return "No";
        return "--";
      }));
    } else {
      finalWorkoutValues.push(["--", "No hay entrenamientos registrados aún", "--", "--", "--", "--"]);
    }
  }

  const columnsCount = workoutHeaders.length;
  const endColumnLetter = String.fromCharCode(65 + columnsCount - 1);
  const workoutRange = `${workoutsTabName}!A1:${endColumnLetter}${finalWorkoutValues.length + 1}`;

  const workoutRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(workoutRange)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ range: workoutRange, majorDimension: "ROWS", values: finalWorkoutValues }),
    }
  );
  if (!workoutRes.ok) {
    const errText = await workoutRes.text();
    throw new Error(`Error sincronizando entrenamientos: ${errText}`);
  }

  return { lastSync };
};

export const extractSpreadsheetId = (urlOrId: string): string => {
  const trimmed = urlOrId.trim();
  if (!trimmed.includes("docs.google.com/spreadsheets")) return trimmed;
  const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : trimmed;
};

export const fetchSpreadsheetData = async (
  accessToken: string,
  spreadsheetId: string,
  range: string = "A1:Z500"
): Promise<{ headers: string[]; rows: any[][] }> => {
  try {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok) {
      const metadataResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!metadataResponse.ok) throw new Error("No se pudo leer la metadata.");
      const metadata = await metadataResponse.json();
      const firstSheetName = metadata.sheets?.[0]?.properties?.title;
      if (!firstSheetName) throw new Error("La planilla no contiene hojas válidas.");
      const retryResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(firstSheetName + "!A1:Z500")}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!retryResponse.ok) throw new Error("Error al leer la planilla.");
      const retryData = await retryResponse.json();
      const values = retryData.values || [];
      return { headers: values[0] || [], rows: values.slice(1) || [] };
    }
    const data = await response.json();
    const values = data.values || [];
    return { headers: values[0] || [], rows: values.slice(1) || [] };
  } catch (error: any) {
    console.error("fetchSpreadsheetData error:", error);
    throw error;
  }
};
