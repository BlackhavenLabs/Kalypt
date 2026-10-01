import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { finding, Severity } from './model.js';

export const PLUGIN_API_VERSION = 1;
const VALID_SEVERITIES = new Set(Object.values(Severity));

export async function loadPlugins(paths = []) {
  const plugins = [];
  for (const input of paths) {
    const full = path.resolve(String(input));
    const mod = await import(`${pathToFileURL(full).href}?kalypt=${Date.now()}`);
    const plugin = mod.default ?? mod.plugin;
    validatePlugin(plugin, full);
    plugins.push(plugin);
  }
  return plugins;
}

export function definePlugin(plugin) {
  validatePlugin(plugin, plugin?.id ?? 'plugin');
  return Object.freeze({ ...plugin });
}

export function runPlugins(buffer, context, plugins = []) {
  const output = [];
  for (const plugin of plugins) {
    const results = plugin.inspect(buffer, Object.freeze({ ...context, apiVersion: PLUGIN_API_VERSION })) ?? [];
    if (!Array.isArray(results)) throw new Error(`Plugin ${plugin.id} inspect() must return an array`);
    for (const result of results) {
      if (!result || typeof result !== 'object') continue;
      const category = result.category ? `plugin.${plugin.id}.${result.category}` : `plugin.${plugin.id}.finding`;
      output.push(finding({
        severity: VALID_SEVERITIES.has(result.severity) ? result.severity : Severity.INFO,
        category,
        title: result.title ?? plugin.name,
        message: result.message ?? 'Plugin finding.',
        source: context.source,
        path: result.path,
        evidence: result.evidence,
        removable: false,
        confidence: Number.isFinite(result.confidence) ? result.confidence : 1,
        tags: ['plugin', plugin.id, ...(Array.isArray(result.tags) ? result.tags : [])]
      }));
    }
  }
  return output;
}

function validatePlugin(plugin, source) {
  if (!plugin || typeof plugin !== 'object') throw new Error(`Invalid Kalypt plugin from ${source}`);
  if (plugin.apiVersion !== PLUGIN_API_VERSION) throw new Error(`Plugin ${plugin.id ?? source} requires API ${plugin.apiVersion}; Kalypt supports ${PLUGIN_API_VERSION}`);
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(plugin.id ?? '')) throw new Error(`Plugin from ${source} has an invalid id`);
  if (typeof plugin.name !== 'string' || !plugin.name.trim()) throw new Error(`Plugin ${plugin.id} is missing a name`);
  if (typeof plugin.inspect !== 'function') throw new Error(`Plugin ${plugin.id} must export inspect(buffer, context)`);
}
