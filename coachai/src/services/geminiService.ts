import { UserType, Message } from "../types";

export async function getCoachResponse(
  userInput: string,
  history: Message[],
  userType: UserType,
  isOnboarding: boolean = false,
  stats?: any
): Promise<string> {
  try {
    const res = await fetch("/api/gemini/coach-response", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ userInput, history, userType, isOnboarding, stats })
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
    if (data.text) {
      return data.text;
    }
    throw new Error("No text content returned from API");
  } catch (error) {
    console.warn("Backend Gemini API call failed, falling back to local coach generator:", error);
    return generateFallbackCoachResponse(userInput, userType, isOnboarding, stats);
  }
}

export async function analyzeWorkout(
  userInput?: string,
  imageBase64?: string,
  imageMimeType?: string
): Promise<any> {
  try {
    const res = await fetch("/api/gemini/analyze-workout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ userInput, imageBase64, imageMimeType })
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.warn("Backend Workout Analysis failed, using local fallback parser:", error);
    return parseWorkoutLocally(userInput);
  }
}

// Ultra-fast, highly context-aware performance coach fallback generator in Spanish
function generateFallbackCoachResponse(
  userInput: string,
  userType: UserType,
  isOnboarding: boolean,
  stats?: any
): string {
  const inputLower = userInput.toLowerCase();
  const userName = stats?.profile?.name || stats?.nombre || "Atleta";
  const sport = stats?.profile?.sport || "deporte";
  const goal = stats?.goal || "mejorar tu rendimiento";

  if (isOnboarding) {
    if (userType === 'FREE') {
      return `¡Hola ${userName}! Me alegra tenerte aquí. Como miembro GRATUITO, te daré las pautas clave para comenzar con tu entrenamiento de ${sport}. ¿Cuál es tu principal objetivo esta semana?`;
    } else {
      return `¡Bienvenido a la experiencia PREMIUM, ${userName}! 🚀 Como tu coach de alto rendimiento, he analizado tus datos preliminares de ${sport}. Para personalizar al máximo tus bloques de carga y recuperación, cuéntame: ¿con cuánta frecuencia entrenas actualmente por semana y qué nivel de fatiga percibes?`;
    }
  }

  // Check keywords for contextual responses
  let category = "general";
  if (inputLower.includes("nutri") || inputLower.includes("comid") || inputLower.includes("macro") || inputLower.includes("dieta") || inputLower.includes("comer") || inputLower.includes("peso")) {
    category = "nutricion";
  } else if (inputLower.includes("recup") || inputLower.includes("dorm") || inputLower.includes("sueñ") || inputLower.includes("fatig") || inputLower.includes("descans") || inputLower.includes("parar")) {
    category = "recuperacion";
  } else if (inputLower.includes("entren") || inputLower.includes("rutin") || inputLower.includes("ejercic") || inputLower.includes("fuerza") || inputLower.includes("cardio") || inputLower.includes("gimnasio") || inputLower.includes("gym")) {
    category = "entreno";
  } else if (inputLower.includes("hola") || inputLower.includes("buen") || inputLower.includes("saludo") || inputLower.includes("que tal") || inputLower.includes("cómo te va") || inputLower.includes("como va")) {
    category = "saludo";
  }

  if (userType === 'PREMIUM') {
    // Generate full detailed structure for Premium
    let responseText = `### 🎯 OBJETIVO\nOptimizar tu rendimiento para **${goal}** dentro de tu disciplina de **${sport}**, regulando cargas de manera científica.\n\n`;

    if (category === "nutricion") {
      responseText += `### 🥗 NUTRICIÓN\n- Asegura un superávit/déficit controlado ajustado a tus sesiones de ${sport}.\n- Consume fuentes limpias de carbohidratos complejos antes de entrenar y proteína de alta calidad post-esfuerzo.\n- Hidratación: 35ml por kg de peso corporal diario, añadiendo electrolitos en sesiones intensas.`;
    } else {
      responseText += `### 🥗 NUTRICIÓN\n- Mantén un balance proteico adecuado (1.8g - 2.2g por kg) según tu peso de ${stats?.weight || 75} kg.\n- Prioriza carbohidratos en días de alta intensidad y grasas saludables en días de descanso.`;
    }

    responseText += `\n\n`;

    if (category === "entreno") {
      responseText += `### ⚡ ENTRENO\n- Enfócate en la especificidad para ${sport}. Realiza una progresión de carga sistemática.\n- Controla la intensidad: mantén un ratio 80/20 (80% aeróbico/técnico de baja intensidad, 20% alta exigencia).\n- Respeta los rangos de series de aproximación para evitar lesiones tempranas.`;
    } else {
      responseText += `### ⚡ ENTRENO\n- Ajusta tu volumen según tu disciplina (${sport}).\n- Mantén la constancia para consolidar la racha actual de **${stats?.streak || 0} días** progresando.\n- Diseña descargas estratégicas cada 4 o 5 semanas de carga.`;
    }

    responseText += `\n\n`;

    if (category === "recuperacion") {
      responseText += `### 💤 RECUPERACIÓN / MINDSET\n- Sueño profundo: mínimo 7-8 horas continuas. Esto estimula la síntesis proteica natural.\n- Monitorea tu frecuencia cardíaca en reposo (VFC) para saber cuándo exigir el máximo y cuándo descargar.\n- El descanso activo (caminar ligero, estiramientos) optimiza la remoción de lactato acumulado.`;
    } else if (category === "saludo") {
      responseText += `### 💤 RECUPERACIÓN / MINDSET\n- ¡Es excelente saludarte, ${userName}! Tu mentalidad es clave para el éxito en ${sport}.\n- Monitorea tu nivel diario de fatiga subjetiva y adecúa tus objetivos progresivos.\n- ¡Vamos por más!`;
    } else {
      responseText += `### 💤 RECUPERACIÓN / MINDSET\n- Duerme lo suficiente para propiciar la regeneración muscular óptima.\n- Recuerda que la consistencia vence al talento cuando el talento no se esfuerza. ¡Estás haciendo un gran trabajo!`;
    }

    return responseText;
  } else {
    // FREE response: short direct bullets
    if (category === "nutricion") {
      return `Aquí tienes mis sugerencias directas de nutrición para tu meta de **${goal}**:\n\n` +
        `- **Proteínas**: Asegura dosis consistentes de 25-30g por comida.\n` +
        `- **Post-Entrenamiento**: Carbohidratos simples y proteína rápida para regenerar tejido.\n` +
        `- **Hidratación**: Prioriza agua pura antes, durante y después del ejercicio.`;
    } else if (category === "recuperacion") {
      return `Consejos rápidos de recuperación para optimizar tu entrenamiento de ${sport}:\n\n` +
        `- **Sueño**: Intenta cumplir bloques de 7.5 horas para recuperación hormonal óptima.\n` +
        `- **Movilidad**: Realiza 10 minutos de movilidad articular dinámica al despertar.\n` +
        `- **Descanso Activo**: Camina ligero en tus días libres para mejorar el flujo sanguíneo muscular.`;
    } else if (category === "entreno") {
      return `Pautas de entrenamiento inmediatas para **${sport}**:\n\n` +
        `- **Progresión**: Aumenta el peso o volumen un 2.5% a 5% semanalmente si tu técnica es sólida.\n` +
        `- **Especificidad**: Dedica la primera parte del entrenamiento a tus debilidades técnicas.\n` +
        `- **Calentamiento**: No saltes la activación neuromuscular específica. ¡Evita lesiones!`;
    } else if (category === "saludo") {
      return `¡Hola ${userName}! Un gusto saludarte. Como tu coach de rendimiento para **${sport}**, estoy aquí para guiarte de forma directa. Cuéntame, ¿qué aspecto de tu rutina quieres mejorar hoy (entrenamiento, nutrición o descanso)?`;
    } else {
      return `¡Hola ${userName}! Tu progreso en **${sport}** va por buen camino. Te recomiendo enfocar tu semana en:\n\n` +
        `- **Constancia**: Mantén tu racha de **${stats?.streak || 0} días** activa.\n` +
        `- **Intensidad Inteligente**: Entrena duro pero escucha tus señales de fatiga sistémica.\n` +
        `- **Enfoque**: Visualiza tu meta de **${goal}** en cada repetición. ¡A darlo todo!`;
    }
  }
}

// Local smart analyzer fallback
function parseWorkoutLocally(userInput?: string): any {
  const text = (userInput || "").toLowerCase();
  
  // Estimate type
  let tipo = "Gym / Pesas";
  if (text.includes("futbol") || text.includes("fútbol") || text.includes("pelota") || text.includes("partido")) {
    tipo = "Fútbol";
  } else if (text.includes("run") || text.includes("corr") || text.includes("trot") || text.includes("running")) {
    tipo = "Running";
  } else if (text.includes("bici") || text.includes("cicl") || text.includes("pedal")) {
    tipo = "Ciclismo";
  } else if (text.includes("natac") || text.includes("nadar") || text.includes("piscina")) {
    tipo = "Natación";
  } else if (text.includes("crossfit") || text.includes("funcional")) {
    tipo = "Crossfit";
  } else if (text.includes("tenis") || text.includes("pádel") || text.includes("padel")) {
    tipo = "Tenis";
  } else if (text.includes("caliste") || text.includes("barras")) {
    tipo = "Calistenia";
  }

  // Estimate duration
  let duracion = 60;
  const numMatch = text.match(/(\d+)\s*(min|hora|hr)/);
  if (numMatch) {
    const val = parseInt(numMatch[1], 10);
    if (numMatch[2].startsWith("hora") || numMatch[2].startsWith("hr")) {
      duracion = val * 60;
    } else {
      duracion = val;
    }
  } else {
    // try searching just for numbers
    const justNumMatch = text.match(/\b(\d{2,3})\b/);
    if (justNumMatch) {
      const val = parseInt(justNumMatch[1], 10);
      if (val >= 10 && val <= 300) {
        duracion = val;
      }
    }
  }

  // Estimate intensity
  let intensidad = "Media";
  if (text.includes("alta") || text.includes("fuerte") || text.includes("pesado") || text.includes("morir") || text.includes("intenso")) {
    intensidad = "Alta";
  } else if (text.includes("baja") || text.includes("suave") || text.includes("tranqui") || text.includes("ligero")) {
    intensidad = "Baja";
  }

  // Estimate energy
  let energia = "Media";
  if (text.includes("mucha") || text.includes("al tope") || text.includes("excelente") || text.includes("súper") || text.includes("super") || text.includes("mucha energía")) {
    energia = "Alta";
  } else if (text.includes("baja") || text.includes("cansado") || text.includes("agotado") || text.includes("poca")) {
    energia = "Baja";
  }

  return {
    tipo,
    duracion,
    intensidad,
    energia,
    entreno: "Sí"
  };
}
