import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import config from "@/app/config/productos.json";

// "server-only" impide importar el módulo fuera de Next; en los tests no aplica.
vi.mock("server-only", () => ({}));

const { getProductoActivo, parseConfigProductos } = await import("@/app/lib/productos");

const valido = {
  productoActivo: "demo",
  productos: {
    demo: {
      nombre: "Programa demo",
      id: "79e47346-0188-4aa8-b706-818b68442866",
      imagen: "/productos/demo.png",
      encabezado: ["Estudiantes", "Demo"],
      textoLogo: ["APRENDE", "SPEAK EASY®"],
    },
  },
};

describe("app/config/productos.json", () => {
  it("es válido y su producto activo existe", () => {
    expect(() => getProductoActivo()).not.toThrow();
    expect(getProductoActivo().clave).toBe(config.productoActivo);
  });

  it("la imagen de cada producto está en public/", () => {
    for (const producto of Object.values(parseConfigProductos(config).productos)) {
      expect(existsSync(join(process.cwd(), "public", producto.imagen)), producto.imagen).toBe(true);
    }
  });
});

describe("parseConfigProductos", () => {
  it("acepta una configuración válida y normaliza la ruta y los textos", () => {
    const { productos } = parseConfigProductos({
      ...valido,
      productos: { demo: { ...valido.productos.demo, imagen: "productos/demo.png", encabezado: "Un renglón" } },
    });
    expect(productos.demo).toMatchObject({ clave: "demo", imagen: "/productos/demo.png", encabezado: ["Un renglón"] });
  });

  it("rechaza un productoActivo que no está en la lista", () => {
    expect(() => parseConfigProductos({ ...valido, productoActivo: "otro" })).toThrow(/productoActivo.*demo/);
  });

  it("rechaza un id que no es UUID", () => {
    const productos = { demo: { ...valido.productos.demo, id: "123" } };
    expect(() => parseConfigProductos({ ...valido, productos })).toThrow(/\.id/);
  });

  it("usa el fucsia de marca como color destacado si no se indica otro", () => {
    expect(parseConfigProductos(valido).productos.demo.colorDestacado).toBe("#FF327D");
    const conColor = { demo: { ...valido.productos.demo, colorDestacado: "#00AAFF" } };
    expect(parseConfigProductos({ ...valido, productos: conColor }).productos.demo.colorDestacado).toBe("#00AAFF");
  });

  it("rechaza un color que no es hexadecimal", () => {
    const productos = { demo: { ...valido.productos.demo, colorDestacado: "fucsia" } };
    expect(() => parseConfigProductos({ ...valido, productos })).toThrow(/colorDestacado/);
  });

  it("acepta palabras entre asteriscos y rechaza un asterisco sin cerrar", () => {
    const cerrado = { demo: { ...valido.productos.demo, textoLogo: ["*INGLÉS* DESDE 0"] } };
    const abierto = { demo: { ...valido.productos.demo, textoLogo: ["*INGLÉS DESDE 0"] } };
    expect(() => parseConfigProductos({ ...valido, productos: cerrado })).not.toThrow();
    expect(() => parseConfigProductos({ ...valido, productos: abierto })).toThrow(/falta cerrar/);
  });

  it("rechaza textos vacíos o sin imagen", () => {
    const sinTexto = { demo: { ...valido.productos.demo, textoLogo: [] } };
    const sinImagen = { demo: { ...valido.productos.demo, imagen: "" } };
    expect(() => parseConfigProductos({ ...valido, productos: sinTexto })).toThrow(/textoLogo/);
    expect(() => parseConfigProductos({ ...valido, productos: sinImagen })).toThrow(/imagen/);
  });
});
