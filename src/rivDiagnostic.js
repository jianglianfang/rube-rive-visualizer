/**
 * Diagnostic tool for .riv files.
 * Dumps all objects and their properties to help identify correct Core type keys.
 *
 * Usage: Import this in the browser and call `diagnoseRivFile(arrayBuffer)`
 * to get a structured dump of the file's contents.
 *
 * @module rivDiagnostic
 */

import { RivBinaryParser, CoreType, PropKey } from './rivBinaryParser.js';

/**
 * Reverse lookup maps for readable output.
 */
const typeKeyNames = new Map(Object.entries(CoreType).map(([k, v]) => [v, k]));
const propKeyNames = new Map(Object.entries(PropKey).map(([k, v]) => [v, k]));

/**
 * Analyze a .riv file and return a human-readable diagnostic report.
 * @param {ArrayBuffer} buffer
 * @returns {{summary: string, objects: Array, bindings: Array, viewModelProps: Array, geometries: Array}}
 */
export function diagnoseRivFile(buffer) {
  const parser = new RivBinaryParser();
  const result = parser.parse(buffer);

  const lines = [];
  lines.push(`=== .riv File Diagnostic ===`);
  lines.push(`Format: v${result.majorVersion}.${result.minorVersion}, FileID: ${result.fileId}`);
  lines.push(`Total objects: ${result.objects.length}`);
  lines.push(`Artboard: ${result.artboard.name} (${result.artboard.width} x ${result.artboard.height})`);
  lines.push(`Nodes: ${result.nodes.length}, Shapes: ${result.shapes.length}, Paths: ${result.paths.length}`);
  lines.push(`Vertices: ${result.vertices.length}`);
  lines.push(`ViewModels: ${result.viewModels.length}, DataBinds: ${result.dataBinds.length}`);
  lines.push('');

  // Type key histogram
  const typeHist = new Map();
  for (const obj of result.objects) {
    typeHist.set(obj.typeKey, (typeHist.get(obj.typeKey) || 0) + 1);
  }
  lines.push(`--- Object Type Histogram ---`);
  for (const [typeKey, count] of [...typeHist.entries()].sort((a, b) => a[0] - b[0])) {
    const name = typeKeyNames.get(typeKey) || '???';
    lines.push(`  Type ${typeKey} (${name}): ${count} objects`);
  }
  lines.push('');

  // List all objects with names
  lines.push(`--- Named Objects ---`);
  for (const obj of result.objects) {
    const name = obj.properties.get(PropKey.NAME) || obj.properties.get(4);
    if (name) {
      const typeName = typeKeyNames.get(obj.typeKey) || `type_${obj.typeKey}`;
      lines.push(`  #${obj.index} [${typeName}] "${name}"`);
    }
  }
  lines.push('');

  // DataBind analysis
  const bindings = parser.extractDataBindings(result);
  lines.push(`--- DataBind Contexts (${bindings.length}) ---`);
  for (const b of bindings) {
    const propName = propKeyNames.get(b.propertyKey) || `prop_${b.propertyKey}`;
    lines.push(`  #${b.objectIndex}: propertyKey=${b.propertyKey}(${propName}), target=${b.targetId}`);
    lines.push(`    raw: ${JSON.stringify(b.rawProperties)}`);
  }
  lines.push('');

  // ViewModel properties
  const vmProps = parser.extractViewModelProperties(result);
  lines.push(`--- ViewModel Properties (${vmProps.length}) ---`);
  for (const p of vmProps) {
    lines.push(`  #${p.objectIndex}: "${p.name}" (${p.type})`);
  }
  lines.push('');

  // Shape geometries
  const geometries = parser.extractShapeGeometry(result);
  lines.push(`--- Shape Geometries (${geometries.length}) ---`);
  for (const g of geometries) {
    const typeName = typeKeyNames.get(g.typeKey) || `type_${g.typeKey}`;
    lines.push(`  "${g.name}" [${typeName}]: pos=(${g.x.toFixed(1)}, ${g.y.toFixed(1)}), size=${g.width.toFixed(1)}x${g.height.toFixed(1)}, verts=${g.vertices.length}`);
  }

  const summary = lines.join('\n');

  return {
    summary,
    result,
    objects: result.objects.map(obj => ({
      index: obj.index,
      typeKey: obj.typeKey,
      typeName: typeKeyNames.get(obj.typeKey) || `unknown_${obj.typeKey}`,
      properties: Object.fromEntries(
        [...obj.properties.entries()].map(([k, v]) => [
          propKeyNames.get(k) || `prop_${k}`, v
        ])
      ),
    })),
    bindings,
    viewModelProps: vmProps,
    geometries,
  };
}

// Make available globally for console debugging
if (typeof window !== 'undefined') {
  window.diagnoseRivFile = diagnoseRivFile;
}
