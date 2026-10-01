/**
 * Motor de la lluvia de billetes: Three.js para el render y cannon-es para la física.
 *
 * Rendimiento:
 *  - Un único `InstancedMesh` = una sola draw call para todos los billetes.
 *  - Pool fijo de cuerpos físicos (`maxBills`); si se llena se recicla el más viejo.
 *  - Los billetes activos se compactan al inicio del buffer y `mesh.count` limita
 *    el dibujo a los visibles.
 *  - Sin billetes en pantalla el loop se detiene: cero trabajo de GPU en reposo.
 *
 * Realismo:
 *  - Física: gravedad, colisiones entre billetes y aerodinámica de papel
 *    (ver aerodynamics.ts).
 *  - Flexión: el vertex shader ondula y curva la lámina y recalcula normales,
 *    así la luz se mueve sobre el papel como si fuera flexible.
 *  - Desaparición: fade-out por instancia al final de su vida.
 */
import { Body, Box, SAPBroadphase, Vec3, World } from "cannon-es";
import * as THREE from "three";

import { applyPaperAerodynamics, DEFAULT_AERO } from "./aerodynamics";

export type BillsEngineOptions = {
  /** Máximo de billetes simultáneos (tamaño del pool). */
  maxBills: number;
  /** Billetes por llamada a `burst()` sin argumento. */
  billsPerBurst: number;
  /** URL de la textura atlas: frente arriba, reverso abajo (ver BILL_ATLAS). */
  textureUrl: string;
  /** Vida de cada billete en segundos [mín, máx]. */
  lifetime: [number, number];
  /** Segundos de fade-out al final de la vida. */
  fadeDuration: number;
};

const DEFAULT_OPTIONS: BillsEngineOptions = {
  maxBills: 90,
  billsPerBurst: 14,
  textureUrl: "/textures/bill.svg",
  lifetime: [4.5, 6.5],
  fadeDuration: 0.9,
};

// Proporción de un billete real (156 × 66 mm) en unidades de mundo.
const BILL_WIDTH = 1.56;
const BILL_HEIGHT = 0.66;

/**
 * Distribución de la textura (scripts/generate-bill-texture.mjs): cada cara
 * mide `faceHeight` px de alto y hay `gap` px transparentes entre ambas.
 */
const BILL_ATLAS = { faceHeight: 436, gap: 16 };
const ATLAS_HEIGHT = BILL_ATLAS.faceHeight * 2 + BILL_ATLAS.gap;
/** Alto de una cara y origen del frente, en coordenadas UV (v crece hacia arriba). */
const FACE_V = (BILL_ATLAS.faceHeight / ATLAS_HEIGHT).toFixed(6);
const FRONT_V0 = ((BILL_ATLAS.faceHeight + BILL_ATLAS.gap) / ATLAS_HEIGHT).toFixed(6);
/** Grosor de colisión: mayor que el visual (0) para evitar que se atraviesen. */
const COLLISION_THICKNESS = 0.06;

const CAMERA_FOV = 45;
const CAMERA_Z = 14;
const SPAWN_DEPTH: [number, number] = [-4, 4];

const FIXED_STEP = 1 / 60;
const MAX_SUBSTEPS = 3;
/** Evita saltos enormes de simulación al volver de una pestaña en segundo plano. */
const MAX_FRAME_DELTA = 0.1;

const TAU = Math.PI * 2;
const random = (min: number, max: number) => min + Math.random() * (max - min);

type Slot = {
  body: Body;
  active: boolean;
  age: number;
  life: number;
  /** Semilla de turbulencia. */
  seed: number;
  /** Parámetros visuales de flexión y tono. */
  phase: number;
  flexAmplitude: number;
  flexSpeed: number;
  tint: number;
};

// ---------------------------------------------------------------------------
// Shader: se inyecta en MeshStandardMaterial para conservar su iluminación.
// ---------------------------------------------------------------------------

const VERTEX_HEADER = /* glsl */ `
attribute float aOpacity;
attribute float aPhase;
attribute vec2 aFlex; // x: amplitud, y: velocidad
uniform float uTime;
varying float vOpacity;

// Desplazamiento en z de la lámina (ondas + curvatura lenta) y su gradiente,
// que se usa para recalcular la normal y que la luz "resbale" por el papel.
float paperDisplacement(vec2 p, out vec2 grad) {
  float t = uTime * aFlex.y + aPhase;
  float amp = aFlex.x;
  float a1 = p.x * 2.4 + t;
  float a2 = p.y * 3.1 + p.x * 0.8 + t * 1.3;
  float curl = 0.2 * sin(t * 0.6);
  grad = vec2(
    amp * (2.4 * cos(a1) + 0.36 * cos(a2)) + 2.0 * curl * p.x,
    amp * 1.395 * cos(a2)
  );
  return amp * (sin(a1) + 0.45 * sin(a2)) + curl * p.x * p.x;
}
`;

// Cada cara muestrea su mitad del atlas. El reverso invierte x para que su
// texto se lea al derecho cuando el billete está dado la vuelta.
// Three.js dibuja los materiales transparentes de doble cara en dos pasadas y,
// en la de las caras traseras (FLIP_SIDED), invierte el sentido de giro: ahí
// gl_FrontFacing vale true justamente para las caras traseras.
const MAP_FRAGMENT = /* glsl */ `
#ifdef USE_MAP
  #ifdef FLIP_SIDED
    bool billFront = !gl_FrontFacing;
  #else
    bool billFront = gl_FrontFacing;
  #endif
  vec2 billUv = billFront
    ? vec2(vMapUv.x, ${FRONT_V0} + vMapUv.y * ${FACE_V})
    : vec2(1.0 - vMapUv.x, vMapUv.y * ${FACE_V});
  diffuseColor *= texture2D(map, billUv);
#endif
`;

const VERTEX_NORMAL = /* glsl */ `
vec2 paperGrad;
float paperZ = paperDisplacement(position.xy, paperGrad);
vec3 objectNormal = normalize(vec3(-paperGrad, 1.0));
#ifdef USE_TANGENT
  vec3 objectTangent = vec3(tangent.xyz);
#endif
`;

function patchPaperShader(material: THREE.MeshStandardMaterial, uTime: THREE.IUniform<number>) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_HEADER}`)
      .replace("#include <beginnormal_vertex>", VERTEX_NORMAL)
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ntransformed.z += paperZ;\nvOpacity = aOpacity;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vOpacity;")
      .replace("#include <map_fragment>", MAP_FRAGMENT)
      // Después del alphaTest: el recorte de bordes usa el alpha de la textura
      // y el fade no hace desaparecer el billete de golpe a mitad de camino.
      .replace("#include <alphatest_fragment>", "#include <alphatest_fragment>\ndiffuseColor.a *= vOpacity;");
  };
  material.customProgramCacheKey = () => "paper-bill-v3";
}

// ---------------------------------------------------------------------------

export class BillsEngine {
  private readonly options: BillsEngineOptions;
  private readonly container: HTMLElement;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 100);
  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly mesh: THREE.InstancedMesh;
  private readonly opacityAttribute: THREE.InstancedBufferAttribute;
  private readonly phaseAttribute: THREE.InstancedBufferAttribute;
  private readonly flexAttribute: THREE.InstancedBufferAttribute;
  private readonly uTime: THREE.IUniform<number> = { value: 0 };
  private texture: THREE.Texture | null = null;

  private readonly world: World;
  private readonly slots: Slot[] = [];
  private readonly drawList: Slot[] = [];

  private readonly resizeObserver: ResizeObserver;
  private readonly dummy = new THREE.Object3D();
  private readonly tint = new THREE.Color();
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private simTime = 0;
  private disposed = false;

  /** Lanza si el navegador no soporta WebGL2; el componente lo captura. */
  constructor(container: HTMLElement, options: Partial<BillsEngineOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.container = container;
    const { maxBills } = this.options;

    // --- Render -----------------------------------------------------------
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.appendChild(canvas);

    this.camera.position.set(0, 0, CAMERA_Z);

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(4, 8, 10);
    this.scene.add(keyLight);
    // Contraluz neutra para separar los billetes del fondo sin teñir sus colores.
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
    rimLight.position.set(-6, -3, -6);
    this.scene.add(rimLight);

    // Suficientes segmentos para que la ondulación del shader se vea suave.
    this.geometry = new THREE.PlaneGeometry(BILL_WIDTH, BILL_HEIGHT, 24, 6);
    this.opacityAttribute = new THREE.InstancedBufferAttribute(new Float32Array(maxBills), 1);
    this.phaseAttribute = new THREE.InstancedBufferAttribute(new Float32Array(maxBills), 1);
    this.flexAttribute = new THREE.InstancedBufferAttribute(new Float32Array(maxBills * 2), 2);
    for (const attribute of [this.opacityAttribute, this.phaseAttribute, this.flexAttribute]) {
      attribute.setUsage(THREE.DynamicDrawUsage);
    }
    this.geometry.setAttribute("aOpacity", this.opacityAttribute);
    this.geometry.setAttribute("aPhase", this.phaseAttribute);
    this.geometry.setAttribute("aFlex", this.flexAttribute);

    this.material = new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.5,
      roughness: 0.8,
      metalness: 0,
    });
    patchPaperShader(this.material, this.uTime);

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, maxBills);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Las instancias se reparten por toda la pantalla; el bounding sphere de la
    // geometría base no las representa y el culling las ocultaría por error.
    this.mesh.frustumCulled = false;
    for (let i = 0; i < maxBills; i++) this.mesh.setColorAt(i, this.tint.setScalar(1));
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.visible = false; // hasta que cargue la textura
    this.scene.add(this.mesh);

    this.loadTexture();

    // --- Física -----------------------------------------------------------
    this.world = new World({ gravity: new Vec3(0, -9.82, 0) });
    this.world.broadphase = new SAPBroadphase(this.world);
    this.world.defaultContactMaterial.friction = 0.3;
    this.world.defaultContactMaterial.restitution = 0.05;
    // cannon-es borra las fuerzas tras cada sub-paso: el aire se aplica en cada uno.
    this.world.addEventListener("preStep", this.applyAir);

    const halfExtents = new Vec3(BILL_WIDTH / 2, BILL_HEIGHT / 2, COLLISION_THICKNESS / 2);
    for (let i = 0; i < maxBills; i++) {
      this.slots.push({
        body: new Body({ mass: 1, shape: new Box(halfExtents), linearDamping: 0.05, angularDamping: 0.95 }),
        active: false,
        age: 0,
        life: 0,
        seed: 0,
        phase: 0,
        flexAmplitude: 0,
        flexSpeed: 0,
        tint: 1,
      });
    }

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  /** Lanza `count` billetes desde arriba de la pantalla. */
  burst(count = this.options.billsPerBurst): void {
    if (this.disposed) return;
    for (let i = 0; i < count; i++) {
      this.spawn(this.slots.find((slot) => !slot.active) ?? this.oldestActiveSlot());
    }
    this.start();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    this.world.removeEventListener("preStep", this.applyAir);
    for (const slot of this.slots) if (slot.active) this.world.removeBody(slot.body);

    this.texture?.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // -------------------------------------------------------------------------

  private loadTexture() {
    new THREE.TextureLoader().load(
      this.options.textureUrl,
      (texture) => {
        if (this.disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        this.texture = texture;
        this.material.map = texture;
        this.material.needsUpdate = true;
        this.mesh.visible = true;
      },
      undefined,
      (error) => {
        // Sin textura seguimos con billetes verdes lisos en lugar de no mostrar nada.
        console.warn("[BillsEngine] No se pudo cargar la textura del billete", error);
        if (this.disposed) return;
        this.material.color.set(0x7fb77e);
        this.mesh.visible = true;
      },
    );
  }

  private readonly applyAir = () => {
    for (const slot of this.slots) {
      if (slot.active) applyPaperAerodynamics(slot.body, DEFAULT_AERO, this.simTime, slot.seed);
    }
  };

  /** Mitad de la altura visible por la cámara a la profundidad `z`. */
  private visibleHalfHeight(z: number): number {
    return Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * (CAMERA_Z - z);
  }

  private oldestActiveSlot(): Slot {
    return this.slots.reduce((oldest, slot) => (slot.age > oldest.age ? slot : oldest));
  }

  private spawn(slot: Slot) {
    const z = random(...SPAWN_DEPTH);
    const halfHeight = this.visibleHalfHeight(z);
    const halfWidth = halfHeight * this.camera.aspect;
    const { body } = slot;

    // Justo por encima del borde superior; la altura extra aleatoria escalona
    // la entrada para que la ráfaga parezca una lluvia y no un bloque.
    body.position.set(
      random(-halfWidth, halfWidth) * 0.95,
      halfHeight + BILL_HEIGHT + Math.random() * halfHeight * 0.6,
      z,
    );
    body.quaternion.setFromEuler(random(0, TAU), random(0, TAU), random(0, TAU));
    body.velocity.set(random(-0.4, 0.4), random(-1.5, -0.5), random(-0.2, 0.2));
    body.angularVelocity.set(random(-3, 3), random(-3, 3), random(-3, 3));
    // Evita que la interpolación dibuje un frame en la posición anterior del cuerpo reciclado.
    body.previousPosition.copy(body.position);
    body.interpolatedPosition.copy(body.position);
    body.previousQuaternion.copy(body.quaternion);
    body.interpolatedQuaternion.copy(body.quaternion);

    if (!slot.active) this.world.addBody(body);
    slot.active = true;
    slot.age = 0;
    slot.life = random(...this.options.lifetime);
    slot.seed = Math.random();
    slot.phase = random(0, TAU);
    slot.flexAmplitude = random(0.03, 0.07);
    slot.flexSpeed = random(2.5, 4.5);
    slot.tint = random(0.82, 1);
  }

  private deactivate(slot: Slot) {
    slot.active = false;
    this.world.removeBody(slot.body);
  }

  private start() {
    if (this.rafId !== null || this.disposed) return;
    this.lastFrameTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number) => {
    if (this.disposed) return;

    const delta = Math.min((now - this.lastFrameTime) / 1000, MAX_FRAME_DELTA);
    this.lastFrameTime = now;
    this.simTime += delta;

    this.world.step(FIXED_STEP, delta, MAX_SUBSTEPS);
    const visibleCount = this.syncInstances(delta);

    this.uTime.value = this.simTime;
    this.renderer.render(this.scene, this.camera);

    // Sin billetes: se detiene el loop hasta el próximo burst().
    this.rafId = visibleCount > 0 ? requestAnimationFrame(this.frame) : null;
  };

  /** Actualiza vida/fade y copia los cuerpos activos al buffer de instancias. */
  private syncInstances(delta: number): number {
    const { fadeDuration } = this.options;
    this.drawList.length = 0;

    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.age += delta;
      const { position } = slot.body;
      const belowScreen = position.y < -this.visibleHalfHeight(position.z) - BILL_WIDTH;
      if (slot.age >= slot.life || belowScreen) {
        this.deactivate(slot);
        continue;
      }
      this.drawList.push(slot);
    }

    // De atrás hacia delante: la mezcla alfa del fade se compone correctamente.
    this.drawList.sort((a, b) => a.body.position.z - b.body.position.z);

    this.drawList.forEach((slot, index) => {
      const { interpolatedPosition: p, interpolatedQuaternion: q } = slot.body;
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.quaternion.set(q.x, q.y, q.z, q.w);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(index, this.dummy.matrix);
      this.mesh.setColorAt(index, this.tint.setScalar(slot.tint));
      this.opacityAttribute.setX(index, Math.min(1, (slot.life - slot.age) / fadeDuration));
      this.phaseAttribute.setX(index, slot.phase);
      this.flexAttribute.setXY(index, slot.flexAmplitude, slot.flexSpeed);
    });

    this.mesh.count = this.drawList.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    this.opacityAttribute.needsUpdate = true;
    this.phaseAttribute.needsUpdate = true;
    this.flexAttribute.needsUpdate = true;
    return this.drawList.length;
  }

  private resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
