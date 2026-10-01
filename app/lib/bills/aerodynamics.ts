/**
 * Aerodinámica simplificada de una lámina de papel (billete) para cannon-es.
 *
 * Un cuerpo rígido en caída libre cae recto; lo que hace que el papel
 * "planee" y oscile es el aire. Modelamos tres efectos:
 *
 *  1. Arrastre anisótropo: el aire frena mucho el movimiento perpendicular a la
 *     lámina (cara) y poco el paralelo (canto). Eso convierte parte de la caída
 *     en desplazamiento lateral: planeo.
 *  2. Centro de presión adelantado: la fuerza normal se aplica desplazada hacia
 *     el borde que avanza. El par resultante hace girar la lámina hasta ponerla
 *     de cara al flujo, se pasa, y vuelve: el aleteo (flutter) característico.
 *  3. Turbulencia: brisa suave y distinta por billete para romper la simetría.
 *
 * La fricción del aire en rotación la aporta `body.angularDamping`.
 */
import { Vec3, type Body } from "cannon-es";

export type AeroParams = {
  /** Coeficiente de arrastre cuadrático perpendicular a la cara. */
  normalDrag: number;
  /** Coeficiente de arrastre cuadrático paralelo a la cara (canto). */
  tangentialDrag: number;
  /** Distancia (unidades de mundo) del centro de presión al centro de masa. */
  pressureOffset: number;
  /** Aceleración máxima de la brisa lateral. */
  turbulence: number;
};

/**
 * Ajustado por simulación (masa 1, gravedad 9.82, angularDamping 0.95):
 * ~2.5 u/s de caída media, velocidad angular ~1-1.5 rad/s y aleteo visible.
 * Subir `pressureOffset` o bajar el damping lleva a giros tipo hélice.
 */
export const DEFAULT_AERO: AeroParams = {
  normalDrag: 4,
  tangentialDrag: 0.35,
  pressureOffset: 0.06,
  turbulence: 0.9,
};

// Vectores reutilizables: se llama por billete en cada paso de física.
const LOCAL_NORMAL = new Vec3(0, 0, 1);
const normal = new Vec3();
const tangential = new Vec3();
const force = new Vec3();
const point = new Vec3();

/**
 * Aplica las fuerzas del aire a `body`. Llamar antes de cada paso interno de
 * la simulación (evento `preStep`), porque cannon-es borra las fuerzas tras
 * cada paso.
 *
 * @param time  segundos de simulación, para animar la turbulencia
 * @param seed  valor aleatorio fijo por billete
 */
export function applyPaperAerodynamics(body: Body, params: AeroParams, time: number, seed: number): void {
  const velocity = body.velocity;

  body.quaternion.vmult(LOCAL_NORMAL, normal);
  const normalSpeed = velocity.dot(normal);

  // Componente tangencial de la velocidad: v - (v·n)n
  normal.scale(normalSpeed, tangential);
  velocity.vsub(tangential, tangential);
  const tangentialSpeed = tangential.length();

  // (2) Punto de aplicación desplazado hacia el borde de ataque.
  point.set(0, 0, 0);
  if (tangentialSpeed > 1e-4) {
    tangential.scale(params.pressureOffset / tangentialSpeed, point);
  }

  // (1a) Arrastre normal, cuadrático y opuesto al movimiento de la cara.
  normal.scale(-params.normalDrag * normalSpeed * Math.abs(normalSpeed), force);
  body.applyForce(force, point);

  // (1b) Arrastre tangencial en el centro de masa (no genera par).
  tangential.scale(-params.tangentialDrag * tangentialSpeed, force);
  body.applyForce(force);

  // (3) Brisa lateral suave: suma de senos con fase propia del billete.
  const gust = params.turbulence * body.mass;
  force.set(
    gust * (Math.sin(time * 0.9 + seed * 6.3) + 0.5 * Math.sin(time * 2.3 + seed * 11.1)),
    gust * 0.25 * Math.sin(time * 1.7 + seed * 3.7),
    gust * 0.6 * Math.cos(time * 0.8 + seed * 8.9),
  );
  body.applyForce(force);
}
